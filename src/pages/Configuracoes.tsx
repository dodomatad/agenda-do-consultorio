import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { chamarFuncao, supabase } from '../lib/supabase';
import type { Config, Perfil, Procedimento, Profissional } from '../lib/types';
import { DIAS_CURTO, fmtMoeda } from '../lib/utils';
import { Avatar, Icon, Modal, Paleta, Segmented, Toggle } from '../components/ui';

export default function Configuracoes() {
  const { isAdmin } = useStore();
  const [aba, setAba] = useState<'clinica' | 'notificacoes' | 'profissionais' | 'procedimentos' | 'usuarios'>('clinica');
  const opts = [{ v: 'clinica', l: '🏥 Clínica' }, { v: 'notificacoes', l: '🔔 Notificações' }, { v: 'profissionais', l: '👩‍⚕️ Profissionais' }, { v: 'procedimentos', l: '🦷 Procedimentos' }] as any[];
  if (isAdmin) opts.push({ v: 'usuarios', l: '👥 Usuários' });
  return (
    <div className="page">
      <header className="page-head"><div><h1>Configurações</h1></div></header>
      <div className="scroll-x"><Segmented value={aba} onChange={setAba} options={opts} /></div>
      <div className="fade" key={aba} style={{ marginTop: 16 }}>
        {aba === 'clinica' && <Clinica />}{aba === 'notificacoes' && <Notifs />}
        {aba === 'profissionais' && <Profissionais />}{aba === 'procedimentos' && <Procedimentos />}{aba === 'usuarios' && <Usuarios />}
      </div>
    </div>
  );
}

function useCfgForm() {
  const { cfg, toast, recarregar } = useStore();
  const [f, setF] = useState<Config | null>(cfg);
  useEffect(() => setF(cfg), [cfg]);
  const salvar = async (parcial?: Partial<Config>) => {
    const d = { ...f, ...parcial } as any; delete d.id; delete d.whatsapp_status; delete d.whatsapp_status_em;
    const { error } = await supabase.from('configuracoes').update(d).eq('id', 1);
    toast(error ? 'Erro ao salvar' : 'Configurações salvas', error ? 'erro' : 'ok'); recarregar();
  };
  return { f, setF, salvar };
}

function Clinica() {
  const { f, setF, salvar } = useCfgForm();
  if (!f) return null;
  const set = (k: keyof Config, v: any) => setF({ ...f, [k]: v });
  return <section className="card form-card">
    <div className="grid2">
      <label className="field"><span>Nome da clínica</span><input value={f.nome_clinica} onChange={(e) => set('nome_clinica', e.target.value)} /></label>
      <label className="field"><span>Endereço</span><input value={f.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} /></label>
      <label className="field"><span>Abre às</span><input type="time" value={(f.horario_abertura ?? '08:00').slice(0, 5)} onChange={(e) => set('horario_abertura', e.target.value)} /></label>
      <label className="field"><span>Fecha às</span><input type="time" value={(f.horario_fechamento ?? '18:00').slice(0, 5)} onChange={(e) => set('horario_fechamento', e.target.value)} /></label>
      <label className="field"><span>Almoço — início</span><input type="time" value={f.almoco_inicio?.slice(0, 5) ?? ''} onChange={(e) => set('almoco_inicio', e.target.value || null)} /></label>
      <label className="field"><span>Almoço — fim</span><input type="time" value={f.almoco_fim?.slice(0, 5) ?? ''} onChange={(e) => set('almoco_fim', e.target.value || null)} /></label>
    </div>
    <div className="field"><span>Dias de atendimento</span><div className="chips">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => <button key={d} className={f.dias_atendimento.includes(d) ? 'chip on' : 'chip'}
        onClick={() => set('dias_atendimento', f.dias_atendimento.includes(d) ? f.dias_atendimento.filter((x) => x !== d) : [...f.dias_atendimento, d])}>{DIAS_CURTO[d]}</button>)}
    </div></div>
    <label className="field inline"><span>Intervalo entre envios automáticos</span><input type="number" min={3} max={60} value={f.intervalo_envio_segundos} onChange={(e) => set('intervalo_envio_segundos', Number(e.target.value))} /> segundos</label>
    <button className="btn primary" onClick={() => salvar()}>Salvar</button>
  </section>;
}

