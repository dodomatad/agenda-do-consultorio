import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { chamarFuncao, supabase } from '../lib/supabase';
import type { FilaItem, StatusFila } from '../lib/types';
import { fmtData, fmtHora, fmtTelefone, hojeISO, tempoRelativo } from '../lib/utils';
import { Avatar, Empty, Icon, Modal, Segmented, Spinner } from '../components/ui';

const STATUS_FILA: Record<StatusFila, { label: string; cor: string; icone: string }> = {
  'na fila': { label: 'Na fila', cor: '#D4A017', icone: '⏳' },
  enviado: { label: 'Enviado', cor: '#2B8FD6', icone: '↗' },
  entregue: { label: 'Entregue', cor: '#127A6C', icone: '✓✓' },
  lido: { label: 'Lido', cor: '#5B3FC4', icone: '✓✓' },
  respondido: { label: 'Respondido', cor: '#25D366', icone: '💬' },
  erro: { label: 'Erro', cor: '#C43D3D', icone: '❌' },
  cancelado: { label: 'Cancelado', cor: '#6B7C85', icone: '⊘' },
  pulado: { label: 'Pulado (perdeu prazo)', cor: '#C43D3D', icone: '⚠️' },
};

const TIPO_LABEL: Record<string, { label: string; tag: string }> = {
  lembrete_consulta: { label: 'Lembrete de consulta', tag: '📅 Lembrete' },
  manutencao_aparelho: { label: 'Manutenção do aparelho', tag: '🦷 Aparelho' },
  remarcar_falta: { label: 'Remarcar falta', tag: '🚫 Falta' },
};

