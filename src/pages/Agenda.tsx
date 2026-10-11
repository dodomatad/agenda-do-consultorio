import { DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { Consulta, Notificacao } from '../lib/types';
import {
  addDias, cls, DIAS_CURTO, diaSemana, fmtData, fmtHora, fromISO, hhmm, hojeISO, inicioSemana, MESES, minutos, primeiroNome, STATUS_INFO, toISO,
} from '../lib/utils';
import { Dots, Empty, Icon, Modal, Segmented } from '../components/ui';

type Visao = 'dia' | 'semana' | 'mes';
const SLOT = 30;          // minutos por linha
const SLOT_H = 52;        // altura em px de cada linha de 30 min
const SEL = '*, consulta_etiquetas(etiqueta_id), pacientes(id,nome,telefone_whatsapp,usa_aparelho,foto_url,intervalo_manutencao_dias,aceita_whatsapp,paciente_etiquetas(etiqueta_id))';

export default function Agenda() {
  const s = useStore();
  const { cfg, procedimentos, profissionais, etiquetas, versao } = s;
  const mobile = typeof window !== 'undefined' && window.innerWidth < 860;
  const [visao, setVisao] = useState<Visao>(mobile ? 'dia' : 'semana');
  const [data, setData] = useState(hojeISO());
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [urgentes, setUrgentes] = useState<Notificacao[]>([]);
  const [filtros, setFiltros] = useState({ profissional: '', procedimento: '', status: '', etiqueta: '' });
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [abaMobile, setAbaMobile] = useState<'agenda' | 'resumo'>('agenda');
  const [remarcar, setRemarcar] = useState<{ c: Consulta; data: string; hora: string } | null>(null);
  const [agora, setAgora] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 60_000); return () => clearInterval(t); }, []);

  // Intervalo de datas visível
  const dias = useMemo(() => {
    if (visao === 'dia') return [data];
    if (visao === 'semana') {
      const ini = inicioSemana(data);
      const todos = Array.from({ length: 7 }, (_, i) => addDias(ini, i));
      return todos.filter((d) => (cfg?.dias_atendimento ?? [1, 2, 3, 4, 5, 6]).includes(fromISO(d).getDay()) || consultas.some((c) => c.data === d));
    }
    const d = fromISO(data); const ini = inicioSemana(toISO(new Date(d.getFullYear(), d.getMonth(), 1)));
    return Array.from({ length: 42 }, (_, i) => addDias(ini, i));
  }, [visao, data, cfg, consultas]);
  const [ini, fim] = useMemo(() => {
    if (visao === 'dia') return [data, data];
    if (visao === 'semana') { const i = inicioSemana(data); return [i, addDias(i, 6)]; }
    return [dias[0], dias[dias.length - 1]];
  }, [visao, data, dias]);

  useEffect(() => {
    supabase.from('consultas').select(SEL).gte('data', ini).lte('data', fim).order('hora_inicio').then(({ data }) => setConsultas((data as Consulta[]) ?? []));
  }, [ini, fim, versao]);
  useEffect(() => {
    supabase.from('notificacoes').select('*').eq('resolvida', false).eq('prioridade', 'alta').order('criado_em', { ascending: false }).limit(5)
      .then(({ data }) => setUrgentes(data ?? []));
  }, [versao, s.naoLidas]);

  const filtradas = useMemo(() => consultas.filter((c) =>
    (filtros.status ? c.status === filtros.status : c.status !== 'desmarcou')
    && (!filtros.profissional || c.profissional_id === filtros.profissional)
    && (!filtros.procedimento || c.procedimento_id === filtros.procedimento)
    && (!filtros.etiqueta || c.consulta_etiquetas?.some((x) => x.etiqueta_id === filtros.etiqueta) || c.pacientes?.paciente_etiquetas?.some((x) => x.etiqueta_id === filtros.etiqueta))
  ), [consultas, filtros]);
  const nFiltros = Object.values(filtros).filter(Boolean).length;

  // Grade de horários
  const hIni = Math.min(7 * 60, minutos(cfg?.horario_abertura ?? '07:00'));
  const hFim = Math.max(19 * 60, minutos(cfg?.horario_fechamento ?? '19:00'));
  const linhas = Array.from({ length: (hFim - hIni) / SLOT }, (_, i) => hIni + i * SLOT);
  const px = (m: number) => ((m - hIni) / SLOT) * SLOT_H;

  function navegarData(dir: number) {
    if (visao === 'dia') setData(addDias(data, dir));
    else if (visao === 'semana') setData(addDias(data, dir * 7));
    else { const d = fromISO(data); setData(toISO(new Date(d.getFullYear(), d.getMonth() + dir, 1))); }
  }
  const titulo = visao === 'dia' ? <>{diaSemana(data)}<small>{fmtData(data)}</small></>
    : visao === 'semana' ? <>{fmtData(ini).slice(0, 5)} – {fmtData(fim)}<small>Semana</small></>
      : <>{MESES[fromISO(data).getMonth()]}<small>{fromISO(data).getFullYear()}</small></>;

  function cliqueVazio(e: React.MouseEvent<HTMLDivElement>, dia: string) {
    if ((e.target as HTMLElement).closest('.bloco')) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const m = hIni + Math.floor((y / SLOT_H) * SLOT / 15) * 15;
    s.abrirConsultaForm({ data: dia, hora_inicio: hhmm(m), profissional_id: filtros.profissional || undefined });
  }

  // Arrastar e soltar
  const grabOffset = useRef(0);
  function onDrop(e: DragEvent<HTMLDivElement>, dia: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain'); const c = consultas.find((x) => x.id === id); if (!c) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top - grabOffset.current;
    const m = Math.max(hIni, hIni + Math.round((y / SLOT_H) * SLOT / 15) * 15);
    if (dia === c.data && hhmm(m) === fmtHora(c.hora_inicio)) return;
    setRemarcar({ c, data: dia, hora: hhmm(m) });
  }
  async function confirmarRemarcacao(avisar: boolean) {
    const r = remarcar!; setRemarcar(null);
    const { data: nova, error } = await supabase.from('consultas').update({ data: r.data, hora_inicio: r.hora, status: 'agendado', confirmado_via_whatsapp: false, lembrete_enviado: false })
      .eq('id', r.c.id).select().single();
    if (error) return s.toast('Não foi possível remarcar', 'erro');
    s.toast('Consulta remarcada'); s.bump();
    if (avisar && r.c.pacientes) s.abrirWhatsApp({ paciente: r.c.pacientes, consulta: nova, gatilho: 'confirmacao' });
  }

  // Resumo do dia (dia selecionado, ou hoje nas visões semana/mês)
  const diaResumo = visao === 'dia' ? data : hojeISO();
  const doDia = consultas.filter((c) => c.data === diaResumo && c.status !== 'desmarcou');
  const resumo = {
    total: doDia.length, confirmadas: doDia.filter((c) => c.status === 'confirmado').length,
    aguardando: doDia.filter((c) => c.status === 'agendado').length, faltas: doDia.filter((c) => c.status === 'faltou').length,
  };
  const agoraHM = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  const proximas = consultas.filter((c) => c.data === hojeISO() && fmtHora(c.hora_inicio) >= agoraHM && ['agendado', 'confirmado'].includes(c.status)).slice(0, 5);

  const painel = (
    <aside className="painel">
      <section className="card resumo">
        <h3>{diaResumo === hojeISO() ? 'Hoje' : fmtData(diaResumo)}</h3>
        <div className="resumo-grid">
          <div><b>{resumo.total}</b><span>consultas</span></div>
          <div className="ok"><b>{resumo.confirmadas}</b><span>confirmadas</span></div>
          <div className="warn"><b>{resumo.aguardando}</b><span>aguardando</span></div>
          <div className="bad"><b>{resumo.faltas}</b><span>faltas</span></div>
        </div>
      </section>
      <section className="card">
        <h3>Próximas consultas</h3>
        {proximas.length ? <ul className="proximas">{proximas.map((c) => {
          const p = procedimentos.find((x) => x.id === c.procedimento_id);
          return <li key={c.id} onClick={() => s.abrirConsultaCard(c.id)}>
            <span className="hora font-display">{fmtHora(c.hora_inicio)}</span>
            <i style={{ background: p?.cor ?? '#6B7C85' }} />
            <span className="nome"><b>{c.pacientes?.nome}</b><small>{p?.nome}</small></span>
            <span title={STATUS_INFO[c.status].label}>{c.confirmado_via_whatsapp ? '💬' : STATUS_INFO[c.status].icone}</span>
          </li>;
        })}</ul> : <p className="muted pad">Nenhuma consulta pela frente hoje. ☕</p>}
      </section>
      <section className="card">
        <h3>Urgente {urgentes.length > 0 && <span className="badge-red">{urgentes.length}</span>}</h3>
        {urgentes.length ? <ul className="urgentes">{urgentes.map((n) => (
          <li key={n.id} onClick={() => s.navegar('notificacoes')}><span className="dot-red" />{n.titulo}</li>
        ))}</ul> : <p className="muted pad">Tudo em dia! ✨</p>}
      </section>
    </aside>
  );

  return (
    <div className="page agenda-page">
      <header className="page-head agenda-head">
        <div className="nav-data">
          <button className="icon-btn" onClick={() => navegarData(-1)} aria-label="Anterior"><Icon n="esq" /></button>
          <button className="btn ghost sm" onClick={() => setData(hojeISO())}>Hoje</button>
          <button className="icon-btn" onClick={() => navegarData(1)} aria-label="Próximo"><Icon n="dir" /></button>
          <h1 className="titulo-data">{titulo}</h1>
        </div>
        <div className="head-acoes">
          <Segmented value={visao} onChange={setVisao} options={[{ v: 'dia', l: 'Dia' }, { v: 'semana', l: 'Semana' }, { v: 'mes', l: 'Mês' }]} />
          <button className={cls('btn ghost', nFiltros > 0 && 'ativo')} onClick={() => setMostrarFiltros((v) => !v)}><Icon n="filtro" s={16} /> Filtros{nFiltros > 0 && ` (${nFiltros})`}</button>
          <button className="btn primary hide-mobile" onClick={() => s.abrirConsultaForm({ data: visao === 'dia' ? data : hojeISO() })}><Icon n="mais" s={18} /> Marcar consulta</button>
        </div>
      </header>

      {mostrarFiltros && <div className="filtros fade">
        {profissionais.length > 0 && <select value={filtros.profissional} onChange={(e) => setFiltros({ ...filtros, profissional: e.target.value })}>
          <option value="">Todos os profissionais</option>{profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>}
        <select value={filtros.procedimento} onChange={(e) => setFiltros({ ...filtros, procedimento: e.target.value })}>
          <option value="">Todos os procedimentos</option>{procedimentos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
        <select value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}>
          <option value="">Todos os status</option>{Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.icone} {v.label}</option>)}</select>
        <select value={filtros.etiqueta} onChange={(e) => setFiltros({ ...filtros, etiqueta: e.target.value })}>
          <option value="">Todas as etiquetas</option>{etiquetas.map((e) => <option key={e.id} value={e.id}>{e.icone} {e.nome}</option>)}</select>
        {nFiltros > 0 && <button className="btn ghost sm" onClick={() => setFiltros({ profissional: '', procedimento: '', status: '', etiqueta: '' })}>Limpar</button>}
      </div>}

      <div className="tabs-mobile">
        <Segmented value={abaMobile} onChange={setAbaMobile} options={[{ v: 'agenda', l: '📅 Agenda' }, { v: 'resumo', l: `📋 Resumo${urgentes.length ? ` · ${urgentes.length}` : ''}` }]} />
      </div>

      <div className={cls('agenda-layout', abaMobile === 'resumo' && 'mostrar-resumo')}>
        <div className="agenda-main card" key={visao}>
          {visao === 'mes' ? (
            <div className="mes fade">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => <div key={d} className="mes-dow">{d}</div>)}
              {dias.map((d) => {
                const lista = filtradas.filter((c) => c.data === d);
                const outroMes = fromISO(d).getMonth() !== fromISO(data).getMonth();
                return <button key={d} className={cls('mes-cel', outroMes && 'fora', d === hojeISO() && 'hoje')} onClick={() => { setData(d); setVisao('dia'); }}>
                  <span className="mes-num font-display">{fromISO(d).getDate()}</span>
                  {lista.length > 0 && <>
                    <span className="mes-qtd">{lista.length} {lista.length === 1 ? 'consulta' : 'consultas'}</span>
                    <span className="mes-dots">{lista.slice(0, 8).map((c) => <i key={c.id} style={{ background: procedimentos.find((p) => p.id === c.procedimento_id)?.cor ?? '#6B7C85' }} />)}</span>
                  </>}
                </button>;
              })}
            </div>
          ) : (
            <div className="grade-scroll fade">
              <div className="grade" style={{ ['--cols' as any]: dias.length }}>
                <div className="grade-cab">
                  <div />
                  {dias.map((d) => <div key={d} className={cls('cab-dia', d === hojeISO() && 'hoje')} onClick={() => { setData(d); setVisao('dia'); }}>
                    <span>{DIAS_CURTO[fromISO(d).getDay()]}</span><b className="font-display">{fromISO(d).getDate()}</b>
                  </div>)}
                </div>
                <div className="grade-corpo" style={{ height: linhas.length * SLOT_H }}>
                  <div className="horas">{linhas.map((m) => <div key={m} style={{ height: SLOT_H }} className="font-display">{m % 60 === 0 ? hhmm(m) : ''}</div>)}</div>
                  {dias.map((d) => {
                    const lista = posicionar(filtradas.filter((c) => c.data === d));
                    const fechado = !(cfg?.dias_atendimento ?? [1, 2, 3, 4, 5, 6]).includes(fromISO(d).getDay());
                    return <div key={d} className={cls('coluna', fechado && 'fechado')} onClick={(e) => cliqueVazio(e, d)}
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drop'); }}
                      onDragLeave={(e) => e.currentTarget.classList.remove('drop')}
                      onDrop={(e) => { e.currentTarget.classList.remove('drop'); onDrop(e, d); }}>
                      {linhas.map((m) => <div key={m} className={cls('slot', m % 60 === 0 && 'hora-cheia')} style={{ height: SLOT_H }} />)}
                      {cfg && minutos(cfg.horario_abertura) > hIni && <div className="fora-horario" style={{ top: 0, height: px(minutos(cfg.horario_abertura)) }} />}
                      {cfg && minutos(cfg.horario_fechamento) < hFim && <div className="fora-horario" style={{ top: px(minutos(cfg.horario_fechamento)), bottom: 0 }} />}
                      {cfg?.almoco_inicio && cfg.almoco_fim && <div className="almoco" style={{ top: px(minutos(cfg.almoco_inicio)), height: px(minutos(cfg.almoco_fim)) - px(minutos(cfg.almoco_inicio)) }}><span>Almoço</span></div>}
                      {d === hojeISO() && agora.getHours() * 60 + agora.getMinutes() >= hIni && agora.getHours() * 60 + agora.getMinutes() <= hFim &&
                        <div className="agora" style={{ top: px(agora.getHours() * 60 + agora.getMinutes()) }}><span /></div>}
                      {lista.map(({ c, lane, lanes }) => <Bloco key={c.id} c={c} top={px(minutos(c.hora_inicio))} h={(c.duracao_minutos / SLOT) * SLOT_H}
                        left={`calc(${(lane / lanes) * 100}% + 2px)`} width={`calc(${100 / lanes}% - 4px)`} compacto={visao === 'semana' && dias.length > 4}
                        onDragStart={(e, off) => { grabOffset.current = off; e.dataTransfer.setData('text/plain', c.id); }} />)}
                    </div>;
                  })}
                </div>
              </div>
              {filtradas.length === 0 && visao === 'dia' && <div className="vazio-flutuante">
                <Empty emoji="🗓️" titulo="Agenda livre" texto="Clique em qualquer horário para marcar uma consulta." /></div>}
            </div>
          )}
        </div>
        {painel}
      </div>

      <button className="fab" onClick={() => s.abrirConsultaForm({ data: visao === 'dia' ? data : hojeISO() })} aria-label="Marcar consulta"><Icon n="mais" s={26} /></button>

      {remarcar && <Modal titulo="Remarcar consulta?" onClose={() => setRemarcar(null)} largura={440}
        rodape={<>
          <button className="btn ghost" onClick={() => setRemarcar(null)}>Cancelar</button>
          <button className="btn primary" onClick={() => confirmarRemarcacao(false)}>Remarcar</button>
          {remarcar.c.pacientes?.aceita_whatsapp && <button className="btn wa" onClick={() => confirmarRemarcacao(true)}><Icon n="whatsapp" s={16} /> Remarcar e avisar</button>}
        </>}>
        <p><b>{remarcar.c.pacientes?.nome}</b></p>
        <div className="remarcar-de-para">
          <div><small>De</small><b className="font-display">{fmtData(remarcar.c.data)} · {fmtHora(remarcar.c.hora_inicio)}</b></div>
          <Icon n="dir" />
          <div className="para"><small>Para</small><b className="font-display">{fmtData(remarcar.data)} · {remarcar.hora}</b><small>{diaSemana(remarcar.data)}</small></div>
        </div>
      </Modal>}
    </div>
  );
}

