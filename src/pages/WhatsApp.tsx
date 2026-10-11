import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { chamarFuncao, supabase } from '../lib/supabase';
import type { Mensagem, Modelo } from '../lib/types';
import { addDias, cls, hojeISO, preencherModelo, tempoRelativo, VARIAVEIS, abrirJanelaWhatsApp } from '../lib/utils';
import { Empty, Icon, Modal, Segmented, Spinner, Toggle } from '../components/ui';

const GATILHOS: Record<string, { label: string; desc: string; unidade?: 'dias' | 'horas' }> = {
  confirmacao: { label: 'Lembrete com confirmação', desc: 'Enviado antes da consulta, pedindo para responder 1 ou 2.', unidade: 'dias' },
  lembrete_dia: { label: 'Lembrete no dia', desc: 'Enviado algumas horas antes da consulta.', unidade: 'horas' },
  manutencao: { label: 'Aviso de manutenção do aparelho', desc: 'Para quem usa aparelho e ainda não marcou.', unidade: 'dias' },
  aniversario: { label: 'Aniversário', desc: 'No dia do aniversário, dentro do horário comercial.' },
  falta: { label: 'Paciente faltou', desc: 'Oferece remarcar após a falta.' },
  manual: { label: 'Envio manual', desc: 'Só aparece na janela de envio manual.' },
};

export default function WhatsApp() {
  const { isAdmin } = useStore();
  const [aba, setAba] = useState<'conexao' | 'automaticos' | 'historico'>(isAdmin ? 'conexao' : 'automaticos');
  return (
    <div className="page">
      <header className="page-head"><div><h1><span className="wa-txt">●</span> WhatsApp</h1><p className="muted">Mensagens da clínica, manuais e automáticas.</p></div></header>
      <Segmented value={aba} onChange={setAba} options={[
        { v: 'conexao', l: '📱 Conexão' }, { v: 'automaticos', l: '✍️ Modelos e automáticos' }, { v: 'historico', l: '🕑 Histórico' }]} />
      <div className="fade" key={aba}>
        {aba === 'conexao' && <Conexao />}
        {aba === 'automaticos' && <Modelos />}
        {aba === 'historico' && <Historico />}
      </div>
    </div>
  );
}

function Conexao() {
  const { cfg, isAdmin, toast } = useStore();
  const [qr, setQr] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const conectado = cfg?.whatsapp_status === 'conectado';

  async function acao(a: 'status' | 'qrcode' | 'desconectar') {
    setCarregando(true);
    try {
      const r = await chamarFuncao('whatsapp-conexao', { acao: a });
      if (a === 'qrcode') { if (r.imagem) setQr(r.imagem); else toast(r.erro ?? 'QR Code indisponível', 'info'); }
      else toast(r.status === 'conectado' ? 'WhatsApp conectado ✓' : 'WhatsApp desconectado', r.status === 'conectado' ? 'ok' : 'info');
    } catch (e: any) { toast('Erro: ' + e.message, 'erro'); }
    setCarregando(false);
  }
  // Enquanto o QR estiver aberto, verifica a conexão a cada 5 segundos
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(async () => { const r = await chamarFuncao('whatsapp-conexao', { acao: 'status' }).catch(() => null); if (r?.status === 'conectado') { setQr(null); toast('WhatsApp conectado ✓'); } }, 5000);
    const r = setInterval(() => acao('qrcode'), 30000); // QR expira
    return () => { clearInterval(t); clearInterval(r); };
  }, [qr]); // eslint-disable-line

  return (
    <div className="grid-wa">
      <section className="card conexao-card">
        <div className="status-wa on">
          <span className="pulso" />
          <div>
            <b>Modo Multi-Aparelhos Ativo (Celular + Computador)</b>
            <small className="muted">Zero custo de servidor · Risco de banimento zero · Conexão direta</small>
          </div>
        </div>

        <div className="banner verde" style={{ background: 'var(--c-brand-50, #E8F5F1)', color: 'var(--c-brand-800, #0B4F46)', borderColor: 'var(--c-brand-200, #A3D9CE)', margin: '16px 0', padding: '16px', borderRadius: 8 }}>
          <b style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem' }}>
            <span>⚡</span> Como funciona a conexão única:
          </b>
          <p style={{ margin: '8px 0 14px', fontSize: '0.88rem', lineHeight: 1.5 }}>
            O WhatsApp já permite conectar até <b>4 computadores ao mesmo tempo no mesmo número</b> de celular.
            Ao abrir a Agenda do Consultório no seu notebook ou no celular, ao clicar em enviar uma mensagem, o sistema abre diretamente a conversa do paciente com o texto pré-digitado!
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn wa" type="button" onClick={() => abrirJanelaWhatsApp()}>
              <Icon n="whatsapp" s={18} /> Abrir WhatsApp Web Agora
            </button>
            <button className="btn ghost" type="button" onClick={() => toast('No celular, o app do WhatsApp oficial abre automaticamente ao enviar!')}>
              📱 No Celular (Abre Direto o App)
            </button>
          </div>
        </div>

        <div className="card" style={{ background: 'var(--surface-alt)', border: 'none', padding: '14px' }}>
          <b>💡 Dica de ouro para a rotina da recepção:</b>
          <p className="muted" style={{ fontSize: '0.85rem', margin: '6px 0 0', lineHeight: 1.4 }}>
            Deixe uma aba do WhatsApp Web aberta no seu computador ou use o aplicativo do WhatsApp para Windows. Assim, sempre que você clicar em "Enviar WhatsApp" na Agenda, a mensagem é carregada na hora sem precisar ler QR Code de novo!
          </p>
        </div>
      </section>

      <section className="card">
        <h3>Vantagens deste modelo</h3>
        <ul className="lista-check">
          <li>✅ <b>Conexão compartilhada:</b> Você e sua equipe usam o mesmo número oficial da clínica.</li>
          <li>📱 <b>Funciona em qualquer lugar:</b> No computador, notebook ou celular sem instalar nada.</li>
          <li>💰 <b>Custo R$ 0,00 perpétuo:</b> Sem mensalidades de plataformas terceiras nem servidores VPS.</li>
          <li>🛡️ <b>Anti-Bloqueio:</b> Zero risco de a Meta/WhatsApp banir o número do consultório.</li>
          <li>✍️ <b>100% sob controle:</b> As mensagens saem pré-formatadas com nome do paciente, dia, horário e dentista.</li>
        </ul>
      </section>
    </div>
  );
}

