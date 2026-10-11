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

  async function carregar() {
    let q = supabase.from('notificacoes').select('*, pacientes(id,nome,telefone_whatsapp,aceita_whatsapp)').order('criado_em', { ascending: false }).limit(300);
    if (!verResolvidas) q = q.eq('resolvida', false);
    const { data } = await q; setLista(data ?? []);
  }
  useEffect(() => { carregar(); }, [verResolvidas, s.naoLidas, s.versao]); // eslint-disable-line
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
  async function verificarAgora() {
    const { error } = await supabase.rpc('gerar_notificacoes_diarias');
    s.toast(error ? 'Não foi possível verificar' : 'Verificação concluída', error ? 'erro' : 'ok'); carregar();
  }

  const conta = (f: Filtro) => (lista ?? []).filter((n) => f === 'urgentes' ? n.prioridade === 'alta' : true).length;
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Notificações</h1><p className="muted">O que precisa da sua atenção.</p></div>
        <div className="head-acoes">
          <button className="btn ghost" onClick={() => setVerResolvidas(!verResolvidas)}>{verResolvidas ? 'Ocultar resolvidas' : 'Ver resolvidas'}</button>
          <button className="btn ghost" onClick={verificarAgora}>🔄 Verificar agora</button>
        </div>
      </header>
      <div className="scroll-x"><Segmented value={filtro} onChange={setFiltro} options={[
        { v: 'todas', l: 'Todas' }, { v: 'urgentes', l: `🔴 Urgentes${conta('urgentes') ? ` (${conta('urgentes')})` : ''}` },
        { v: 'aparelho', l: '🦷 Aparelho' }, { v: 'confirmacoes', l: '📋 Confirmações' }, { v: 'aniversarios', l: '🎂 Aniversários' }]} /></div>

      {!lista ? <Spinner /> : filtradas.length === 0 ? <Empty emoji="🎉" titulo="Tudo em dia!" texto="Nenhuma notificação pendente por aqui." /> :
        Object.entries(grupos).filter(([, l]) => l.length).map(([titulo, l]) => (
          <section key={titulo} className="notif-grupo fade">
            <h2 className="grupo-titulo">{titulo}</h2>
            {l.map((n) => <NotifItem key={n.id} n={n} onResolver={() => resolver(n)} />)}
          </section>
        ))}
    </div>
  );
}

function NotifItem({ n, onResolver }: { n: Notificacao; onResolver: () => void }) {
  const s = useStore();
  const pac = n.pacientes as any;
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