function Notifs() {
  const { f, setF, salvar } = useCfgForm();
  if (!f) return null;
  const itens: [keyof Config, string, string][] = [
    ['notif_aparelho', '🦷 Manutenção do aparelho', 'Avisa antes do vencimento, no dia e quando atrasar.'],
    ['notif_confirmacao', '📋 Confirmações pendentes', 'Consultas de amanhã ainda não confirmadas.'],
    ['notif_falta', '🚫 Faltas', 'Quando um paciente falta (alerta especial se faltar 2 vezes seguidas).'],
    ['notif_whatsapp', '💬 Mensagens do WhatsApp', 'Novas mensagens e respostas dos pacientes.'],
    ['notif_aniversario', '🎂 Aniversários', 'Aniversariantes do dia.'],
    ['notif_sumido', '👋 Pacientes sumidos', 'Quem não vem há muito tempo.'],
  ];
  return <section className="card form-card">
    {itens.map(([k, t, d]) => <div key={k} className="linha-toggle"><div><b>{t}</b><small className="muted">{d}</small></div>
      <Toggle on={!!f[k]} onChange={(v) => { setF({ ...f, [k]: v }); salvar({ [k]: v } as any); }} /></div>)}
    <div className="grid2">
      <label className="field"><span>Avisar a manutenção quantos dias antes?</span><div className="inline"><input type="number" min={1} max={30} value={f.antecedencia_manutencao_dias} onChange={(e) => setF({ ...f, antecedencia_manutencao_dias: Number(e.target.value) })} /> dias</div></label>
      <label className="field"><span>Paciente sumido após</span><div className="inline"><input type="number" min={1} max={36} value={f.meses_paciente_sumido} onChange={(e) => setF({ ...f, meses_paciente_sumido: Number(e.target.value) })} /> meses</div></label>
    </div>
    <p className="muted">As verificações rodam todos os dias às 7h. Faltas e respostas do WhatsApp aparecem na hora.</p>
    <button className="btn primary" onClick={() => salvar()}>Salvar</button>
  </section>;
}

function Profissionais() {
  const { profissionais, recarregar, toast, confirmar } = useStore();
  const [e, setE] = useState<Partial<Profissional> | null>(null);
  async function salvar() {
    if (!e?.nome?.trim()) return;
    const d = { nome: e.nome.trim(), cor: e.cor ?? '#127A6C', ativo: e.ativo ?? true };
    const { error } = e.id ? await supabase.from('profissionais').update(d).eq('id', e.id) : await supabase.from('profissionais').insert(d);
    if (error) return toast('Erro ao salvar profissional', 'erro');
    toast('Profissional salvo'); setE(null); recarregar();
  }
  async function excluir(p: Profissional) {
    if (!(await confirmar(`Excluir ${p.nome}? As consultas continuam, mas sem profissional.`, { ok: 'Excluir', perigo: true }))) return;
    const { error } = await supabase.from('profissionais').delete().eq('id', p.id);
    if (error) return toast('Erro ao excluir profissional', 'erro');
    toast('Profissional excluído'); recarregar();
  }
  return <section className="card form-card">
    <p className="muted">Opcional — útil para clínicas com mais de um dentista. Cada um ganha uma cor na agenda.</p>
    <ul className="lista-simples">{profissionais.map((p) => <li key={p.id}><Avatar nome={p.nome} cor={p.cor} tam={36} /><b>{p.nome}</b>{!p.ativo && <small className="muted">inativo</small>}
      <span className="flex1" /><button className="icon-btn" onClick={() => setE(p)}><Icon n="lapis" s={16} /></button><button className="icon-btn danger" onClick={() => excluir(p)}><Icon n="lixo" s={16} /></button></li>)}</ul>
    <button className="btn primary" onClick={() => setE({ cor: '#127A6C', ativo: true })}><Icon n="mais" s={18} /> Adicionar profissional</button>
    {e && <Modal titulo={e.id ? 'Editar profissional' : 'Novo profissional'} onClose={() => setE(null)} largura={440}
      rodape={<><button className="btn ghost" onClick={() => setE(null)}>Cancelar</button><button className="btn primary" onClick={salvar}>Salvar</button></>}>
      <label className="field"><span>Nome</span><input autoFocus value={e.nome ?? ''} onChange={(x) => setE({ ...e, nome: x.target.value })} placeholder="Dra. Ana Souza" /></label>
      <div className="field"><span>Cor</span><Paleta value={e.cor ?? '#127A6C'} onChange={(c) => setE({ ...e, cor: c })} /></div>
      <Toggle on={e.ativo ?? true} onChange={(v) => setE({ ...e, ativo: v })} label="Ativo" />
    </Modal>}
  </section>;
}