export default function FilaLembretes() {
  const s = useStore();
  const { cfg, versao, toast, bump, recarregar } = s;

  const [itens, setItens] = useState<FilaItem[] | null>(null);
  const [aba, setAba] = useState<'fila' | 'historico'>('fila');
  const [itemEditar, setItemEditar] = useState<FilaItem | null>(null);
  const [textoEdit, setTextoEdit] = useState('');
  const [processandoId, setProcessandoId] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  // Carrega itens da fila
  useEffect(() => {
    supabase
      .from('fila_lembretes')
      .select('*, pacientes(id, nome, telefone_whatsapp, aceita_whatsapp), consultas(id, data, hora_inicio, status, procedimento_id)')
      .order('prioridade', { ascending: true })
      .order('enviar_ate', { ascending: true })
      .limit(300)
      .then(({ data }) => setItens((data as FilaItem[]) ?? []));
  }, [versao]);

  // Contadores do topo
  const hoje = hojeISO();
  const naFila = useMemo(() => (itens ?? []).filter((i) => i.status === 'na fila'), [itens]);
  const enviadosHoje = useMemo(() => (itens ?? []).filter((i) => i.enviado_em && i.enviado_em.slice(0, 10) === hoje), [itens, hoje]);
  const respondidosHoje = useMemo(() => (itens ?? []).filter((i) => i.status === 'respondido' && (i.enviado_em?.slice(0, 10) === hoje || i.criado_em.slice(0, 10) === hoje)), [itens, hoje]);

  // Cálculo de capacidade / aviso de fila atrasada
  const calculoAtraso = useMemo(() => {
    if (!cfg || !naFila.length) return null;
    const intervaloMinutos = cfg.fila_intervalo_minutos || 60;
    const agora = new Date();

    // Simula envios a cada X minutos apenas em horário comercial
    let tempoEstimado = new Date(agora);
    let puladosPrevistos = 0;

    for (let idx = 0; idx < naFila.length; idx++) {
      const item = naFila[idx];
      tempoEstimado = new Date(tempoEstimado.getTime() + intervaloMinutos * 60 * 1000);
      const limite = new Date(item.enviar_ate);
      if (tempoEstimado > limite) {
        puladosPrevistos++;
      }
    }

    const horasTotais = (naFila.length * intervaloMinutos) / 60;
    const previsaoTerminoStr = tempoEstimado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) +
      (tempoEstimado.getDate() !== agora.getDate() ? ` de amanhã` : ` hoje`);

    return {
      puladosPrevistos,
      previsaoTerminoStr,
      horasTotais: horasTotais.toFixed(1),
    };
  }, [naFila, cfg]);

  // Projeção dos horários previstos para cada item na fila
  const filaComPrevisao = useMemo(() => {
    const intervaloMin = cfg?.fila_intervalo_minutos || 60;
    let base = new Date();
    return naFila.map((item, index) => {
      const previsto = new Date(base.getTime() + index * intervaloMin * 60 * 1000);
      const estourou = previsto > new Date(item.enviar_ate);
      return { ...item, previsto, estourou };
    });
  }, [naFila, cfg]);

  // Histórico
  const historico = useMemo(() => {
    return (itens ?? []).filter((i) => i.status !== 'na fila');
  }, [itens]);

  // Ações de controle da fila
  async function toggleFilaAtiva() {
    const novo = !cfg?.fila_ativa;
    const { error } = await supabase.from('configuracoes').update({ fila_ativa: novo }).eq('id', 1);
    if (error) return toast('Erro ao alterar status da fila', 'erro');
    toast(novo ? 'Fila retomada ✓' : 'Fila pausada ⏸️');
    recarregar();
  }

  async function mudarIntervalo(minutos: number) {
    const { error } = await supabase.from('configuracoes').update({ fila_intervalo_minutos: minutos }).eq('id', 1);
    if (error) return toast('Erro ao alterar intervalo', 'erro');
    toast(`Intervalo ajustado para ${minutos < 60 ? `${minutos} min` : `${minutos / 60}h${minutos % 60 ? ' 30' : ''}`}`);
    recarregar();
  }

  async function sincronizarAgora() {
    setSincronizando(true);
    try {
      await supabase.rpc('sincronizar_fila_lembretes');
      toast('Fila sincronizada com as consultas');
      bump();
    } catch {
      toast('Falha ao sincronizar fila', 'erro');
    } finally {
      setSincronizando(false);
    }
  }

  async function enviarAgora(item: FilaItem) {
    setProcessandoId(item.id);
    try {
      const r = await chamarFuncao('cron-fila-lembretes', { item_id: item.id });
      if (r.ok) {
        toast(`Lembrete enviado para ${item.pacientes?.nome || 'paciente'}`);
        bump();
      } else {
        toast(`Erro: ${r.erro || 'Falha no envio'}`, 'erro');
      }
    } catch (e: any) {
      toast('Erro de conexão ao enviar', 'erro');
    } finally {
      setProcessandoId(null);
    }
  }

  async function tirarDaFila(item: FilaItem) {
    const confirm = await s.confirmar(`Tirar o lembrete de ${item.pacientes?.nome} da fila?`, { ok: 'Tirar', perigo: true });
    if (!confirm) return;
    const { error } = await supabase.from('fila_lembretes').update({ status: 'cancelado', motivo: 'Removido manualmente pela atendente' }).eq('id', item.id);
    if (error) return toast('Erro ao remover da fila', 'erro');
    toast('Item removido da fila');
    bump();
  }

  async function salvarEdicaoTexto() {
    if (!itemEditar || !textoEdit.trim()) return;
    const { error } = await supabase.from('fila_lembretes').update({ texto_final: textoEdit.trim() }).eq('id', itemEditar.id);
    if (error) return toast('Erro ao salvar texto', 'erro');
    toast('Mensagem atualizada');
    setItemEditar(null);
    bump();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1><Icon n="fila" s={28} className="wa-txt" /> Fila de Lembretes</h1>
          <p className="muted">Envio gradual e humanizado pelo WhatsApp, imitando o ritmo de uma atendente.</p>
        </div>
        <div className="head-acoes">
          <button className={`btn ${cfg?.fila_ativa ? 'ghost' : 'primary'}`} onClick={toggleFilaAtiva}>
            <Icon n={cfg?.fila_ativa ? 'pause' : 'play'} s={18} />
            {cfg?.fila_ativa ? 'Pausar fila' : 'Retomar fila'}
          </button>
          <button className="btn ghost" disabled={sincronizando} onClick={sincronizarAgora}>
            🔄 {sincronizando ? 'Atualizando…' : 'Atualizar fila'}
          </button>
        </div>
      </header>

      {/* Contadores e métricas */}
      <div className="resumo-fila card">
        <div className="metricas-grid">
          <div className="metrica-item">
            <span className="metrica-num font-display">{naFila.length}</span>
            <span className="metrica-rotulo">Na fila</span>
          </div>
          <div className="metrica-item ok">
            <span className="metrica-num font-display">{enviadosHoje.length}</span>
            <span className="metrica-rotulo">Enviados hoje</span>
          </div>
          <div className="metrica-item wa">
            <span className="metrica-num font-display">{respondidosHoje.length}</span>
            <span className="metrica-rotulo">Respondidos</span>
          </div>
          <div className="metrica-item">
            <span className="metrica-num font-display" style={{ fontSize: '1.25rem', marginTop: 4 }}>
              {calculoAtraso ? calculoAtraso.previsaoTerminoStr : '—'}
            </span>
            <span className="metrica-rotulo">Previsão de término</span>
          </div>
        </div>

        {/* Controle do ritmo de envio */}
        <div className="fila-controles-ritmo">
          <div className="ritmo-info">
            <b>Ritmo de envio:</b>
            <span className="muted">Uma mensagem a cada</span>
            <select
              value={cfg?.fila_intervalo_minutos ?? 60}
              onChange={(e) => mudarIntervalo(Number(e.target.value))}
              className="select-ritmo"
            >
              <option value={30}>30 minutos</option>
              <option value={60}>1 hora (padrão)</option>
              <option value={90}>1 hora e 30 min</option>
              <option value={120}>2 horas</option>
            </select>
            <small className="muted">(com leve variação aleatória de minutos para não parecer robótico)</small>
          </div>

          <div className="status-fila-tag">
            <span className={`pulso ${cfg?.fila_ativa ? 'pulso-verde' : 'pulso-amarelo'}`} />
            <b>{cfg?.fila_ativa ? 'Fila em andamento' : 'Fila pausada'}</b>
          </div>
        </div>
      </div>

      {/* Alerta de Fila Atrasada */}
      {calculoAtraso && calculoAtraso.puladosPrevistos > 0 && (
        <div className="banner vermelho fade" style={{ margin: '16px 0' }}>
          <div>
            ⚠️ <b>Atenção com a fila:</b> No ritmo atual de 1 mensagem a cada {cfg?.fila_intervalo_minutos || 60} minutos,{' '}
            <b>{calculoAtraso.puladosPrevistos} lembrete(s) não vão sair a tempo</b> antes da consulta.
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
            <span>Diminua o intervalo para 30 minutos ou envie manualmente agora os primeiros da fila.</span>
            <button className="btn sm primary" onClick={() => mudarIntervalo(30)}>Ajustar para 30 min</button>
          </div>
        </div>
      )}

      {/* Navegação entre Fila Ativa e Histórico */}
      <div style={{ margin: '20px 0 14px' }}>
        <Segmented
          value={aba}
          onChange={setAba}
          options={[
            { v: 'fila', l: `⏳ Próximos a sair (${naFila.length})` },
            { v: 'historico', l: `📋 Histórico de envios (${historico.length})` },
          ]}
        />
      </div>

      {!itens ? (
        <Spinner />
      ) : aba === 'fila' ? (
        naFila.length === 0 ? (
          <Empty
            emoji="✨"
            titulo="Nenhum lembrete na fila"
            texto="Todos os lembretes para as próximas consultas já foram enviados ou ainda não entraram na janela de agendamento."
            acao={
              <button className="btn ghost" onClick={sincronizarAgora}>
                🔄 Sincronizar consultas agora
              </button>
            }
          />
        ) : (
          <div className="card fila-tabela-card fade">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Ordem</th>
                  <th>Horário previsto</th>
                  <th>Paciente</th>
                  <th>Tipo / Motivo</th>
                  <th>Data da consulta</th>
                  <th>Mensagem</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filaComPrevisao.map((item, index) => {
                  const pac = item.pacientes;
                  const c = item.consultas;
                  const proc = s.procedimentos.find((p) => p.id === c?.procedimento_id);
                  const tipo = TIPO_LABEL[item.tipo] || { label: item.tipo, tag: 'Lembrete' };

                  return (
                    <tr key={item.id} className={item.estourou ? 'linha-estourada' : ''}>
                      <td>
                        <span className={`ordem-badge ${index === 0 ? 'proximo' : ''}`}>
                          {index === 0 ? '▶ Próximo' : `#${index + 1}`}
                        </span>
                      </td>
                      <td>
                        <b className="font-display">
                          {item.previsto.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </b>
                        <br />
                        <small className="muted">
                          {item.previsto.getDate() === new Date().getDate() ? 'Hoje' : fmtData(item.previsto.toISOString().slice(0, 10))}
                        </small>
                        {item.estourou && <small className="vermelho-txt" style={{ display: 'block' }}>⚠️ Risco de atraso</small>}
                      </td>
                      <td>
                        <div className="td-nome" onClick={() => pac && s.abrirPaciente(pac.id)}>
                          <Avatar nome={pac?.nome || 'Paciente'} tam={30} />
                          <div>
                            <b>{pac?.nome}</b>
                            <small className="muted" style={{ display: 'block' }}>
                              {fmtTelefone(pac?.telefone_whatsapp)}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="tag-tipo">{tipo.tag}</span>
                      </td>
                      <td>
                        {c ? (
                          <div>
                            <b>{fmtData(c.data)} às {fmtHora(c.hora_inicio)}</b>
                            <small className="muted" style={{ display: 'block' }}>
                              {proc?.nome || 'Consulta'}
                            </small>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td style={{ maxWidth: 280 }}>
                        <p className="texto-msg-preview" title={item.texto_final}>
                          {item.texto_final}
                        </p>
                      </td>
                      <td>
                        <div className="acoes-fila">
                          <button
                            className="btn sm wa"
                            disabled={processandoId === item.id}
                            onClick={() => enviarAgora(item)}
                            title="Enviar esta mensagem agora mesmo"
                          >
                            <Icon n="envio" s={14} /> Enviar agora
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => { setItemEditar(item); setTextoEdit(item.texto_final); }}
                            title="Editar texto da mensagem"
                          >
                            <Icon n="lapis" s={15} />
                          </button>
                          <button
                            className="icon-btn danger"
                            onClick={() => tirarDaFila(item)}
                            title="Tirar da fila de envio"
                          >
                            <Icon n="x" s={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Aba Histórico de Envios */
        historico.length === 0 ? (
          <Empty emoji="📭" titulo="Nenhum histórico recente" texto="Os lembretes disparados e suas respostas aparecerão aqui." />
        ) : (
          <div className="card fila-tabela-card fade">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Enviado em</th>
                  <th>Paciente</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Mensagem enviada</th>
                  <th>Resposta do paciente</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((item) => {
                  const st = STATUS_FILA[item.status] || { label: item.status, cor: '#6B7C85', icone: '•' };
                  const pac = item.pacientes;
                  const tipo = TIPO_LABEL[item.tipo] || { label: item.tipo, tag: 'Lembrete' };

                  return (
                    <tr key={item.id}>
                      <td>
                        <small className="muted font-display">
                          {item.enviado_em ? tempoRelativo(item.enviado_em) : fmtData(item.criado_em.slice(0, 10))}
                        </small>
                      </td>
                      <td>
                        <div className="td-nome" onClick={() => pac && s.abrirPaciente(pac.id)}>
                          <Avatar nome={pac?.nome || 'Paciente'} tam={28} />
                          <span>{pac?.nome}</span>
                        </div>
                      </td>
                      <td>
                        <span className="tag-tipo">{tipo.tag}</span>
                      </td>
                      <td>
                        <span className="status-pill" style={{ ['--c' as any]: st.cor }}>
                          {st.icone} {st.label}
                        </span>
                        {item.motivo && <small className="muted" style={{ display: 'block', fontSize: '0.72rem' }}>{item.motivo}</small>}
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        <p className="texto-msg-preview" title={item.texto_final}>{item.texto_final}</p>
                      </td>
                      <td>
                        {item.resposta_paciente ? (
                          <div className="resposta-badge">
                            💬 “{item.resposta_paciente}”
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Modal de Edição de Mensagem do Item */}
      {itemEditar && (
        <Modal
          titulo={`Editar mensagem para ${itemEditar.pacientes?.nome || 'paciente'}`}
          onClose={() => setItemEditar(null)}
          largura={560}
          rodape={
            <>
              <button className="btn ghost" onClick={() => setItemEditar(null)}>Cancelar</button>
              <button className="btn primary" onClick={salvarEdicaoTexto}>Salvar alteração</button>
            </>
          }
        >
          <label className="field">
            <span>Texto do WhatsApp</span>
            <textarea
              rows={6}
              value={textoEdit}
              onChange={(e) => setTextoEdit(e.target.value)}
            />
          </label>
          <div className="bolha-wrap">
            <div className="bolha">{textoEdit}</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
