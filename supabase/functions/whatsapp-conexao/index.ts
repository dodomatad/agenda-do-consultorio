// Status / QR Code / desconexão do WhatsApp da clínica.
import { admin, autenticar, cors, json, provedor } from '../_shared/whatsapp.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await autenticar(req);
  if (!user) return json({ erro: 'Não autorizado' }, 401);
  const { acao = 'status' } = await req.json().catch(() => ({}));
  const isAdmin = user === 'service' || user.papel === 'admin';
  if (acao !== 'status' && !isAdmin) return json({ erro: 'Apenas o administrador pode fazer isso' }, 403);

  const sb = admin();
  const p = provedor();

  if (acao === 'qrcode') return json(await p.qrCode());
  if (acao === 'desconectar') await p.desconectar();

  const st = await p.status();
  const novo = st.conectado ? 'conectado' : 'desconectado';
  const { data: cfg } = await sb.from('configuracoes').select('whatsapp_status').eq('id', 1).single();
  await sb.from('configuracoes').update({ whatsapp_status: novo, whatsapp_status_em: new Date().toISOString() }).eq('id', 1);

  if (cfg?.whatsapp_status === 'conectado' && novo === 'desconectado') {
    await sb.from('notificacoes').insert({
      tipo: 'whatsapp_erro', prioridade: 'alta', titulo: 'WhatsApp da clínica desconectado',
      mensagem: 'Os envios automáticos estão parados. Peça ao administrador para reconectar.',
    });
  }
  return json({ status: novo, detalhe: st.detalhe });
});
