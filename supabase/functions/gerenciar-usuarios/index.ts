// Gerenciamento de usuários (somente admin): criar, alterar papel, desativar.
import { admin, autenticar, cors, json } from '../_shared/whatsapp.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await autenticar(req);
  if (!user || user === 'service' || user.papel !== 'admin') return json({ erro: 'Apenas o administrador' }, 403);
  const sb = admin();
  const b = await req.json();

  if (b.acao === 'criar') {
    const { data, error } = await sb.auth.admin.createUser({
      email: b.email, password: b.senha, email_confirm: true, user_metadata: { nome: b.nome, papel: b.papel },
    });
    if (error) return json({ erro: error.message }, 400);
    await sb.from('perfis').update({ papel: b.papel, nome: b.nome }).eq('id', data.user.id);
    return json({ ok: true });
  }
  if (b.acao === 'atualizar') {
    if (b.id === user.id && b.papel && b.papel !== 'admin') return json({ erro: 'Você não pode remover seu próprio acesso de admin' }, 400);
    await sb.from('perfis').update({ papel: b.papel, ativo: b.ativo }).eq('id', b.id);
    if (b.ativo === false) await sb.auth.admin.updateUserById(b.id, { ban_duration: '876000h' });
    if (b.ativo === true) await sb.auth.admin.updateUserById(b.id, { ban_duration: 'none' });
    return json({ ok: true });
  }
  return json({ erro: 'Ação inválida' }, 400);
});
