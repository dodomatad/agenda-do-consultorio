import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { Etiqueta } from '../lib/types';
import { PALETA } from '../lib/utils';
import { Empty, Icon, Modal, Paleta, Pill, Segmented } from '../components/ui';

const EMOJIS = ['', '🦷', '⭐', '💳', '💼', '🧸', '😰', '⚠️', '🤝', '🚨', '✨', '🔁', '⏱️', '❤️', '👴', '🎓', '🏥', '💎'];

export default function Etiquetas() {
  const s = useStore();
  const { etiquetas, recarregar, toast } = s;
  const [tipo, setTipo] = useState<'paciente' | 'consulta'>('paciente');
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [edit, setEdit] = useState<Partial<Etiqueta> | null>(null);

  useEffect(() => {
    Promise.all([supabase.from('paciente_etiquetas').select('etiqueta_id'), supabase.from('consulta_etiquetas').select('etiqueta_id')]).then(([a, b]) => {
      const c: Record<string, number> = {};
      for (const x of [...(a.data ?? []), ...(b.data ?? [])]) c[x.etiqueta_id] = (c[x.etiqueta_id] ?? 0) + 1;
      setContagem(c);
    });
  }, [etiquetas]);

  async function salvar() {
    if (!edit?.nome?.trim()) return toast('Dê um nome à etiqueta', 'erro');
    const dados = { nome: edit.nome.trim(), cor: edit.cor, icone: edit.icone || null, tipo: edit.tipo ?? tipo };
    const { error } = edit.id ? await supabase.from('etiquetas').update(dados).eq('id', edit.id) : await supabase.from('etiquetas').insert(dados);
    if (error) return toast(error.code === '23505' ? 'Já existe uma etiqueta com esse nome' : 'Erro ao salvar', 'erro');
    toast(edit.id ? 'Etiqueta atualizada' : 'Etiqueta criada'); setEdit(null); recarregar();
  }
  async function excluir(e: Etiqueta) {
    const n = contagem[e.id] ?? 0;
    if (!(await s.confirmar(`Excluir a etiqueta “${e.nome}”?${n ? ` Ela será removida de ${n} ${tipo === 'paciente' ? 'paciente(s)' : 'consulta(s)'}.` : ''}`, { ok: 'Excluir', perigo: true }))) return;
    await supabase.from('etiquetas').delete().eq('id', e.id); toast('Etiqueta excluída'); recarregar();
  }

  const lista = etiquetas.filter((e) => e.tipo === tipo);
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Etiquetas</h1><p className="muted">Organize pacientes e consultas com cores.</p></div>
        <button className="btn primary" onClick={() => setEdit({ cor: PALETA[lista.length % 12], icone: '', tipo })}><Icon n="mais" s={18} /> Nova etiqueta</button>
      </header>
      <Segmented value={tipo} onChange={setTipo} options={[{ v: 'paciente', l: '🧑 De paciente' }, { v: 'consulta', l: '📅 De consulta' }]} />
      {lista.length === 0 ? <Empty emoji="🏷️" titulo="Nenhuma etiqueta" texto="Crie etiquetas para encontrar pacientes mais rápido." acao={<button className="btn primary" onClick={() => setEdit({ cor: PALETA[0], tipo })}>Criar etiqueta</button>} /> :
        <div className="etiquetas-grid fade">{lista.map((e) => (
          <div key={e.id} className="card etiqueta-card" style={{ ['--c' as any]: e.cor }}>
            <Pill e={e} />
            <span className="muted">{contagem[e.id] ?? 0} {tipo === 'paciente' ? ((contagem[e.id] ?? 0) === 1 ? 'paciente' : 'pacientes') : 'consultas'}</span>
            <div className="et-acoes">
              <button className="icon-btn" onClick={() => setEdit(e)} aria-label="Editar"><Icon n="lapis" s={16} /></button>
              <button className="icon-btn danger" onClick={() => excluir(e)} aria-label="Excluir"><Icon n="lixo" s={16} /></button>
            </div>
          </div>
        ))}</div>}

      {edit && <Modal titulo={edit.id ? 'Editar etiqueta' : 'Nova etiqueta'} onClose={() => setEdit(null)} largura={460}
        rodape={<><button className="btn ghost" onClick={() => setEdit(null)}>Cancelar</button><button className="btn primary" onClick={salvar}>Salvar</button></>}>
        <div className="preview-pill"><Pill e={{ nome: edit.nome || 'Nome da etiqueta', cor: edit.cor ?? PALETA[0], icone: edit.icone ?? null }} /></div>
        <label className="field"><span>Nome</span><input autoFocus value={edit.nome ?? ''} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && salvar()} /></label>
        <div className="field"><span>Cor</span><Paleta value={edit.cor ?? PALETA[0]} onChange={(c) => setEdit({ ...edit, cor: c })} /></div>
        <div className="field"><span>Emoji (opcional)</span><div className="emojis">{EMOJIS.map((em) => (
          <button key={em || 'nenhum'} type="button" className={(edit.icone ?? '') === em ? 'on' : ''} onClick={() => setEdit({ ...edit, icone: em })}>{em || '∅'}</button>))}</div></div>
      </Modal>}
    </div>
  );
}