function Modelos() {
  const { modelos, recarregar, cfg, toast, confirmar } = useStore();
  const [edit, setEdit] = useState<Partial<Modelo> | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const exemplo = { nome: 'Maria Silva', data: addDias(hojeISO(), 1), hora: '14:30', procedimento: 'Limpeza', profissional: 'Dra. Ana', clinica: cfg?.nome_clinica, endereco: cfg?.endereco };

  async function toggle(m: Modelo, ativo: boolean) {
    await supabase.from('modelos_mensagem').update({ ativo }).eq('id', m.id); recarregar(); toast(ativo ? 'Envio ligado' : 'Envio desligado');
  }
  function inserir(v: string) {
    const el = ref.current; if (!el || !edit) return;
    const t = edit.texto ?? ''; const a = el.selectionStart, b = el.selectionEnd; const novo = t.slice(0, a) + `{${v}}` + t.slice(b);
    setEdit({ ...edit, texto: novo }); requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = a + v.length + 2; });
  }
  async function salvar() {
    if (!edit?.nome?.trim() || !edit.texto?.trim()) return toast('Preencha nome e texto', 'erro');
    const d = { nome: edit.nome, texto: edit.texto, ativo: edit.ativo ?? true, gatilho: edit.gatilho ?? 'manual', antecedencia: edit.antecedencia ?? 0, antecedencia_unidade: GATILHOS[edit.gatilho ?? 'manual']?.unidade ?? 'dias' };
    const { error } = edit.id ? await supabase.from('modelos_mensagem').update(d).eq('id', edit.id) : await supabase.from('modelos_mensagem').insert(d);
    if (error) return toast('Erro ao salvar', 'erro');
    toast('Modelo salvo'); setEdit(null); recarregar();
  }
  async function excluir(m: Modelo) {
    if (!(await confirmar(`Excluir o modelo “${m.nome}”?`, { ok: 'Excluir', perigo: true }))) return;
    await supabase.from('modelos_mensagem').delete().eq('id', m.id); toast('Modelo excluído'); recarregar();
  }

  const ordem = ['confirmacao', 'lembrete_dia', 'manutencao', 'falta', 'aniversario', 'manual'];
  return <>
    <div className="head-acoes" style={{ justifyContent: 'flex-end', margin: '16px 0' }}>
      <button className="btn primary" onClick={() => setEdit({ gatilho: 'manual', texto: 'Olá, {nome}! ', ativo: true })}><Icon n="mais" s={18} /> Novo modelo manual</button>
    </div>
    <div className="modelos-grid">{[...modelos].sort((a, b) => ordem.indexOf(a.gatilho) - ordem.indexOf(b.gatilho)).map((m) => {
      const g = GATILHOS[m.gatilho];
      return <div key={m.id} className={cls('card modelo-card', !m.ativo && 'off', m.gatilho === 'manutencao' && 'aparelho')}>
        <div className="modelo-top">
          <div><b>{m.nome}</b><small className="muted">{g?.label}{g?.unidade && m.antecedencia ? ` · ${m.antecedencia} ${m.antecedencia_unidade} antes` : ''}</small></div>
          {m.gatilho !== 'manual' && <Toggle on={m.ativo} onChange={(v) => toggle(m, v)} />}
        </div>
        <div className="bolha-wrap"><div className="bolha">{preencherModelo(m.texto, exemplo)}</div></div>
        <div className="acoes-card">
          <button className="btn ghost sm" onClick={() => setEdit(m)}><Icon n="lapis" s={14} /> Editar texto</button>
          {m.gatilho === 'manual' && <button className="btn ghost sm danger" onClick={() => excluir(m)}><Icon n="lixo" s={14} /></button>}
        </div>
      </div>;
    })}</div>

    {edit && <Modal titulo={edit.id ? `Editar: ${edit.nome}` : 'Novo modelo'} onClose={() => setEdit(null)} largura={680}
      rodape={<><button className="btn ghost" onClick={() => setEdit(null)}>Cancelar</button><button className="btn primary" onClick={salvar}>Salvar modelo</button></>}>
      <div className="grid2">
        <label className="field"><span>Nome</span><input value={edit.nome ?? ''} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></label>
        {GATILHOS[edit.gatilho ?? 'manual']?.unidade && <label className="field"><span>Enviar quanto tempo antes?</span>
          <div className="inline"><input type="number" min={0} value={edit.antecedencia ?? 0} onChange={(e) => setEdit({ ...edit, antecedencia: Number(e.target.value) })} /> {GATILHOS[edit.gatilho!].unidade}</div></label>}
      </div>
      <p className="muted">{GATILHOS[edit.gatilho ?? 'manual']?.desc}</p>
      <div className="field"><span>Clique para inserir uma variável</span>
        <div className="chips">{VARIAVEIS.map((v) => <button key={v} type="button" className="chip var" onClick={() => inserir(v)}>{`{${v}}`}</button>)}</div></div>
      <label className="field"><span>Texto</span><textarea ref={ref} rows={5} value={edit.texto ?? ''} onChange={(e) => setEdit({ ...edit, texto: e.target.value })} /></label>
      <div className="field"><span>Pré-visualização</span><div className="bolha-wrap"><div className="bolha">{preencherModelo(edit.texto ?? '', exemplo)}</div></div>
        <small className="muted">Usamos só o primeiro nome do paciente.</small></div>
    </Modal>}
  </>;
}

