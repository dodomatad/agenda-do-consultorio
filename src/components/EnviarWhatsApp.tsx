import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { chamarFuncao, supabase } from '../lib/supabase';
import { fmtTelefone, linkWaMe, preencherModelo, abrirJanelaWhatsApp } from '../lib/utils';
import { Icon, Modal } from './ui';

/** Janela de envio manual. Usa a Edge Function; se o WhatsApp estiver desconectado, oferece wa.me. */
export function EnviarWhatsApp() {
  const { whatsapp: alvo, abrirWhatsApp, modelos, cfg, procedimentos, profissionais, toast, perfil, bump } = useStore();
  const { paciente, consulta, gatilho } = alvo!;
  const inicial = modelos.find((m) => m.gatilho === gatilho) ?? modelos[0];
  const [modeloId, setModeloId] = useState(inicial?.id ?? '');
  const vars = useMemo(() => ({
    nome: paciente.nome, data: consulta?.data, hora: consulta?.hora_inicio,
    procedimento: procedimentos.find((p) => p.id === consulta?.procedimento_id)?.nome,
    profissional: profissionais.find((p) => p.id === consulta?.profissional_id)?.nome,
    clinica: cfg?.nome_clinica, endereco: cfg?.endereco,
  }), [paciente, consulta, procedimentos, profissionais, cfg]);
  const [texto, setTexto] = useState(inicial ? preencherModelo(inicial.texto, vars) : '');
  const [enviando, setEnviando] = useState(false);
  const conectado = cfg?.whatsapp_status === 'conectado';
  const fechar = () => abrirWhatsApp(null);

  useEffect(() => { const m = modelos.find((x) => x.id === modeloId); if (m) setTexto(preencherModelo(m.texto, vars)); }, [modeloId]); // eslint-disable-line

  async function viaWaMe() {
    abrirJanelaWhatsApp(paciente.telefone_whatsapp, texto);
    const agoraIso = new Date().toISOString();
    await supabase.from('mensagens_whatsapp').insert({
      paciente_id: paciente.id, consulta_id: consulta?.id ?? null, modelo_id: modeloId || null, texto,
      telefone: paciente.telefone_whatsapp, direcao: 'enviada', status: 'enviada', enviado_por: perfil?.id ?? 'manual', erro: null,
    });
    if (consulta?.id) {
      await supabase.from('consultas').update({ lembrete_enviado: true }).eq('id', consulta.id);
      await supabase.from('fila_lembretes').update({ status: 'enviado', enviado_em: agoraIso }).eq('consulta_id', consulta.id).eq('status', 'na fila');
    }
    toast('WhatsApp aberto com a mensagem pronta ✓'); bump(); fechar();
  }

  async function enviar() {
    if (!conectado) return viaWaMe();
    setEnviando(true);
    try {
      const r = await chamarFuncao('enviar-mensagem', { paciente_id: paciente.id, consulta_id: consulta?.id, modelo_id: modeloId || null, texto });
      if (r.ok) { toast('Mensagem enviada'); bump(); fechar(); }
      else if (r.erro === 'desconectado') { toast('WhatsApp desconectado — abrindo pelo wa.me', 'info'); viaWaMe(); }
      else toast(r.erro ?? 'Erro ao enviar', 'erro');
    } catch { toast('Falha na conexão — tente pelo wa.me', 'erro'); }
    setEnviando(false);
  }

  const [copiado, setCopiado] = useState(false);

  function copiarTexto() {
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    toast('Texto copiado para a área de transferência!');
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <Modal titulo={<span className="wa-title"><Icon n="whatsapp" /> Enviar WhatsApp</span>} subtitulo={`${paciente.nome} · ${fmtTelefone(paciente.telefone_whatsapp)}`} onClose={fechar}
      rodape={<>
        <button className="btn ghost" type="button" onClick={copiarTexto}>
          <Icon n="copiar" s={16} /> {copiado ? 'Copiado! ✓' : 'Copiar texto'}
        </button>
        <button className="btn wa" disabled={enviando || !texto.trim() || !paciente.telefone_whatsapp} onClick={enviar}>
          <Icon n="whatsapp" s={18} /> {enviando ? 'Abrindo…' : 'Abrir conversa no WhatsApp'}
        </button></>}>
      {!paciente.aceita_whatsapp && <div className="banner vermelho">Este paciente pediu para não receber mensagens pelo WhatsApp.</div>}
      {!paciente.telefone_whatsapp && <div className="banner vermelho">Paciente sem telefone cadastrado.</div>}
      <div className="banner verde" style={{ background: 'var(--c-brand-50, #E8F5F1)', color: 'var(--c-brand-800, #0B4F46)', borderColor: 'var(--c-brand-200, #A3D9CE)', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>
        <span>🚀</span>
        <small style={{ fontSize: '0.85rem', lineHeight: 1.4 }}>
          Ao clicar em <b>Abrir conversa no WhatsApp</b>, a mensagem vai pré-digitada diretamente para o WhatsApp do paciente sem custo e sem risco de banimento.
        </small>
      </div>
      <div className="field"><span>Modelo de mensagem</span>
        <div className="chips">{modelos.filter((m) => m.ativo || m.gatilho === 'manual').map((m) => <button key={m.id} className={m.id === modeloId ? 'chip on' : 'chip'} onClick={() => setModeloId(m.id)}>{m.nome}</button>)}</div>
      </div>
      <label className="field"><span>Mensagem (pode editar livremente)</span><textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
      <div className="bolha-wrap"><div className="bolha">{texto || '…'}</div></div>
    </Modal>
  );
}
