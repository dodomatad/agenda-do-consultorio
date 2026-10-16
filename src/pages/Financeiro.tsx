import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { FormaPagamento, StatusTransacao, TipoTransacao, TransacaoFinanceira } from '../lib/types';
import { addDias, addMeses, cls, fmtCpf, fmtData, fmtMoeda, fmtTelefone, fromISO, hojeISO, inicioSemana, toISO } from '../lib/utils';
import { baixarCsv } from '../lib/csv';
import { Avatar, Empty, Icon, Modal, Segmented, Spinner } from '../components/ui';

type PeriodoTipo = 'hoje' | 'semana' | 'mes' | 'mes_anterior' | 'personalizado';

const FORMAS_LABEL: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão Crédito',
  cartao_debito: 'Cartão Débito',
  boleto: 'Boleto',
  convenio: 'Convênio',
};

const STATUS_LABEL: Record<StatusTransacao, { label: string; cor: string; bg: string }> = {
  pago: { label: 'Pago', cor: '#03543F', bg: '#DEF7EC' },
  pendente: { label: 'Pendente', cor: '#723B10', bg: '#FDF6B2' },
  cancelado: { label: 'Cancelado', cor: '#9B1C1C', bg: '#FDE8E8' },
};

export default function Financeiro() {
  const { versao, profissionais, abrirTransacaoForm, abrirPaciente, toast, confirmar, isAdmin, bump } = useStore();

  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>('mes');
  const [dataRef, setDataRef] = useState<string>(hojeISO());
  const [dataDe, setDataDe] = useState<string>(() => {
    const hoje = new Date();
    return toISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  });
  const [dataAte, setDataAte] = useState<string>(() => {
    const hoje = new Date();
    return toISO(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));
  });

  const [transacoes, setTransacoes] = useState<TransacaoFinanceira[] | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Filtros
  const [busca, setBusca] = useState('');
  const [fTipo, setFTipo] = useState<'todos' | TipoTransacao>('todos');
  const [fCategoria, setFCategoria] = useState<string>('todas');
  const [fForma, setFForma] = useState<string>('todas');
  const [fStatus, setFStatus] = useState<string>('todos');
  const [fProfissional, setFProfissional] = useState<string>('todos');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Define datas de início e fim conforme período
  const [dtIni, dtFim] = useMemo(() => {
    if (periodoTipo === 'hoje') {
      return [dataRef, dataRef];
    }
    if (periodoTipo === 'semana') {
      const ini = inicioSemana(dataRef);
      return [ini, addDias(ini, 6)];
    }
    if (periodoTipo === 'mes') {
      const d = fromISO(dataRef);
      const ini = toISO(new Date(d.getFullYear(), d.getMonth(), 1));
      const fim = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      return [ini, fim];
    }
    if (periodoTipo === 'mes_anterior') {
      const d = fromISO(dataRef);
      const ini = toISO(new Date(d.getFullYear(), d.getMonth() - 1, 1));
      const fim = toISO(new Date(d.getFullYear(), d.getMonth(), 0));
      return [ini, fim];
    }
    return [dataDe || hojeISO(), dataAte || hojeISO()];
  }, [periodoTipo, dataRef, dataDe, dataAte]);

  // Navegação anterior / próximo
  function navegarPeriodo(dir: number) {
    if (periodoTipo === 'hoje') {
      setDataRef(addDias(dataRef, dir));
    } else if (periodoTipo === 'semana') {
      setDataRef(addDias(dataRef, dir * 7));
    } else if (periodoTipo === 'mes' || periodoTipo === 'mes_anterior') {
      setDataRef(addMeses(dataRef, dir));
    }
  }

  // Carregar dados do banco por período
  useEffect(() => {
    let ativo = true;
    setCarregando(true);

    supabase
      .from('transacoes_financeiras')
      .select('*, pacientes(id, nome, telefone_whatsapp, cpf), profissionais(id, nome, cor), consultas(id, data, hora_inicio, status, procedimento_id)')
      .gte('data_competencia', dtIni)
      .lte('data_competencia', dtFim)
      .order('data_competencia', { ascending: false })
      .order('criado_em', { ascending: false })
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) {
          toast('Erro ao buscar dados financeiros: ' + error.message, 'erro');
          setTransacoes([]);
        } else {
          setTransacoes((data as TransacaoFinanceira[]) ?? []);
        }
        setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [dtIni, dtFim, versao]);

  // Lista filtrada
  const filtradas = useMemo(() => {
    return (transacoes ?? []).filter((t) => {
      if (fTipo !== 'todos' && t.tipo !== fTipo) return false;
      if (fCategoria !== 'todas' && t.categoria !== fCategoria) return false;
      if (fForma !== 'todas' && t.forma_pagamento !== fForma) return false;
      if (fStatus !== 'todos' && t.status !== fStatus) return false;
      if (fProfissional !== 'todos' && t.profissional_id !== fProfissional) return false;

      if (busca.trim()) {
        const q = busca.trim().toLowerCase();
        const descMatch = (t.descricao || '').toLowerCase().includes(q);
        const pacMatch = (t.pacientes?.nome || '').toLowerCase().includes(q);
        const catMatch = (t.categoria || '').toLowerCase().includes(q);
        if (!descMatch && !pacMatch && !catMatch) return false;
      }

      return true;
    });
  }, [transacoes, fTipo, fCategoria, fForma, fStatus, fProfissional, busca]);

  // Totais financeiros (calculados em centavos para exatidão contábil)
  const totais = useMemo(() => {
    let entradasCentavos = 0;
    let saidasCentavos = 0;
    let pendentesCentavos = 0;

    for (const t of filtradas) {
      const centavos = Math.round(Number(t.valor) * 100);
      if (t.status === 'pago') {
        if (t.tipo === 'receita') {
          entradasCentavos += centavos;
        } else if (t.tipo === 'despesa') {
          saidasCentavos += centavos;
        }
      } else if (t.status === 'pendente' && t.tipo === 'receita') {
        pendentesCentavos += centavos;
      }
    }

    const entradas = entradasCentavos / 100;
    const saidas = saidasCentavos / 100;
    const saldo = (entradasCentavos - saidasCentavos) / 100;
    const aReceber = pendentesCentavos / 100;

    return { entradas, saidas, saldo, aReceber };
  }, [filtradas]);

  // Dados para o Gráfico Diário de Barras Entradas x Saídas
  const dadosGrafico = useMemo(() => {
    const mapa: Record<string, { data: string; entradas: number; saidas: number }> = {};

    for (const t of filtradas) {
      if (t.status !== 'pago') continue;
      const dia = t.data_competencia;
      if (!mapa[dia]) {
        mapa[dia] = { data: dia, entradas: 0, saidas: 0 };
      }
      if (t.tipo === 'receita') {
        mapa[dia].entradas += Number(t.valor);
      } else if (t.tipo === 'despesa') {
        mapa[dia].saidas += Number(t.valor);
      }
    }

    const lista = Object.values(mapa).sort((a, b) => a.data.localeCompare(b.data));
    const maxVal = Math.max(1, ...lista.map((x) => Math.max(x.entradas, x.saidas)));
    return { lista, maxVal };
  }, [filtradas]);

  // Categorias disponíveis na lista para o filtro
  const categoriasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const t of transacoes ?? []) {
      if (t.categoria) set.add(t.categoria);
    }
    return Array.from(set).sort();
  }, [transacoes]);

  // Ações nas transações
  async function marcarComoPago(t: TransacaoFinanceira) {
    const ok = await confirmar(`Confirmar o recebimento de ${fmtMoeda(Number(t.valor))} em nome de "${t.descricao}"?`, {
      ok: 'Marcar como Pago',
    });
    if (!ok) return;

    const { error } = await supabase
      .from('transacoes_financeiras')
      .update({ status: 'pago', data_pagamento: hojeISO() })
      .eq('id', t.id);

    if (error) {
      toast('Erro ao atualizar: ' + error.message, 'erro');
    } else {
      toast('Lançamento marcado como pago ✓');
      bump();
    }
  }

  async function cancelarTransacao(t: TransacaoFinanceira) {
    const ok = await confirmar(`Tem certeza que deseja cancelar o lançamento "${t.descricao}" de ${fmtMoeda(Number(t.valor))}?`, {
      ok: 'Cancelar Lançamento',
      perigo: true,
    });
    if (!ok) return;

    const { error } = await supabase
      .from('transacoes_financeiras')
      .update({ status: 'cancelado' })
      .eq('id', t.id);

    if (error) {
      toast('Erro ao cancelar: ' + error.message, 'erro');
    } else {
      toast('Lançamento cancelado');
      bump();
    }
  }

  async function excluirPermanente(t: TransacaoFinanceira) {
    if (!isAdmin) return;
    const ok = await confirmar(`Excluir permanentemente o registro de "${t.descricao}"? Esta ação remove o histórico do banco.`, {
      ok: 'Excluir Definitivamente',
      perigo: true,
    });
    if (!ok) return;

    const { error } = await supabase.from('transacoes_financeiras').delete().eq('id', t.id);
    if (error) {
      toast('Erro ao excluir: ' + error.message, 'erro');
    } else {
      toast('Registro excluído');
      bump();
    }
  }

  // Exportar CSV compatível com Excel (UTF-8 com BOM e ponto-e-vírgula via helper)
  function exportarCsv() {
    if (!filtradas.length) {
      toast('Nenhum dado para exportar', 'info');
      return;
    }

    const cabecalho = [
      { label: 'Data Competência', tipo: 'data' as const },
      { label: 'Data Pagamento', tipo: 'data' as const },
      { label: 'Tipo', tipo: 'texto' as const },
      { label: 'Categoria', tipo: 'texto' as const },
      { label: 'Descrição', tipo: 'texto' as const },
      { label: 'Paciente', tipo: 'texto' as const },
      { label: 'CPF', tipo: 'texto' as const },
      { label: 'Profissional', tipo: 'texto' as const },
      { label: 'Forma Pagamento', tipo: 'texto' as const },
      { label: 'Status', tipo: 'texto' as const },
      { label: 'Valor (R$)', tipo: 'numero' as const },
    ];

    const linhas = filtradas.map((t) => {
      const tipoStr = t.tipo === 'receita' ? 'Receita' : 'Despesa';
      const statusStr = STATUS_LABEL[t.status]?.label ?? t.status;
      const formaStr = t.forma_pagamento ? (FORMAS_LABEL[t.forma_pagamento] ?? t.forma_pagamento) : '';
      const pacStr = t.pacientes?.nome ?? '';
      const cpfStr = t.pacientes?.cpf ? fmtCpf(t.pacientes.cpf) : '';
      const profStr = t.profissionais?.nome ?? '';
      const valStr = Number(t.valor).toFixed(2).replace('.', ',');

      return [
        fmtData(t.data_competencia),
        fmtData(t.data_pagamento) || '',
        tipoStr,
        t.categoria || '',
        t.descricao || '',
        pacStr,
        cpfStr,
        profStr,
        formaStr,
        statusStr,
        valStr,
      ];
    });

    baixarCsv(`financeiro_odontoclin_${dtIni}_a_${dtFim}`, cabecalho, linhas);
    toast('Relatório CSV exportado com sucesso');
  }

  const nFiltrosAtivos =
    (fTipo !== 'todos' ? 1 : 0) +
    (fCategoria !== 'todas' ? 1 : 0) +
    (fForma !== 'todas' ? 1 : 0) +
    (fStatus !== 'todos' ? 1 : 0) +
    (fProfissional !== 'todos' ? 1 : 0);

  return (
    <div className="page financeiro-page">
      {/* Cabeçalho da Página */}
      <header className="page-head">
        <div>
          <h1>Financeiro</h1>
          <p className="muted">Controle de caixa, receitas, despesas e pagamentos da clínica.</p>
        </div>
        <div className="head-acoes">
          <button className="btn ghost" type="button" onClick={exportarCsv} title="Exportar dados para Excel (CSV)">
            <Icon n="download" s={16} /> Exportar CSV
          </button>
          <button
            className="btn success"
            type="button"
            onClick={() => abrirTransacaoForm({ tipo: 'receita' })}
          >
            <Icon n="mais" s={18} /> Nova Receita
          </button>
          <button
            className="btn danger"
            type="button"
            onClick={() => abrirTransacaoForm({ tipo: 'despesa' })}
          >
            <Icon n="mais" s={18} /> Nova Despesa
          </button>
        </div>
      </header>

      {/* Barra de Período e Navegação */}
      <div className="fin-periodo-bar card">
        <div className="fin-periodo-controles">
          <Segmented
            value={periodoTipo}
            onChange={(v) => setPeriodoTipo(v as PeriodoTipo)}
            options={[
              { v: 'hoje', l: 'Hoje' },
              { v: 'semana', l: 'Semana' },
              { v: 'mes', l: 'Mês' },
              { v: 'mes_anterior', l: 'Mês anterior' },
              { v: 'personalizado', l: 'Personalizado' },
            ]}
          />

          {periodoTipo !== 'personalizado' ? (
            <div className="nav-data" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="icon-btn" onClick={() => navegarPeriodo(-1)} aria-label="Anterior">
                <Icon n="esq" />
              </button>
              <button className="btn ghost sm" onClick={() => setDataRef(hojeISO())}>
                Hoje
              </button>
              <button className="icon-btn" onClick={() => navegarPeriodo(1)} aria-label="Próximo">
                <Icon n="dir" />
              </button>
              <span className="fin-periodo-label font-display" style={{ fontWeight: 600, marginLeft: 8 }}>
                {fmtData(dtIni)} {dtIni !== dtFim && `até ${fmtData(dtFim)}`}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem' }}>
                <span>De:</span>
                <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem' }}>
                <span>Até:</span>
                <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Cards de Métricas Principais (KPIs) */}
      <div className="fin-kpi-grid">
        <div className="card fin-kpi-card entrada">
          <div className="kpi-icone">📈</div>
          <div>
            <span className="kpi-titulo">Entradas (Pagas)</span>
            <b className="kpi-valor font-display" style={{ color: '#0E9F6E' }}>
              {fmtMoeda(totais.entradas)}
            </b>
          </div>
        </div>

        <div className="card fin-kpi-card saida">
          <div className="kpi-icone">📉</div>
          <div>
            <span className="kpi-titulo">Saídas (Pagas)</span>
            <b className="kpi-valor font-display" style={{ color: '#E02424' }}>
              {fmtMoeda(totais.saidas)}
            </b>
          </div>
        </div>

        <div className="card fin-kpi-card saldo">
          <div className="kpi-icone">🏦</div>
          <div>
            <span className="kpi-titulo">Saldo Líquido</span>
            <b
              className="kpi-valor font-display"
              style={{ color: totais.saldo >= 0 ? '#0E9F6E' : '#E02424' }}
            >
              {fmtMoeda(totais.saldo)}
            </b>
          </div>
        </div>

        <div className="card fin-kpi-card pendente">
          <div className="kpi-icone">⏳</div>
          <div>
            <span className="kpi-titulo">A Receber (Pendentes)</span>
            <b className="kpi-valor font-display" style={{ color: '#D97706' }}>
              {fmtMoeda(totais.aReceber)}
            </b>
          </div>
        </div>
      </div>

      {/* Gráfico Diário de Entradas x Saídas (Puro SVG / CSS) */}
      {dadosGrafico.lista.length > 0 && (
        <section className="card fin-grafico-card fade">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Fluxo Diário do Período (Entradas vs Saídas)</h3>
            <div style={{ display: 'flex', gap: 14, fontSize: '0.8rem', color: 'var(--muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <i style={{ width: 10, height: 10, borderRadius: 2, background: '#0E9F6E', display: 'inline-block' }} /> Entradas
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <i style={{ width: 10, height: 10, borderRadius: 2, background: '#E02424', display: 'inline-block' }} /> Saídas
              </span>
            </div>
          </div>

          <div className="fin-grafico-container">
            {dadosGrafico.lista.map((item) => {
              const altEntrada = Math.round((item.entradas / dadosGrafico.maxVal) * 100);
              const altSaida = Math.round((item.saidas / dadosGrafico.maxVal) * 100);

              return (
                <div key={item.data} className="fin-grafico-barra-col" title={`${fmtData(item.data)}\nEntradas: ${fmtMoeda(item.entradas)}\nSaídas: ${fmtMoeda(item.saidas)}`}>
                  <div className="fin-barras-dupla">
                    <div
                      className="fin-barra entrada"
                      style={{ height: `${altEntrada}%`, minHeight: item.entradas > 0 ? 4 : 0 }}
                    />
                    <div
                      className="fin-barra saida"
                      style={{ height: `${altSaida}%`, minHeight: item.saidas > 0 ? 4 : 0 }}
                    />
                  </div>
                  <span className="fin-grafico-dia">{fmtData(item.data).slice(0, 5)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Busca e Barra de Filtros */}
      <div className="fin-filtros-bar">
        <div className="busca-grande" style={{ margin: 0, flex: 1 }}>
          <Icon n="busca" />
          <input
            placeholder="Buscar por descrição, paciente ou categoria…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {busca && (
            <button className="icon-btn" onClick={() => setBusca('')}>
              <Icon n="x" s={16} />
            </button>
          )}
        </div>

        <button
          className={cls('btn ghost', nFiltrosAtivos > 0 && 'ativo')}
          onClick={() => setMostrarFiltros(!mostrarFiltros)}
        >
          <Icon n="filtro" s={16} /> Filtros {nFiltrosAtivos > 0 && `(${nFiltrosAtivos})`}
        </button>
      </div>

      {mostrarFiltros && (
        <div className="filtros fade card" style={{ padding: 12, marginTop: 10 }}>
          <select value={fTipo} onChange={(e) => setFTipo(e.target.value as any)}>
            <option value="todos">Todos os tipos (Receitas e Despesas)</option>
            <option value="receita">Apenas Receitas</option>
            <option value="despesa">Apenas Despesas</option>
          </select>

          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="todos">Todos os status</option>
            <option value="pago">✓ Pago</option>
            <option value="pendente">⏳ Pendente</option>
            <option value="cancelado">⊘ Cancelado</option>
          </select>

          <select value={fForma} onChange={(e) => setFForma(e.target.value)}>
            <option value="todas">Todas as formas de pagamento</option>
            {Object.entries(FORMAS_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>

          {categoriasDisponiveis.length > 0 && (
            <select value={fCategoria} onChange={(e) => setFCategoria(e.target.value)}>
              <option value="todas">Todas as categorias</option>
              {categoriasDisponiveis.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          )}

          {profissionais.length > 0 && (
            <select value={fProfissional} onChange={(e) => setFProfissional(e.target.value)}>
              <option value="todos">Todos os profissionais</option>
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          )}

          {nFiltrosAtivos > 0 && (
            <button
              className="btn ghost sm"
              onClick={() => {
                setFTipo('todos');
                setFCategoria('todas');
                setFForma('todas');
                setFStatus('todos');
                setFProfissional('todos');
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Listagem / Tabela de Lançamentos */}
      {carregando ? (
        <Spinner />
      ) : filtradas.length === 0 ? (
        <Empty
          emoji="💳"
          titulo="Nenhum lançamento encontrado"
          texto={
            transacoes?.length === 0
              ? 'Não há registros financeiros para este período. Registre uma nova receita ou despesa!'
              : 'Tente alterar os termos de busca ou limpar os filtros.'
          }
          acao={
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={() => abrirTransacaoForm({ tipo: 'receita' })}>
                + Nova Receita
              </button>
              <button className="btn danger" onClick={() => abrirTransacaoForm({ tipo: 'despesa' })}>
                + Nova Despesa
              </button>
            </div>
          }
        />
      ) : (
        <div className="card fin-tabela-card fade" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="fin-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo / Categoria</th>
                <th>Descrição</th>
                <th>Paciente / Profissional</th>
                <th>Forma</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th>Status</th>
                <th style={{ textAlign: 'center', width: 110 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((t) => {
                const isReceita = t.tipo === 'receita';
                const stInfo = STATUS_LABEL[t.status] ?? STATUS_LABEL.pago;

                return (
                  <tr key={t.id} className={cls(t.status === 'cancelado' && 'linha-cancelada')}>
                    <td>
                      <b className="font-display">{fmtData(t.data_competencia)}</b>
                      {t.data_pagamento && t.status === 'pago' && t.data_pagamento !== t.data_competencia && (
                        <small className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                          Pago: {fmtData(t.data_pagamento)}
                        </small>
                      )}
                    </td>

                    <td>
                      <span
                        className="pill pill-sm"
                        style={{
                          background: isReceita ? 'rgba(14, 159, 110, 0.12)' : 'rgba(224, 36, 36, 0.12)',
                          color: isReceita ? '#0E9F6E' : '#E02424',
                          fontWeight: 600,
                        }}
                      >
                        {isReceita ? '↑' : '↓'} {t.categoria}
                      </span>
                    </td>

                    <td>
                      <b>{t.descricao}</b>
                    </td>

                    <td>
                      {t.pacientes ? (
                        <div
                          className="td-nome"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                          onClick={() => abrirPaciente(t.pacientes!.id)}
                          title="Abrir ficha do paciente"
                        >
                          <Avatar nome={t.pacientes.nome} tam={24} />
                          <span>{t.pacientes.nome}</span>
                        </div>
                      ) : t.profissionais ? (
                        <small className="muted">{t.profissionais.nome}</small>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    <td>
                      <span className="muted" style={{ fontSize: '0.85rem' }}>
                        {t.forma_pagamento ? FORMAS_LABEL[t.forma_pagamento] ?? t.forma_pagamento : '—'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <b
                        className="font-display"
                        style={{
                          color:
                            t.status === 'cancelado'
                              ? 'var(--muted)'
                              : isReceita
                              ? '#0E9F6E'
                              : '#E02424',
                        }}
                      >
                        {isReceita ? '+' : '-'} {fmtMoeda(Number(t.valor))}
                      </b>
                    </td>

                    <td>
                      <span
                        className="pill pill-sm"
                        style={{ background: stInfo.bg, color: stInfo.cor, fontWeight: 600 }}
                      >
                        {stInfo.label}
                      </span>
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        {t.status === 'pendente' && (
                          <button
                            className="icon-btn"
                            onClick={() => marcarComoPago(t)}
                            title="Marcar como Pago"
                            style={{ color: '#0E9F6E' }}
                          >
                            <Icon n="check" s={16} />
                          </button>
                        )}

                        <button
                          className="icon-btn"
                          onClick={() => abrirTransacaoForm({ id: t.id })}
                          title="Editar lançamento"
                        >
                          <Icon n="lapis" s={15} />
                        </button>

                        {t.status !== 'cancelado' && (
                          <button
                            className="icon-btn danger"
                            onClick={() => cancelarTransacao(t)}
                            title="Cancelar lançamento"
                          >
                            <Icon n="x" s={15} />
                          </button>
                        )}

                        {isAdmin && (
                          <button
                            className="icon-btn danger"
                            onClick={() => excluirPermanente(t)}
                            title="Excluir do banco"
                          >
                            <Icon n="lixo" s={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
