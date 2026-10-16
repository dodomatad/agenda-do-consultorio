import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { Notificacao } from '../lib/types';
import { cls, diffDias, hojeISO, inicioSemana, tempoRelativo, toISO } from '../lib/utils';
import { Empty, Icon, Segmented, Spinner } from '../components/ui';

type Filtro = 'todas' | 'urgentes' | 'aparelho' | 'confirmacoes' | 'aniversarios';
const ICONE: Record<string, string> = {
  aparelho: '🦷', confirmacao: '📋', falta: '🚫', whatsapp_resposta: '💬', whatsapp_mensagem: '💬', aniversario: '🎂', sumido: '👋', whatsapp_erro: '⚠️',
};

export default function Notificacoes() {
  const s = useStore();
  const [lista, setLista] = useState<Notificacao[] | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [verResolvidas, setVerResolvidas] = useState(false);
  const PAGE_SIZE = 50;
  const [limite, setLimite] = useState(PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [carregandoMais, setCarregandoMais] = useState(false);

  async function carregar() {
    setCarregandoMais(true);
    let q = supabase
      .from('notificacoes')
      .select('*, pacientes(id,nome,telefone_whatsapp,aceita_whatsapp)', { count: 'exact' })
      .order('criado_em', { ascending: false })
      .range(0, limite - 1);
    if (!verResolvidas) q = q.eq('resolvida', false);
    if (filtro === 'urgentes') q = q.eq('prioridade', 'alta');
    else if (filtro === 'aparelho') q = q.eq('tipo', 'aparelho');
    else if (filtro === 'confirmacoes') q = q.in('tipo', ['confirmacao', 'whatsapp_resposta']);
    else if (filtro === 'aniversarios') q = q.eq('tipo', 'aniversario');
    const { data, count } = await q;
    setLista(data ?? []);
    setTotalCount(count ?? (data?.length ?? 0));
    setCarregandoMais(false);
  }
  useEffect(() => { carregar(); }, [verResolvidas, filtro, s.naoLidas, s.versao, limite]); // eslint-disable-line
  // Marca como lidas ao abrir a tela
  useEffect(() => {
    const t = setTimeout(async () => { await supabase.from('notificacoes').update({ lida: true }).eq('lida', false); s.setNaoLidas(0); }, 1500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  const filtradas = useMemo(() => (lista ?? []).filter((n) =>
    filtro === 'todas' ? true : filtro === 'urgentes' ? n.prioridade === 'alta' : filtro === 'aparelho' ? n.tipo === 'aparelho'
      : filtro === 'confirmacoes' ? ['confirmacao', 'whatsapp_resposta'].includes(n.tipo) : n.tipo === 'aniversario'), [lista, filtro]);

  const grupos = useMemo(() => {
    const hoje = hojeISO(), semana = inicioSemana(hoje);
    const g: Record<string, Notificacao[]> = { Hoje: [], 'Esta semana': [], 'Mais antigas': [] };
    for (const n of filtradas) { const d = toISO(new Date(n.criado_em)); (d === hoje ? g.Hoje : d >= semana ? g['Esta semana'] : g['Mais antigas']).push(n); }
    return g;
  }, [filtradas]);

  async function resolver(n: Notificacao) {
    await supabase.from('notificacoes').update({ resolvida: true, lida: true }).eq('id', n.id);
    setLista((l) => (l ?? []).filter((x) => verResolvidas || x.id !== n.id).map((x) => (x.id === n.id ? { ...x, resolvida: true } : x)));
    s.toast('Marcada como resolvida');
  }
  async function resolverTodas() {
    const pendentesIds = filtradas.filter((n) => !n.resolvida).map((n) => n.id);
    if (!pendentesIds.length) return;
    if (!(await s.confirmar(`Marcar ${pendentesIds.length} notificação(ões) desta aba como resolvidas?`, { ok: 'Resolver todas' }))) return;
    await supabase.from('notificacoes').update({ resolvida: true, lida: true }).in('id', pendentesIds);
    s.toast(`${pendentesIds.length} notificações marcadas como resolvidas`);
    carregar();
  }
  async function verificarAgora() {
    const { error } = await supabase.rpc('gerar_notificacoes_diarias');
    s.toast(error ? 'Não foi possível verificar' : 'Verificação concluída', error ? 'erro' : 'ok'); carregar();
  }

  const conta = (f: Filtro) => (lista ?? []).filter((n) => f === 'urgentes' ? n.prioridade === 'alta' : true).length;
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Notificações</h1>
          <p className="muted">{lista ? `Mostrando ${filtradas.length} de ${totalCount} notificações` : 'O que precisa da sua atenção.'}</p>
        </div>
        <div className="head-acoes">
          {!verResolvidas && filtradas.length > 0 && (
            <button className="btn ghost" onClick={resolverTodas}><Icon n="check" s={16} /> Resolver todas</button>
          )}
          <button className="btn ghost" onClick={() => setVerResolvidas(!verResolvidas)}>{verResolvidas ? 'Ocultar resolvidas' : 'Ver resolvidas'}</button>
          <button className="btn ghost" onClick={verificarAgora}>🔄 Verificar agora</button>
        </div>
      </header>
      <div className="scroll-x"><Segmented value={filtro} onChange={(f) => { setLimite(PAGE_SIZE); setFiltro(f); }} options={[
        { v: 'todas', l: 'Todas' }, { v: 'urgentes', l: `🔴 Urgentes${conta('urgentes') ? ` (${conta('urgentes')})` : ''}` },
        { v: 'aparelho', l: '🦷 Aparelho' }, { v: 'confirmacoes', l: '📋 Confirmações' }, { v: 'aniversarios', l: '🎂 Aniversários' }]} /></div>

      {!lista ? <Spinner /> : filtradas.length === 0 ? <Empty emoji="🎉" titulo="Tudo em dia!" texto="Nenhuma notificação pendente por aqui." /> :
        Object.entries(grupos).filter(([, l]) => l.length).map(([titulo, l]) => (
          <section key={titulo} className="notif-grupo fade">
            <h2 className="grupo-titulo">{titulo}</h2>
            {l.map((n) => <NotifItem key={n.id} n={n} onResolver={() => resolver(n)} />)}
          </section>
        ))}

      {lista && lista.length < totalCount && (
        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <button className="btn ghost" disabled={carregandoMais} onClick={() => setLimite((l) => l + PAGE_SIZE)}>
            {carregandoMais ? 'Carregando…' : `Carregar mais notificações (${totalCount - lista.length} restantes)`}
          </button>
        </div>
      )}
    </div>
  );
}

function NotifItem({ n, onResolver }: { n: Notificacao; onResolver: () => void }) {
  const s = useStore();
  const pac = n.pacientes;
  const ehAparelho = n.tipo === 'aparelho';
  const precisaMarcar = ['aparelho', 'falta', 'whatsapp_resposta', 'sumido'].includes(n.tipo);
  const gatilho = n.tipo === 'aparelho' ? 'manutencao' : n.tipo === 'falta' ? 'falta' : n.tipo === 'aniversario' ? 'aniversario' : 'confirmacao';
  return (
    <div className={cls('card notif', `p-${n.prioridade}`, ehAparelho && 'aparelho', n.resolvida && 'resolvida', !n.lida && 'nova')}>
      <div className="notif-ico">{ICONE[n.tipo] ?? '🔔'}</div>
      <div className="notif-corpo">
        <div className="notif-top"><b>{n.titulo}</b><small className="muted">{tempoRelativo(n.criado_em)}</small></div>
        {n.mensagem && <p className="muted">{n.mensagem}</p>}
        {!n.resolvida && <div className="notif-acoes">
          {precisaMarcar && pac && <button className="btn sm primary" onClick={() => s.abrirConsultaForm({ paciente_id: pac.id, procedimento_id: ehAparelho ? s.procedimentos.find((p) => p.eh_manutencao_aparelho)?.id : undefined })}>📅 Marcar consulta</button>}
          {n.tipo === 'confirmacao' && <button className="btn sm primary" onClick={() => s.navegar('agenda')}>📅 Ver agenda</button>}
          {pac?.aceita_whatsapp && <button className="btn sm wa" onClick={() => s.abrirWhatsApp({ paciente: pac, gatilho })}><Icon n="whatsapp" s={14} /> Enviar WhatsApp</button>}
          {pac && <button className="btn sm ghost" onClick={() => s.abrirPaciente(pac.id)}>Ver paciente</button>}
          {n.tipo === 'whatsapp_erro' && s.isAdmin && <button className="btn sm ghost" onClick={() => s.navegar('whatsapp')}>Abrir WhatsApp</button>}
          <button className="btn sm ghost" onClick={onResolver}><Icon n="check" s={14} /> Resolvida</button>
        </div>}
        {n.data_referencia && n.tipo === 'aparelho' && diffDias(n.data_referencia, hojeISO()) < -1 && <small className="muted">Referente a {n.data_referencia.split('-').reverse().join('/')}</small>}
      </div>
    </div>
  );
}
