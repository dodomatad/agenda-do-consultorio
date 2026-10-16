import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import type { Etiqueta } from '../lib/types';
import { cls, iniciais, PALETA } from '../lib/utils';

// ---------- Ícones (SVG em linha, sem dependências) ----------
const paths: Record<string, string> = {
  agenda: 'M7 3v2M17 3v2M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  pacientes: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 19v-1a4 4 0 0 0-3-3.87M16 3.13a3.5 3.5 0 0 1 0 6.75',
  sino: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  whatsapp: 'M3 21l1.65-4.95A9 9 0 1 1 7.95 19.35L3 21Z',
  etiqueta: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01',
  config: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 7 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 1.17 14H1a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 7a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 10 1.17V1a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 22.83 10H23a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  mais: 'M12 5v14M5 12h14', x: 'M18 6 6 18M6 6l12 12', busca: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35',
  esq: 'M15 18l-6-6 6-6', dir: 'M9 18l6-6-6-6', lua: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z',
  sol: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  sair: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9', lixo: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  lapis: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z', filtro: 'M22 3H2l8 9.46V19l4 2v-8.54Z',
  grade: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z', lista: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  check: 'M20 6 9 17l-5-5', relogio: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  telefone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.1 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z',
  envio: 'M22 2 11 13M22 2l-7 20-4-9-9-4Z', usuario: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  fila: 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM4 12h-2m20 0h-2m-9-9V1m0 22v-2',
  financeiro: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  cifrao: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  carteira: 'M20 7V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M16 12h6m-3-3v6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  menu: 'M4 6h16M4 12h16M4 18h16',
  pontos: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm7 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  play: 'M5 3l14 9-14 9V3z', pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
};
export function Icon({ n, s = 20, className }: { n: string; s?: number; className?: string }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={paths[n] ?? ''} />
    </svg>
  );
}

// ---------- Janela modal ----------
export function Modal({ titulo, onClose, children, largura = 560, rodape, subtitulo }: {
  titulo: ReactNode; subtitulo?: ReactNode; onClose: () => void; children: ReactNode; largura?: number; rodape?: ReactNode;
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: largura }} role="dialog" aria-modal>
        <header className="modal-head">
          <div><h2>{titulo}</h2>{subtitulo && <p className="muted">{subtitulo}</p>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon n="x" /></button>
        </header>
        <div className="modal-body">{children}</div>
        {rodape && <footer className="modal-foot">{rodape}</footer>}
      </div>
    </div>
  );
}

// ---------- Etiquetas como pílulas ----------
export function Pill({ e, onRemove, small }: { e: Pick<Etiqueta, 'nome' | 'cor' | 'icone'>; onRemove?: () => void; small?: boolean }) {
  return (
    <span className={cls('pill', small && 'pill-sm')} style={{ ['--c' as any]: e.cor }}>
      {e.icone && <span>{e.icone}</span>}{e.nome}
      {onRemove && <button onClick={onRemove} aria-label={`Remover ${e.nome}`}>×</button>}
    </span>
  );
}
export function Pills({ ids, small, max = 99 }: { ids: string[]; small?: boolean; max?: number }) {
  const { etiquetas } = useStore();
  const lista = ids.map((id) => etiquetas.find((e) => e.id === id)).filter(Boolean) as Etiqueta[];
  if (!lista.length) return null;
  return <div className="pills">{lista.slice(0, max).map((e) => <Pill key={e.id} e={e} small={small} />)}
    {lista.length > max && <span className="pill pill-sm" style={{ ['--c' as any]: '#6B7C85' }}>+{lista.length - max}</span>}</div>;
}
export function Dots({ ids }: { ids: string[] }) {
  const { etiquetas } = useStore();
  return <span className="dots">{ids.map((id) => { const e = etiquetas.find((x) => x.id === id); return e ? <i key={id} style={{ background: e.cor }} title={e.nome} /> : null; })}</span>;
}

export function Avatar({ nome, foto, tam = 40, cor }: { nome: string; foto?: string | null; tam?: number; cor?: string }) {
  const hue = [...nome].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return foto
    ? <img className="avatar" src={foto} alt="" style={{ width: tam, height: tam }} />
    : <span className="avatar" style={{ width: tam, height: tam, fontSize: tam * 0.38, background: cor ?? `hsl(${hue} 45% 88%)`, color: cor ? '#fff' : `hsl(${hue} 50% 28%)` }}>{iniciais(nome)}</span>;
}

export function Empty({ emoji, titulo, texto, acao }: { emoji: string; titulo: string; texto?: string; acao?: ReactNode }) {
  return <div className="empty"><div className="empty-emoji">{emoji}</div><h3>{titulo}</h3>{texto && <p className="muted">{texto}</p>}{acao}</div>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return <label className="toggle"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /><span className="track"><span /></span>{label && <span>{label}</span>}</label>;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: ReactNode }[]; onChange: (v: T) => void }) {
  return <div className="segmented">{options.map((o) => <button key={o.v} className={cls(value === o.v && 'on')} onClick={() => onChange(o.v)}>{o.l}</button>)}</div>;
}

export function Paleta({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return <div className="paleta">{PALETA.map((c) => <button key={c} type="button" className={cls(value === c && 'on')} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />)}</div>;
}

// ---------- Campo de etiquetas: busca as existentes e cria nova na hora ----------
export function TagPicker({ tipo, value, onChange }: { tipo: 'paciente' | 'consulta'; value: string[]; onChange: (ids: string[]) => void }) {
  const { etiquetas, recarregar, toast } = useStore();
  const [q, setQ] = useState('');
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const disponiveis = useMemo(() => etiquetas.filter((e) => e.tipo === tipo && !value.includes(e.id) && e.nome.toLowerCase().includes(q.toLowerCase())), [etiquetas, tipo, value, q]);
  const existeExata = etiquetas.some((e) => e.tipo === tipo && e.nome.toLowerCase() === q.trim().toLowerCase());

  useEffect(() => {
    const f = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAberto(false);
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f);
  }, []);

  async function criar() {
    const cor = PALETA[etiquetas.length % PALETA.length];
    const { data, error } = await supabase.from('etiquetas').insert({ nome: q.trim(), cor, tipo }).select().single();
    if (error) return toast('Não foi possível criar a etiqueta', 'erro');
    await recarregar(); onChange([...value, data.id]); setQ(''); toast('Etiqueta criada');
  }

  return (
    <div className="tagpicker" ref={ref}>
      <div className="tagpicker-box" onClick={() => setAberto(true)}>
        {value.map((id) => { const e = etiquetas.find((x) => x.id === id); return e ? <Pill key={id} e={e} small onRemove={() => onChange(value.filter((v) => v !== id))} /> : null; })}
        <input value={q} placeholder={value.length ? '' : 'Buscar ou criar etiqueta…'} onFocus={() => setAberto(true)}
          onChange={(e) => { setQ(e.target.value); setAberto(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (disponiveis[0]) { onChange([...value, disponiveis[0].id]); setQ(''); } else if (q.trim()) criar(); } }} />
      </div>
      {aberto && (disponiveis.length > 0 || q.trim()) && (
        <div className="dropdown">
          {disponiveis.slice(0, 8).map((e) => <button type="button" key={e.id} onClick={() => { onChange([...value, e.id]); setQ(''); }}><Pill e={e} small /></button>)}
          {q.trim() && !existeExata && <button type="button" className="criar" onClick={criar}><Icon n="mais" s={16} /> Criar etiqueta “{q.trim()}”</button>}
        </div>
      )}
    </div>
  );
}

export function Spinner() { return <div className="spinner" aria-label="Carregando" />; }
