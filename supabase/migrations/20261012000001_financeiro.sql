-- =====================================================================
-- Módulo Financeiro — Transações e Preço de Procedimentos
-- =====================================================================

-- 1. Coluna de preço sugerido em procedimentos
alter table procedimentos
  add column if not exists preco numeric(10,2);

-- 2. Tabela de transações financeiras
create table if not exists transacoes_financeiras (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('receita', 'despesa')),
  categoria text not null,
  descricao text not null,
  valor numeric(10,2) not null check (valor > 0),
  forma_pagamento text check (forma_pagamento in ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'convenio')),
  status text not null default 'pago' check (status in ('pago', 'pendente', 'cancelado')),
  data_competencia date not null default current_date,
  data_pagamento date,
  paciente_id uuid references pacientes(id) on delete set null,
  consulta_id uuid references consultas(id) on delete set null,
  profissional_id uuid references profissionais(id) on delete set null,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Índices recomendados para consultas rápidas por período, status e vínculos
create index if not exists transacoes_data_competencia_idx on transacoes_financeiras (data_competencia desc);
create index if not exists transacoes_status_idx on transacoes_financeiras (status);
create index if not exists transacoes_consulta_idx on transacoes_financeiras (consulta_id);
create index if not exists transacoes_paciente_idx on transacoes_financeiras (paciente_id);
create index if not exists transacoes_tipo_idx on transacoes_financeiras (tipo);

-- 3. Trigger para atualizado_em e criado_por
create or replace function transacoes_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
    new.criado_em := coalesce(new.criado_em, now());
    new.atualizado_em := now();
    return new;
  elsif tg_op = 'UPDATE' then
    new.atualizado_em := now();
    return new;
  end if;
  return new;
end $$;

drop trigger if exists transacoes_auditoria_biu on transacoes_financeiras;
create trigger transacoes_auditoria_biu before insert or update on transacoes_financeiras
  for each row execute function transacoes_auditoria();

-- 4. Row Level Security (RLS)
alter table transacoes_financeiras enable row level security;

drop policy if exists transacoes_select on transacoes_financeiras;
drop policy if exists transacoes_insert on transacoes_financeiras;
drop policy if exists transacoes_update on transacoes_financeiras;
drop policy if exists transacoes_delete on transacoes_financeiras;

-- Leitura e escrita para membros ativos da equipe (staff)
create policy transacoes_select on transacoes_financeiras for select to authenticated using (is_staff());
create policy transacoes_insert on transacoes_financeiras for insert to authenticated with check (is_staff());
create policy transacoes_update on transacoes_financeiras for update to authenticated using (is_staff()) with check (is_staff());

-- Exclusão física reservada apenas para administradores (fluxo padrão do sistema é marcar status='cancelado')
create policy transacoes_delete on transacoes_financeiras for delete to authenticated using (is_admin());

-- 5. Publicação no Supabase Realtime (opcional para sincronização viva)
do $$ begin
  alter publication supabase_realtime add table transacoes_financeiras;
exception when others then null; end $$;
