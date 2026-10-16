-- =====================================================================
-- Auditoria de Exportações de Dados Pessoais (LGPD)
-- =====================================================================

create table if not exists auditoria_exportacoes (
  id bigserial primary key,
  tipo text not null default 'pacientes',
  usuario_id uuid references auth.users(id),
  total_registros int not null default 0,
  filtros_aplicados jsonb,
  criado_em timestamptz not null default now()
);

alter table auditoria_exportacoes enable row level security;

drop policy if exists aud_exp_select on auditoria_exportacoes;
drop policy if exists aud_exp_insert on auditoria_exportacoes;

create policy aud_exp_select on auditoria_exportacoes
  for select to authenticated using (is_admin());

-- Insert: usuario_id precisa ser o usuário autenticado atual.
-- Admin pode registrar exportação de pacientes e consultas.
-- Staff pode registrar exportação de consultas (mantendo o acesso da Agenda liberado com auditoria).
create policy aud_exp_insert on auditoria_exportacoes
  for insert to authenticated with check (
    usuario_id = auth.uid() and (
      is_admin() or (is_staff() and tipo = 'consultas')
    )
  );