function Procedimentos() {
  const { procedimentos, recarregar, toast, confirmar } = useStore();
  const [e, setE] = useState<Partial<Procedimento> | null>(null);
  async function salvar() {
    if (!e?.nome?.trim()) return;
    const d = {
      nome: e.nome,
      cor: e.cor ?? '#127A6C',
      duracao_padrao: e.duracao_padrao ?? 30,
      eh_manutencao_aparelho: !!e.eh_manutencao_aparelho,
      preco: e.preco != null && Number(e.preco) > 0 ? Number(e.preco) : null,
    };
    const { error } = e.id ? await supabase.from('procedimentos').update(d).eq('id', e.id) : await supabase.from('procedimentos').insert(d);
    toast(error ? 'Erro ao salvar' : 'Procedimento salvo', error ? 'erro' : 'ok'); setE(null); recarregar();
  }
  async function excluir(p: Procedimento) {
    if (!(await confirmar(`Excluir o procedimento "${p.nome}"?`, { ok: 'Excluir', perigo: true }))) return;
    const { error } = await supabase.from('procedimentos').delete().eq('id', p.id);
    toast(error ? 'Não foi possível excluir (pode haver consultas vinculadas)' : 'Procedimento removido', error ? 'erro' : 'ok');
    recarregar();
  }
  return <section className="card form-card">
    <ul className="lista-simples">{procedimentos.map((p) => <li key={p.id}><i className="dot" style={{ background: p.cor }} /><b>{p.nome}</b><small className="muted">{p.duracao_padrao} min{p.eh_manutencao_aparelho && ' · aparelho'}{p.preco ? ` · ${fmtMoeda(Number(p.preco))}` : ''}</small>
      <span className="flex1" /><button className="icon-btn" onClick={() => setE(p)} title="Editar"><Icon n="lapis" s={16} /></button><button className="icon-btn" onClick={() => excluir(p)} title="Excluir"><Icon n="lixo" s={16} /></button></li>)}</ul>
    <button className="btn primary" onClick={() => setE({ cor: '#127A6C', duracao_padrao: 30, preco: null })}><Icon n="mais" s={18} /> Novo procedimento</button>
    {e && <Modal titulo={e.id ? 'Editar procedimento' : 'Novo procedimento'} onClose={() => setE(null)} largura={440}
      rodape={<><button className="btn ghost" onClick={() => setE(null)}>Cancelar</button><button className="btn primary" onClick={salvar}>Salvar</button></>}>
      <label className="field"><span>Nome</span><input value={e.nome ?? ''} onChange={(x) => setE({ ...e, nome: x.target.value })} /></label>
      <label className="field inline"><span>Duração padrão</span><input type="number" min={5} step={5} value={e.duracao_padrao ?? 30} onChange={(x) => setE({ ...e, duracao_padrao: Number(x.target.value) })} /> min</label>
      <label className="field inline"><span>Preço padrão (R$)</span><input type="number" min={0} step={1} placeholder="Ex: 150 (opcional)" value={e.preco ?? ''} onChange={(x) => setE({ ...e, preco: x.target.value ? Number(x.target.value) : null })} /> opcional</label>
      <div className="field"><span>Cor</span><Paleta value={e.cor ?? '#127A6C'} onChange={(c) => setE({ ...e, cor: c })} /></div>
      <Toggle on={!!e.eh_manutencao_aparelho} onChange={(v) => setE({ ...e, eh_manutencao_aparelho: v })} label="É manutenção de aparelho" />
    </Modal>}
  </section>;
}