/** Distribui consultas sobrepostas lado a lado. */
function posicionar(lista: Consulta[]) {
  const ord = [...lista].sort((a, b) => minutos(a.hora_inicio) - minutos(b.hora_inicio));
  const out: { c: Consulta; lane: number; lanes: number }[] = [];
  let grupo: typeof out = []; let fimGrupo = -1; let fins: number[] = [];
  const fechar = () => { const n = Math.max(1, ...grupo.map((g) => g.lane + 1)); grupo.forEach((g) => (g.lanes = n)); out.push(...grupo); grupo = []; fins = []; };
  for (const c of ord) {
    const i = minutos(c.hora_inicio), f = i + c.duracao_minutos;
    if (i >= fimGrupo && grupo.length) fechar();
    let lane = fins.findIndex((x) => x <= i); if (lane < 0) { lane = fins.length; fins.push(f); } else fins[lane] = f;
    grupo.push({ c, lane, lanes: 1 }); fimGrupo = Math.max(fimGrupo, f);
  }
  if (grupo.length) fechar();
  return out;
}

function Bloco({ c, top, h, left, width, compacto, onDragStart }: {
  c: Consulta; top: number; h: number; left: string; width: string; compacto: boolean; onDragStart: (e: DragEvent, off: number) => void;
}) {
  const { procedimentos, profissionais, abrirConsultaCard } = useStore();
  const p = procedimentos.find((x) => x.id === c.procedimento_id);
  const prof = profissionais.find((x) => x.id === c.profissional_id);
  const cor = p?.cor ?? '#6B7C85';
  const icone = c.confirmado_via_whatsapp ? '💬' : STATUS_INFO[c.status].icone;
  const tags = [...(c.pacientes?.paciente_etiquetas ?? []), ...(c.consulta_etiquetas ?? [])].map((x) => x.etiqueta_id);
  return (
    <div className={cls('bloco', `st-${c.status.replace(' ', '-')}`, h < 40 && 'mini')} draggable
      style={{ top, height: Math.max(h - 3, 22), left, width, ['--c' as any]: cor, ['--prof' as any]: prof?.cor ?? 'transparent' }}
      onClick={(e) => { e.stopPropagation(); abrirConsultaCard(c.id); }}
      onDragStart={(e) => onDragStart(e, e.clientY - e.currentTarget.getBoundingClientRect().top)}
      title={`${fmtHora(c.hora_inicio)} · ${c.pacientes?.nome} · ${p?.nome ?? ''} · ${STATUS_INFO[c.status].label}`}>
      <div className="bloco-top">
        <span className="bloco-hora font-display">{fmtHora(c.hora_inicio)}</span>
        <span className="bloco-st" title={STATUS_INFO[c.status].label}>{icone}</span>
      </div>
      <div className="bloco-nome">{compacto ? primeiroNome(c.pacientes?.nome ?? '') : c.pacientes?.nome}</div>
      {h >= 60 && <div className="bloco-proc">{p?.eh_manutencao_aparelho && '🦷 '}{p?.nome}</div>}
      {h >= 52 && tags.length > 0 && <Dots ids={tags} />}
    </div>
  );
}
