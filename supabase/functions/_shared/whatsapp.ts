// Camada única de serviço do WhatsApp.
// Para trocar Z-API pela API oficial (Meta Cloud API) basta mudar o secret
// WHATSAPP_PROVIDER=meta e configurar os secrets META_* — o app não muda.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const admin = (): SupabaseClient =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

/** Valida o JWT do usuário. Retorna perfil ou null. Aceita service role (cron). */
export async function autenticar(req: Request): Promise<{ id: string; papel: string } | 'service' | null> {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!token) return null;
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return 'service';
  const sb = admin();
  const { data } = await sb.auth.getUser(token);
  if (!data.user) return null;
  const { data: perfil } = await sb.from('perfis').select('id,papel,ativo').eq('id', data.user.id).single();
  if (!perfil?.ativo) return null;
  return { id: perfil.id, papel: perfil.papel };
}

export function normalizarTelefone(tel: string): string {
  let d = (tel ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}

// ---------------------------------------------------------------------
// Provedores
// ---------------------------------------------------------------------
export interface ResultadoEnvio { ok: boolean; id?: string; erro?: string }
export interface Provedor {
  enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio>;
  status(): Promise<{ conectado: boolean; detalhe?: string }>;
  qrCode(): Promise<{ imagem?: string; erro?: string }>;
  desconectar(): Promise<void>;
}

class ZApi implements Provedor {
  base = `https://api.z-api.io/instances/${Deno.env.get('ZAPI_INSTANCE_ID')}/token/${Deno.env.get('ZAPI_TOKEN')}`;
  headers = { 'Content-Type': 'application/json', 'Client-Token': Deno.env.get('ZAPI_CLIENT_TOKEN') ?? '' };

  async enviarTexto(telefone: string, texto: string) {
    try {
      const r = await fetch(`${this.base}/send-text`, {
        method: 'POST', headers: this.headers, body: JSON.stringify({ phone: telefone, message: texto }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, erro: b?.error ?? b?.message ?? `HTTP ${r.status}` };
      return { ok: true, id: b.messageId ?? b.id };
    } catch (e) { return { ok: false, erro: String(e) }; }
  }
  async status() {
    try {
      const r = await fetch(`${this.base}/status`, { headers: this.headers });
      const b = await r.json();
      return { conectado: !!b.connected, detalhe: b.error };
    } catch (e) { return { conectado: false, detalhe: String(e) }; }
  }
  async qrCode() {
    const r = await fetch(`${this.base}/qr-code/image`, { headers: this.headers });
    const b = await r.json().catch(() => ({}));
    if (b.connected) return { erro: 'Já conectado' };
    return b.value ? { imagem: b.value } : { erro: b.error ?? 'QR Code indisponível' };
  }
  async desconectar() { await fetch(`${this.base}/disconnect`, { headers: this.headers }); }
}

class MetaCloud implements Provedor {
  url = `https://graph.facebook.com/v20.0/${Deno.env.get('META_PHONE_NUMBER_ID')}`;
  headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('META_ACCESS_TOKEN')}` };

  async enviarTexto(telefone: string, texto: string) {
    // Obs.: fora da janela de 24h a Meta exige "templates" aprovados.
    const r = await fetch(`${this.url}/messages`, {
      method: 'POST', headers: this.headers,
      body: JSON.stringify({ messaging_product: 'whatsapp', to: telefone, type: 'text', text: { body: texto } }),
    });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: b?.error?.message ?? `HTTP ${r.status}` };
    return { ok: true, id: b.messages?.[0]?.id };
  }
  async status() {
    const r = await fetch(this.url, { headers: this.headers });
    return { conectado: r.ok };
  }
  async qrCode() { return { erro: 'A API oficial não usa QR Code — configure pelo painel da Meta.' }; }
  async desconectar() {}
}

export function provedor(): Provedor {
  return (Deno.env.get('WHATSAPP_PROVIDER') ?? 'zapi') === 'meta' ? new MetaCloud() : new ZApi();
}

// ---------------------------------------------------------------------
// Modelos de mensagem
// ---------------------------------------------------------------------
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function preencherModelo(texto: string, v: {
  nome?: string; data?: string; hora?: string; procedimento?: string; profissional?: string;
  clinica?: string; endereco?: string;
}) {
  let dataBR = '', diaSemana = '';
  if (v.data) {
    const [y, m, d] = v.data.split('-').map(Number);
    dataBR = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    diaSemana = DIAS[new Date(y, m - 1, d).getDay()];
  }
  const map: Record<string, string> = {
    nome: (v.nome ?? '').trim().split(/\s+/)[0] ?? '',
    data: dataBR, dia_semana: diaSemana, hora: (v.hora ?? '').slice(0, 5),
    procedimento: v.procedimento ?? '', profissional: v.profissional ?? '',
    clinica: v.clinica ?? '', endereco: v.endereco ?? '',
  };
  return texto.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}

/** Envia e registra no histórico. Respeita aceita_whatsapp e chave_unica (anti-duplicidade). */
export async function enviarMensagem(sb: SupabaseClient, p: {
  paciente_id: string; texto: string; consulta_id?: string | null; modelo_id?: string | null;
  enviado_por: string; chave_unica?: string;
}): Promise<{ ok: boolean; erro?: string; duplicada?: boolean; id?: string }> {
  const { data: pac } = await sb.from('pacientes').select('nome,telefone_whatsapp,aceita_whatsapp').eq('id', p.paciente_id).single();
  if (!pac) return { ok: false, erro: 'Paciente não encontrado' };
  if (!pac.aceita_whatsapp) return { ok: false, erro: 'Paciente não aceita receber WhatsApp' };
  if (!pac.telefone_whatsapp) return { ok: false, erro: 'Paciente sem telefone' };
  const telefone = normalizarTelefone(pac.telefone_whatsapp);

  // Reserva o registro primeiro: se a chave já existe, não envia de novo.
  const { data: reg, error } = await sb.from('mensagens_whatsapp').insert({
    paciente_id: p.paciente_id, consulta_id: p.consulta_id ?? null, modelo_id: p.modelo_id ?? null,
    telefone, texto: p.texto, direcao: 'enviada', status: 'pendente', enviado_por: p.enviado_por,
    chave_unica: p.chave_unica ?? null,
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return { ok: false, duplicada: true, erro: 'Mensagem já enviada' };
    return { ok: false, erro: error.message };
  }

  const res = await provedor().enviarTexto(telefone, p.texto);
  await sb.from('mensagens_whatsapp').update({
    status: res.ok ? 'enviada' : 'erro', erro: res.erro ?? null, provider_message_id: res.id ?? null,
  }).eq('id', reg.id);

  if (!res.ok) {
    await sb.from('notificacoes').insert({
      tipo: 'whatsapp_erro', paciente_id: p.paciente_id, consulta_id: p.consulta_id ?? null, prioridade: 'alta',
      titulo: `Erro ao enviar WhatsApp para ${pac.nome}`, mensagem: res.erro,
    });
  }
  return { ok: res.ok, erro: res.erro, id: reg.id };
}