function Historico() {
  const { versao, abrirPaciente } = useStore();
  const [lista, setLista] = useState<Mensagem[] | null>(null);
  const [filtro, setFiltro] = useState<'todas' | 'erro' | 'recebida'>('todas');
  useEffect(() => {
    let q = supabase.from('mensagens_whatsapp').select('*, pacientes(nome)').order('criado_em', { ascending: false }).limit(150);
    if (filtro === 'erro') q = q.eq('status', 'erro'); if (filtro === 'recebida') q = q.eq('direcao', 'recebida');
    q.then(({ data }) => setLista(data ?? []));
  }, [versao, filtro]);
  return <>
    <div style={{ margin: '16px 0' }}><Segmented value={filtro} onChange={setFiltro} options={[{ v: 'todas', l: 'Todas' }, { v: 'recebida', l: '📥 Recebidas' }, { v: 'erro', l: '❌ Com erro' }]} /></div>
    {!lista ? <Spinner /> : !lista.length ? <Empty emoji="💬" titulo="Nenhuma mensagem ainda" texto="As mensagens enviadas e recebidas vão aparecer aqui." /> :
      <div className="card"><ul className="historico">{lista.map((m) => (
        <li key={m.id} onClick={() => m.paciente_id && abrirPaciente(m.paciente_id)}>
          <span className={cls('dir', m.direcao)}>{m.direcao === 'enviada' ? '↗' : '↙'}</span>
          <div><b>{m.pacientes?.nome ?? 'Número desconhecido'}</b><p>{m.texto}</p>
            <small className="muted">{tempoRelativo(m.criado_em)} · {m.direcao === 'enviada' ? (m.enviado_por === 'automatico' ? '🤖 automático' : '👤 manual') : 'recebida'}
              {m.status === 'erro' ? <span className="vermelho-txt"> · ❌ {m.erro}</span> : m.direcao === 'enviada' && ` · ${m.status}`}</small></div>
        </li>))}</ul></div>}
  </>;
}