function Usuarios() {
  const { toast, perfil } = useStore();
  const [lista, setLista] = useState<Perfil[]>([]);
  const [novo, setNovo] = useState<{ nome: string; email: string; senha: string; papel: 'admin' | 'atendente' } | null>(null);
  const carregar = () => supabase.from('perfis').select('*').order('nome').then(({ data }) => setLista(data ?? []));
  useEffect(() => { carregar(); }, []);
  async function criar() {
    try { const r = await chamarFuncao('gerenciar-usuarios', { acao: 'criar', ...novo }); if (r.erro) throw new Error(r.erro); toast('Usuário criado'); setNovo(null); carregar(); }
    catch (e: any) { toast(e.message, 'erro'); }
  }
  async function atualizar(u: Perfil, d: Partial<Perfil>) {
    try {
      const r = await chamarFuncao('gerenciar-usuarios', { acao: 'atualizar', id: u.id, papel: d.papel ?? u.papel, ativo: d.ativo ?? u.ativo });
      if (r.erro) throw new Error(r.erro);
      toast('Usuário atualizado');
      carregar();
    } catch {
      const { error } = await supabase.from('perfis').update({ papel: d.papel ?? u.papel, ativo: d.ativo ?? u.ativo }).eq('id', u.id);
      if (error) return toast('Erro ao atualizar usuário', 'erro');
      toast('Usuário atualizado');
      carregar();
    }
  }
  return <section className="card form-card">
    <ul className="lista-simples">{lista.map((u) => <li key={u.id}><Avatar nome={u.nome} tam={36} /><div><b>{u.nome}{u.id === perfil?.id && ' (você)'}</b><small className="muted">{u.email}</small></div>
      <span className="flex1" />
      <select value={u.papel} disabled={u.id === perfil?.id} onChange={(e) => atualizar(u, { papel: e.target.value as any })}><option value="atendente">Atendente</option><option value="admin">Admin</option></select>
      {u.id !== perfil?.id && <Toggle on={u.ativo} onChange={(v) => atualizar(u, { ativo: v })} />}</li>)}</ul>
    <button className="btn primary" onClick={() => setNovo({ nome: '', email: '', senha: '', papel: 'atendente' })}><Icon n="mais" s={18} /> Novo usuário</button>
    {novo && <Modal titulo="Novo usuário" onClose={() => setNovo(null)} largura={440}
      rodape={<><button className="btn ghost" onClick={() => setNovo(null)}>Cancelar</button><button className="btn primary" onClick={criar}>Criar</button></>}>
      <label className="field"><span>Nome</span><input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></label>
      <label className="field"><span>E-mail</span><input type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} /></label>
      <label className="field"><span>Senha inicial</span><input type="text" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} placeholder="mínimo 6 caracteres" /></label>
      <label className="field"><span>Perfil</span><select value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value as any })}><option value="atendente">Atendente</option><option value="admin">Admin (dentista/dono)</option></select></label>
    </Modal>}
  </section>;
}
