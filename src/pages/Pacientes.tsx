import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { Paciente } from '../lib/types';
import { cls, cpfMascarado, fmtCpf, fmtData, fmtHora, fmtTelefone, hojeISO, MESES, sanitizarTermoBusca } from '../lib/utils';
import { baixarCsv, ColunaConfig } from '../lib/csv';
import { Avatar, Empty, Icon, Pill, Pills, Segmented, Spinner } from '../components/ui';
import { ImportarPacientesModal } from '../components/ImportarPacientesModal';

type Resumo = { proxima?: { data: string; hora_inicio: string }; ultima?: string };

export default function Pacientes() {
  const s = useStore();
  const { etiquetas, versao } = s;
  const [lista, setLista] = useState<Paciente[] | null>(null);
  const [resumo, setResumo] = useState<Record<string, Resumo>>({});
  const [busca, setBusca] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');
  const [modo, setModo] = useState<'cartoes' | 'tabela'>(window.innerWidth < 760 ? 'cartoes' : 'cartoes');
  const [tagsSel, setTagsSel] = useState<string[]>([]);
  const [fAparelho, setFAparelho] = useState(false);
  const [fSemConsulta, setFSemConsulta] = useState(false);
  const [fAniver, setFAniver] = useState(false);
  const [fAtrasados, setFAtrasados] = useState(false); // Pacientes que faltaram ou passaram do dia

  type ConsultaInfo = { data: string; hora_inicio: string; status: string };
  const [detalhesConsultas, setDetalhesConsultas] = useState<Record<string, ConsultaInfo[]>>({});
  const PAGE_SIZE = 50;
  const [limite, setLimite] = useState(PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [modalImportar, setModalImportar] = useState(false);

  // Debounce da busca digitada
  useEffect(() => {
    const t = setTimeout(() => {
      setBuscaDebounced(busca);
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Ao alterar filtros ou busca, reseta para a primeira página
  useEffect(() => {
    setLimite(PAGE_SIZE);
  }, [buscaDebounced, tagsSel, fAparelho, fSemConsulta, fAniver, fAtrasados]);

  // Constrói a query no servidor com os filtros ativos
  function montarQuery(view = 'vw_pacientes_resumo') {
    let q = supabase.from(view).select('*', { count: 'exact' });
    q = q.eq('ativo', true);

    const termo = sanitizarTermoBusca(buscaDebounced);
    if (termo) {
      const dig = termo.replace(/\D/g, '');
      if (dig.length >= 3) {
        q = q.or(`nome.ilike.%${termo}%,telefone_whatsapp.ilike.%${dig}%,cpf.ilike.%${dig}%`);
      } else {
        q = q.ilike('nome', `%${termo}%`);
      }
    }

    if (fAparelho) q = q.eq('usa_aparelho', true);
    if (fAniver) {
      const mesAtual = new Date().getMonth() + 1;
      q = q.eq('mes_aniversario', mesAtual);
    }
    if (fSemConsulta) q = q.eq('tem_consulta_futura', false);
    if (fAtrasados) q = q.eq('atrasado', true);
    if (tagsSel.length > 0) q = q.contains('etiquetas_ids', tagsSel);

    return q.order('nome');
  }

  // Carregamento principal no servidor
  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCarregandoMais(true);
      const hoje = hojeISO();

      // Tenta consultar a view do servidor
      let { data, count, error } = await montarQuery('vw_pacientes_resumo').range(0, limite - 1);

      // Fallback caso a view ainda não tenha sido criada no banco
      if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
        let qFallback = supabase
          .from('pacientes')
          .select('*, paciente_etiquetas(etiqueta_id)', { count: 'exact' })
          .eq('ativo', true)
          .order('nome');

        const termo = sanitizarTermoBusca(buscaDebounced);
        if (termo) {
          const dig = termo.replace(/\D/g, '');
          if (dig.length >= 3) {
            qFallback = qFallback.or(`nome.ilike.%${termo}%,telefone_whatsapp.ilike.%${dig}%,cpf.ilike.%${dig}%`);
          } else {
            qFallback = qFallback.ilike('nome', `%${termo}%`);
          }
        }
        if (fAparelho) qFallback = qFallback.eq('usa_aparelho', true);

        const [pResp, cResp] = await Promise.all([
          qFallback.range(0, limite - 1),
          supabase.from('consultas').select('paciente_id,data,hora_inicio,status').order('data', { ascending: false }),
        ]);

        if (cancelado) return;
        data = (pResp.data as any) ?? [];
        count = pResp.count ?? (pResp.data?.length ?? 0);

        const r: Record<string, Resumo> = {};
        const dets: Record<string, ConsultaInfo[]> = {};
        for (const x of cResp.data ?? []) {
          (dets[x.paciente_id] ??= []).push(x);
          const o = (r[x.paciente_id] ??= {});
          if (x.status === 'atendido' && x.data <= hoje && !o.ultima) o.ultima = x.data;
          if (['agendado', 'confirmado'].includes(x.status) && x.data >= hoje) o.proxima = x;
        }
        setDetalhesConsultas(dets);
        setResumo(r);
      } else if (!error && data) {
        if (cancelado) return;
        // Popula resumo com dados que a view já calculou
        const r: Record<string, Resumo> = {};
        for (const p of data as Paciente[]) {
          r[p.id] = {
            ultima: p.ultima_consulta || undefined,
            proxima: p.proxima_consulta || undefined,
          };
        }
        setResumo(r);
      }

      if (cancelado) return;
      setLista(data ?? []);
      setTotalCount(count ?? (data?.length ?? 0));
      setCarregandoMais(false);
    })();

    return () => { cancelado = true; };
  }, [versao, limite, buscaDebounced, tagsSel, fAparelho, fSemConsulta, fAniver, fAtrasados]);

  const mes = new Date().getMonth() + 1;
  const hoje = hojeISO();

  const toggleTag = (id: string) => setTagsSel((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  // Exportação em lotes de 1000 com verificação estrita de auditoria
  async function exportarCsvPacientes() {
    if (exportando) return;
    setExportando(true);
    s.toast('Iniciando exportação de pacientes...', 'info');

    try {
      const CHUNK_SIZE = 1000;
      let offset = 0;
      let todos: Paciente[] = [];
      let totalServidor: number | null = null;

      while (true) {
        s.toast(`Exportando ${todos.length} pacientes...`, 'info');

        let { data, count, error } = await montarQuery('vw_pacientes_resumo').range(offset, offset + CHUNK_SIZE - 1);

        // Fallback caso a view ainda não exista
        if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
          let qFallback = supabase.from('pacientes').select('*', { count: 'exact' }).eq('ativo', true).order('nome');
          const termo = sanitizarTermoBusca(buscaDebounced);
          if (termo) {
            const dig = termo.replace(/\D/g, '');
            if (dig.length >= 3) {
              qFallback = qFallback.or(`nome.ilike.%${termo}%,telefone_whatsapp.ilike.%${dig}%,cpf.ilike.%${dig}%`);
            } else {
              qFallback = qFallback.ilike('nome', `%${termo}%`);
            }
          }
          if (fAparelho) qFallback = qFallback.eq('usa_aparelho', true);
          const resp = await qFallback.range(offset, offset + CHUNK_SIZE - 1);
          data = resp.data as any;
          count = resp.count;
          error = resp.error;
        }

        if (error) {
          throw new Error(error.message);
        }

        if (totalServidor === null && count !== null) {
          totalServidor = count;
        }

        const registros = data || [];
        todos = todos.concat(registros);

        if (registros.length < CHUNK_SIZE || (totalServidor !== null && todos.length >= totalServidor)) {
          break;
        }

        offset += CHUNK_SIZE;
      }

      if (!todos.length) {
        s.toast('Nenhum paciente encontrado para exportar com os filtros ativos', 'info');
        setExportando(false);
        return;
      }

      // Registro de auditoria LGPD obrigatório antes do download.
      // SE FALHAR, NÃO BAIXA O CSV e avisa o usuário com erro claro.
      const { error: audError } = await supabase.from('auditoria_exportacoes').insert({
        tipo: 'pacientes',
        usuario_id: s.perfil?.id,
        total_registros: todos.length,
        filtros_aplicados: {
          busca: buscaDebounced || null,
          fAtrasados,
          fAparelho,
          fSemConsulta,
          fAniver,
          tagsSel,
        },
      });

      if (audError) {
        s.toast(`Falha ao registrar auditoria de exportação: ${audError.message}. Exportação cancelada.`, 'erro');
        setExportando(false);
        return;
      }

      const cabecalho: (string | ColunaConfig)[] = [
        { label: 'Nome', tipo: 'texto' },
        { label: 'Telefone WhatsApp', tipo: 'telefone' },
        { label: 'CPF', tipo: 'texto' },
        { label: 'Data de Nascimento', tipo: 'data' },
        { label: 'Email', tipo: 'texto' },
        { label: 'Usa Aparelho', tipo: 'texto' },
        { label: 'Aceita WhatsApp', tipo: 'texto' },
        { label: 'Última Consulta', tipo: 'data' },
        { label: 'Próxima Consulta', tipo: 'data' },
        { label: 'Observações', tipo: 'texto' },
      ];

      const linhas = todos.map((p) => [
        p.nome,
        p.telefone_whatsapp ? fmtTelefone(p.telefone_whatsapp) : '',
        p.cpf ? fmtCpf(p.cpf) : '',
        p.data_nascimento ? fmtData(p.data_nascimento) : '',
        p.email ?? '',
        p.usa_aparelho ? 'Sim' : 'Não',
        p.aceita_whatsapp ? 'Sim' : 'Não',
        p.ultima_consulta ? fmtData(p.ultima_consulta) : (resumo[p.id]?.ultima ? fmtData(resumo[p.id]?.ultima) : ''),
        p.proxima_consulta ? `${fmtData(p.proxima_consulta.data)} ${fmtHora(p.proxima_consulta.hora_inicio)}` : (resumo[p.id]?.proxima ? `${fmtData(resumo[p.id]?.proxima?.data)} ${fmtHora(resumo[p.id]?.proxima?.hora_inicio)}` : ''),
        p.observacoes ?? '',
      ]);

      baixarCsv(`pacientes_${hojeISO()}`, cabecalho, linhas);
      s.toast(`Exportados ${todos.length} pacientes em CSV com sucesso`, 'ok');
    } catch (err: any) {
      s.toast(`Erro na exportação: ${err?.message || err}`, 'erro');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Pacientes</h1><p className="muted">{lista ? `Mostrando ${lista.length} de ${totalCount} cadastrados` : 'Carregando…'}</p></div>
        <div className="head-acoes">
          <button className="btn ghost" onClick={() => setModalImportar(true)} title="Importar lista de pacientes em lote">
            📥 Importar lista
          </button>
          {s.isAdmin && (
            <button className="btn ghost" disabled={exportando} onClick={exportarCsvPacientes} title="Exportar pacientes filtrados para Excel/CSV">
              <Icon n="download" s={16} /> {exportando ? 'Exportando…' : 'Exportar CSV'}
            </button>
          )}
          <Segmented value={modo} onChange={setModo} options={[{ v: 'cartoes', l: <Icon n="grade" s={16} /> }, { v: 'tabela', l: <Icon n="lista" s={16} /> }]} />
          <button className="btn primary" onClick={() => s.abrirPacienteForm({})}><Icon n="mais" s={18} /> Novo paciente</button>
        </div>
      </header>

      <div className="busca-grande"><Icon n="busca" /><input placeholder="Buscar por nome, telefone ou CPF…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {busca && <button className="icon-btn" onClick={() => setBusca('')}><Icon n="x" s={16} /></button>}</div>

      <div className="chips filtros-chips">
        <button className={cls('chip', fAtrasados && 'on vermelho')} onClick={() => setFAtrasados(!fAtrasados)}>⚠️ Faltou / Passou do dia</button>
        <button className={cls('chip', fAparelho && 'on roxo')} onClick={() => setFAparelho(!fAparelho)}>🦷 Usa aparelho</button>
        <button className={cls('chip', fSemConsulta && 'on')} onClick={() => setFSemConsulta(!fSemConsulta)}>📭 Sem consulta marcada</button>
        <button className={cls('chip', fAniver && 'on')} onClick={() => setFAniver(!fAniver)}>🎂 Aniversariantes de {MESES[mes - 1]}</button>
        <span className="sep" />
        {etiquetas.filter((e) => e.tipo === 'paciente').map((e) => (
          <button key={e.id} className={cls('chip-tag', tagsSel.includes(e.id) && 'on')} onClick={() => toggleTag(e.id)}><Pill e={e} small /></button>
        ))}
      </div>

      {!lista ? <Spinner /> : lista.length === 0 ? (
        totalCount === 0 && !busca && !tagsSel.length && !fAparelho && !fSemConsulta && !fAniver && !fAtrasados
          ? <Empty emoji="🧑‍⚕️" titulo="Nenhum paciente ainda" texto="Cadastre o primeiro paciente para começar a marcar consultas." acao={<button className="btn primary" onClick={() => s.abrirPacienteForm({})}>Cadastrar paciente</button>} />
          : <Empty emoji="🔍" titulo="Ninguém encontrado" texto="Tente outra busca ou limpe os filtros." acao={<button className="btn ghost" onClick={() => { setBusca(''); setTagsSel([]); setFAparelho(false); setFSemConsulta(false); setFAniver(false); setFAtrasados(false); }}>Limpar filtros</button>} />
      ) : modo === 'cartoes' ? (
        <div className="cards-pacientes fade">{lista.map((p) => {
          const r = resumo[p.id] ?? {};
          const hist = detalhesConsultas[p.id] || [];
          const temFaltaRecente = hist.some((c) => c.status === 'faltou');
          const temPassadaNaoAtendida = hist.some((c) => c.data < hoje && ['agendado', 'confirmado'].includes(c.status));
          const alertaAparelho = p.usa_aparelho && !r.proxima;
          const temAtraso = p.atrasado ?? (temFaltaRecente || temPassadaNaoAtendida);
          const tagIds = p.etiquetas_ids ?? (p.paciente_etiquetas ?? []).map((x) => x.etiqueta_id);

          return <button key={p.id} className={cls('card card-paciente', (alertaAparelho || temAtraso) && 'alerta')} onClick={() => s.abrirPaciente(p.id)}>
            <div className="cp-top"><Avatar nome={p.nome} foto={p.foto_url} tam={48} />
              <div><b>{p.nome}</b><small className="muted">{fmtTelefone(p.telefone_whatsapp)}</small></div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {temFaltaRecente && <span className="pill pill-sm" style={{ background: '#FDE8E8', color: '#9B1C1C', borderColor: '#F8B4B4' }}>Faltou</span>}
                {temPassadaNaoAtendida && !temFaltaRecente && <span className="pill pill-sm" style={{ background: '#FEF08A', color: '#854D0E', borderColor: '#FDE047' }}>Passou da data</span>}
                {p.usa_aparelho && <span className="tag-aparelho" title="Usa aparelho">🦷</span>}
              </div>
            </div>
            <Pills ids={tagIds} small max={4} />
            <div className="cp-info">
              <div><small>Próxima</small><b className={cls(!r.proxima && ((alertaAparelho || temAtraso) ? 'vermelho-txt' : 'muted'))}>{r.proxima ? `${fmtData(r.proxima.data)} ${fmtHora(r.proxima.hora_inicio)}` : alertaAparelho ? 'Sem manutenção!' : temAtraso ? 'Sem reagendamento!' : '—'}</b></div>
              <div><small>Última visita</small><b>{fmtData(r.ultima) || '—'}</b></div>
            </div>
          </button>;
        })}</div>
      ) : (
        <div className="card tabela-wrap fade"><table className="tabela">
          <thead><tr><th>Paciente</th><th>Telefone</th><th>CPF</th><th>Etiquetas</th><th>Próxima consulta</th><th>Última visita</th></tr></thead>
          <tbody>{lista.map((p) => {
            const r = resumo[p.id] ?? {};
            const tagIds = p.etiquetas_ids ?? (p.paciente_etiquetas ?? []).map((x) => x.etiqueta_id);
            return (
              <tr key={p.id} onClick={() => s.abrirPaciente(p.id)}>
                <td><span className="td-nome"><Avatar nome={p.nome} foto={p.foto_url} tam={32} />{p.nome}{p.usa_aparelho && ' 🦷'}</span></td>
                <td>{fmtTelefone(p.telefone_whatsapp)}</td><td className="muted">{cpfMascarado(p.cpf)}</td>
                <td><Pills ids={tagIds} small max={3} /></td>
                <td className={cls(p.usa_aparelho && !r.proxima && 'vermelho-txt')}>{r.proxima ? `${fmtData(r.proxima.data)} ${fmtHora(r.proxima.hora_inicio)}` : '—'}</td>
                <td>{fmtData(r.ultima) || '—'}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}

      {lista && lista.length < totalCount && (
        <div style={{ textAlign: 'center', margin: '24px 0' }}>
          <button
            className="btn ghost"
            disabled={carregandoMais}
            onClick={() => setLimite((l) => l + PAGE_SIZE)}
          >
            {carregandoMais ? 'Carregando mais…' : `Carregar mais pacientes (${totalCount - lista.length} restantes)`}
          </button>
        </div>
      )}

      {modalImportar && <ImportarPacientesModal onClose={() => setModalImportar(false)} />}
    </div>
  );
}
