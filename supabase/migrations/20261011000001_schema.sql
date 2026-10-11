-- =====================================================================
-- Agenda do Consultório — esquema completo
-- Rode no SQL Editor do Supabase (ou `supabase db push`).
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Perfis de usuário (admin / atendente)
-- ---------------------------------------------------------------------
create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email text,
  papel text not null default 'atendente' check (papel in ('admin','atendente')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- O primeiro usuário cadastrado vira admin automaticamente.
create or replace function handle_novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, email, papel)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
    new.email,
    case when (select count(*) from perfis) = 0 then 'admin'
         else coalesce(new.raw_user_meta_data->>'papel','atendente') end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_novo_usuario();

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo);
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where id = auth.uid() and ativo and papel = 'admin');
$$;

-- ---------------------------------------------------------------------
-- Tabelas principais
-- ---------------------------------------------------------------------
create table if not exists pacientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone_whatsapp text,
  data_nascimento date,
  cpf text,
  email text,
  usa_aparelho boolean not null default false,
  intervalo_manutencao_dias int not null default 30,
  aceita_whatsapp boolean not null default true,
  observacoes text,
  foto_url text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists pacientes_nome_idx on pacientes (lower(nome));

create table if not exists etiquetas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cor text not null default '#127A6C',
  icone text,
  tipo text not null default 'paciente' check (tipo in ('paciente','consulta')),
  criado_em timestamptz not null default now(),
  unique (nome, tipo)
);

create table if not exists paciente_etiquetas (
  paciente_id uuid references pacientes(id) on delete cascade,
  etiqueta_id uuid references etiquetas(id) on delete cascade,
  primary key (paciente_id, etiqueta_id)
);

create table if not exists profissionais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cor text not null default '#127A6C',
  ativo boolean not null default true
);

create table if not exists procedimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cor text not null default '#127A6C',
  duracao_padrao int not null default 30,
  eh_manutencao_aparelho boolean not null default false
);

create table if not exists consultas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  profissional_id uuid references profissionais(id) on delete set null,
  data date not null,
  hora_inicio time not null,
  duracao_minutos int not null default 30,
  procedimento_id uuid references procedimentos(id) on delete set null,
  status text not null default 'agendado'
    check (status in ('agendado','confirmado','em atendimento','atendido','faltou','desmarcou')),
  observacoes text,
  lembrete_enviado boolean not null default false,
  confirmado_via_whatsapp boolean not null default false,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id),
  atualizado_em timestamptz
);
create index if not exists consultas_data_idx on consultas (data);
create index if not exists consultas_paciente_idx on consultas (paciente_id, data);

create table if not exists consulta_etiquetas (
  consulta_id uuid references consultas(id) on delete cascade,
  etiqueta_id uuid references etiquetas(id) on delete cascade,
  primary key (consulta_id, etiqueta_id)
);

-- Auditoria (LGPD): quem criou/alterou consultas
create table if not exists auditoria_consultas (
  id bigserial primary key,
  consulta_id uuid,
  acao text not null,
  usuario_id uuid,
  dados_antes jsonb,
  dados_depois jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists notificacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null, -- aparelho | confirmacao | falta | whatsapp_resposta | whatsapp_mensagem | aniversario | sumido | whatsapp_erro
  paciente_id uuid references pacientes(id) on delete cascade,
  consulta_id uuid references consultas(id) on delete cascade,
  titulo text not null,
  mensagem text,
  prioridade text not null default 'media' check (prioridade in ('alta','media','baixa')),
  lida boolean not null default false,
  resolvida boolean not null default false,
  data_referencia date,
  chave_unica text unique, -- evita notificação duplicada
  criado_em timestamptz not null default now()
);
create index if not exists notificacoes_criado_idx on notificacoes (criado_em desc);

create table if not exists modelos_mensagem (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  gatilho text not null default 'manual'
    check (gatilho in ('manual','confirmacao','lembrete_dia','manutencao','falta','aniversario')),
  texto text not null,
  ativo boolean not null default true,
  antecedencia int not null default 0,
  antecedencia_unidade text not null default 'dias' check (antecedencia_unidade in ('dias','horas'))
);

create table if not exists mensagens_whatsapp (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid references pacientes(id) on delete cascade,
  consulta_id uuid references consultas(id) on delete set null,
  modelo_id uuid references modelos_mensagem(id) on delete set null,
  telefone text,
  texto text not null,
  direcao text not null default 'enviada' check (direcao in ('enviada','recebida')),
  status text not null default 'pendente' check (status in ('pendente','enviada','entregue','lida','erro')),
  erro text,
  enviado_por text not null default 'automatico', -- 'automatico' ou uuid do usuário
  provider_message_id text,
  chave_unica text unique, -- garante: nunca a mesma mensagem automática duas vezes
  criado_em timestamptz not null default now()
);
create index if not exists mensagens_paciente_idx on mensagens_whatsapp (paciente_id, criado_em desc);

create table if not exists configuracoes (
  id int primary key default 1 check (id = 1),
  nome_clinica text not null default 'Clínica Sorriso',
  endereco text default '',
  horario_abertura time not null default '08:00',
  horario_fechamento time not null default '18:00',
  almoco_inicio time default '12:00',
  almoco_fim time default '13:00',
  dias_atendimento int[] not null default '{1,2,3,4,5,6}', -- 0=domingo ... 6=sábado
  provedor_whatsapp text not null default 'zapi' check (provedor_whatsapp in ('zapi','meta')),
  whatsapp_status text not null default 'desconectado',
  whatsapp_status_em timestamptz,
  intervalo_envio_segundos int not null default 8,
  -- Notificações
  notif_aparelho boolean not null default true,
  notif_confirmacao boolean not null default true,
  notif_falta boolean not null default true,
  notif_whatsapp boolean not null default true,
  notif_aniversario boolean not null default true,
  notif_sumido boolean not null default true,
  antecedencia_manutencao_dias int not null default 5,
  meses_paciente_sumido int not null default 6
  -- Credenciais do WhatsApp: NUNCA aqui. Ficam em Supabase Secrets.
);
insert into configuracoes (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------------
-- Triggers de auditoria
-- ---------------------------------------------------------------------
create or replace function consultas_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
    new.atualizado_em := now();
    return new;
  end if;
  return new;
end $$;

drop trigger if exists consultas_auditoria_bi on consultas;
create trigger consultas_auditoria_bi before insert or update on consultas
  for each row execute function consultas_auditoria();

create or replace function consultas_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria_consultas (consulta_id, acao, usuario_id, dados_antes, dados_depois)
  values (coalesce(new.id, old.id), tg_op, auth.uid(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

drop trigger if exists consultas_log_ai on consultas;
create trigger consultas_log_ai after insert or update or delete on consultas
  for each row execute function consultas_log();

-- ---------------------------------------------------------------------
-- Notificação em tempo real: falta registrada
-- ---------------------------------------------------------------------
create or replace function notificar_falta() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nome text; v_seguidas int; v_cfg configuracoes;
begin
  select * into v_cfg from configuracoes where id = 1;
  if not v_cfg.notif_falta then return new; end if;
  if new.status = 'faltou' and (old.status is distinct from 'faltou') then
    select nome into v_nome from pacientes where id = new.paciente_id;
    -- faltas seguidas (consultas passadas mais recentes, ignorando desmarcadas)
    select count(*) into v_seguidas from (
      select status, row_number() over (order by data desc, hora_inicio desc) rn
      from consultas
      where paciente_id = new.paciente_id and status in ('atendido','faltou')
    ) t
    where status = 'faltou'
      and rn < coalesce((select min(rn) from (
        select status, row_number() over (order by data desc, hora_inicio desc) rn
        from consultas where paciente_id = new.paciente_id and status in ('atendido','faltou')
      ) x where x.status = 'atendido'), 999999);

    insert into notificacoes (tipo, paciente_id, consulta_id, titulo, mensagem, prioridade, data_referencia, chave_unica)
    values ('falta', new.paciente_id, new.id,
      case when v_seguidas >= 2
        then v_nome || ' faltou ' || v_seguidas || ' vezes seguidas ⚠️'
        else v_nome || ' faltou hoje, oferecer remarcação' end,
      case when v_seguidas >= 2 then 'Atenção: paciente com faltas repetidas. Vale ligar pessoalmente.'
        else 'Envie uma mensagem oferecendo um novo horário.' end,
      case when v_seguidas >= 2 then 'alta' else 'media' end,
      new.data, 'falta:' || new.id)
    on conflict (chave_unica) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists consultas_falta_au on consultas;
create trigger consultas_falta_au after update of status on consultas
  for each row execute function notificar_falta();

-- Ao marcar consulta futura para paciente de aparelho, resolve alertas de manutenção pendentes
create or replace function resolver_alertas_aparelho() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('agendado','confirmado') then
    update notificacoes set resolvida = true
    where paciente_id = new.paciente_id and tipo = 'aparelho' and not resolvida;
  end if;
  return new;
end $$;

drop trigger if exists consultas_resolve_aparelho on consultas;
create trigger consultas_resolve_aparelho after insert on consultas
  for each row execute function resolver_alertas_aparelho();

-- ---------------------------------------------------------------------
-- Geração diária de notificações (cron às 7h de Brasília)
-- ---------------------------------------------------------------------
create or replace function gerar_notificacoes_diarias() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_cfg configuracoes;
  r record;
  v_count int := 0;
  v_dias int;
begin
  select * into v_cfg from configuracoes where id = 1;

  -- 1) Aparelho
  if v_cfg.notif_aparelho then
    for r in
      select p.id, p.nome, p.intervalo_manutencao_dias,
             (select max(c.data) from consultas c join procedimentos pr on pr.id = c.procedimento_id
               where c.paciente_id = p.id and pr.eh_manutencao_aparelho and c.status = 'atendido') as ultima
      from pacientes p
      where p.ativo and p.usa_aparelho
        and not exists (select 1 from consultas c where c.paciente_id = p.id
                        and c.data >= v_hoje and c.status in ('agendado','confirmado','em atendimento'))
    loop
      continue when r.ultima is null;
      v_dias := (r.ultima + r.intervalo_manutencao_dias) - v_hoje; -- dias até vencer
      if v_dias = v_cfg.antecedencia_manutencao_dias or (v_dias > 0 and v_dias < v_cfg.antecedencia_manutencao_dias) then
        insert into notificacoes (tipo, paciente_id, titulo, mensagem, prioridade, data_referencia, chave_unica)
        values ('aparelho', r.id, r.nome || ': faltam ' || v_dias || ' dias para a manutenção do aparelho',
                'Ainda não há consulta marcada. Que tal chamar pelo WhatsApp?', 'media', v_hoje,
                'aparelho:breve:' || r.id || ':' || (r.ultima + r.intervalo_manutencao_dias))
        on conflict (chave_unica) do nothing;
      elsif v_dias = 0 then
        insert into notificacoes (tipo, paciente_id, titulo, mensagem, prioridade, data_referencia, chave_unica)
        values ('aparelho', r.id, r.nome || ': manutenção do aparelho vence hoje',
                'Marque a manutenção o quanto antes.', 'alta', v_hoje, 'aparelho:hoje:' || r.id || ':' || v_hoje)
        on conflict (chave_unica) do nothing;
      elsif v_dias < 0 then
        insert into notificacoes (tipo, paciente_id, titulo, mensagem, prioridade, data_referencia, chave_unica)
        values ('aparelho', r.id, r.nome || ': manutenção atrasada há ' || abs(v_dias) || ' dias',
                'Paciente de aparelho sem manutenção marcada!', 'alta', v_hoje, 'aparelho:atraso:' || r.id || ':' || v_hoje)
        on conflict (chave_unica) do nothing;
      end if;
      v_count := v_count + 1;
    end loop;
  end if;

  -- 2) Confirmações de amanhã
  if v_cfg.notif_confirmacao then
    select count(*) into v_dias from consultas where data = v_hoje + 1 and status = 'agendado';
    if v_dias > 0 then
      insert into notificacoes (tipo, titulo, mensagem, prioridade, data_referencia, chave_unica)
      values ('confirmacao', v_dias || case when v_dias = 1 then ' consulta de amanhã ainda não foi confirmada'
                                             else ' consultas de amanhã ainda não foram confirmadas' end,
              'Confira a agenda de amanhã e confirme com os pacientes.', 'media', v_hoje + 1,
              'confirmacao:' || (v_hoje + 1))
      on conflict (chave_unica) do nothing;
    end if;
  end if;

  -- 3) Aniversários
  if v_cfg.notif_aniversario then
    insert into notificacoes (tipo, paciente_id, titulo, mensagem, prioridade, data_referencia, chave_unica)
    select 'aniversario', p.id, 'Hoje é aniversário de ' || p.nome || ' 🎂',
           'Que tal mandar uma mensagem carinhosa?', 'baixa', v_hoje, 'aniversario:' || p.id || ':' || v_hoje
    from pacientes p
    where p.ativo and p.data_nascimento is not null
      and extract(month from p.data_nascimento) = extract(month from v_hoje)
      and extract(day from p.data_nascimento) = extract(day from v_hoje)
    on conflict (chave_unica) do nothing;
  end if;

  -- 4) Pacientes sumidos
  if v_cfg.notif_sumido then
    insert into notificacoes (tipo, paciente_id, titulo, mensagem, prioridade, data_referencia, chave_unica)
    select 'sumido', p.id, p.nome || ' não vem há ' || v_cfg.meses_paciente_sumido || ' meses',
           'Sugestão: chamar para uma limpeza ou revisão.', 'baixa', v_hoje,
           'sumido:' || p.id || ':' || u.ultima
    from pacientes p
    join lateral (select max(data) ultima from consultas c where c.paciente_id = p.id and c.status = 'atendido') u on true
    where p.ativo and u.ultima is not null
      and u.ultima < v_hoje - make_interval(months => v_cfg.meses_paciente_sumido)
      and not exists (select 1 from consultas c where c.paciente_id = p.id and c.data >= v_hoje
                      and c.status in ('agendado','confirmado'))
    on conflict (chave_unica) do nothing;
  end if;

  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security — somente usuários logados da clínica
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['pacientes','etiquetas','paciente_etiquetas','consulta_etiquetas','profissionais',
    'procedimentos','consultas','notificacoes','mensagens_whatsapp','modelos_mensagem']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_select on %I', t);
    execute format('drop policy if exists staff_insert on %I', t);
    execute format('drop policy if exists staff_update on %I', t);
    execute format('drop policy if exists staff_delete on %I', t);
    execute format('create policy staff_select on %I for select to authenticated using (is_staff())', t);
    execute format('create policy staff_insert on %I for insert to authenticated with check (is_staff())', t);
    execute format('create policy staff_update on %I for update to authenticated using (is_staff()) with check (is_staff())', t);
    if t = 'pacientes' then
      execute format('create policy staff_delete on %I for delete to authenticated using (is_admin())', t);
    else
      execute format('create policy staff_delete on %I for delete to authenticated using (is_staff())', t);
    end if;
  end loop;
end $$;

alter table perfis enable row level security;
drop policy if exists perfis_select on perfis;
drop policy if exists perfis_admin on perfis;
create policy perfis_select on perfis for select to authenticated using (is_staff() or id = auth.uid());
create policy perfis_admin on perfis for all to authenticated using (is_admin()) with check (is_admin());

alter table configuracoes enable row level security;
drop policy if exists cfg_select on configuracoes;
drop policy if exists cfg_update on configuracoes;
create policy cfg_select on configuracoes for select to authenticated using (is_staff());
create policy cfg_update on configuracoes for update to authenticated using (is_staff()) with check (is_staff());

alter table auditoria_consultas enable row level security;
drop policy if exists aud_select on auditoria_consultas;
create policy aud_select on auditoria_consultas for select to authenticated using (is_admin());

-- ---------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table notificacoes;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table consultas;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table mensagens_whatsapp;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table configuracoes;
exception when others then null; end $$;

-- ---------------------------------------------------------------------
-- Dados iniciais
-- ---------------------------------------------------------------------
insert into procedimentos (nome, cor, duracao_padrao, eh_manutencao_aparelho) values
  ('Manutenção do aparelho', '#5B3FC4', 30, true),
  ('Avaliação',   '#127A6C', 30, false),
  ('Limpeza',     '#2B8FD6', 45, false),
  ('Restauração', '#E08A1E', 60, false),
  ('Canal',       '#C43D3D', 90, false),
  ('Extração',    '#8C4A2F', 60, false),
  ('Clareamento', '#D4A017', 60, false),
  ('Retorno',     '#3BA776', 30, false),
  ('Outro',       '#6B7C85', 30, false)
on conflict (nome) do nothing;

insert into etiquetas (nome, cor, icone, tipo) values
  ('Aparelho',     '#5B3FC4', '🦷', 'paciente'),
  ('Convênio',     '#2B8FD6', '💳', 'paciente'),
  ('Particular',   '#127A6C', '💼', 'paciente'),
  ('VIP',          '#D4A017', '⭐', 'paciente'),
  ('Criança',      '#E26BA5', '🧸', 'paciente'),
  ('Ansioso',      '#E08A1E', '😰', 'paciente'),
  ('Inadimplente', '#C43D3D', '⚠️', 'paciente'),
  ('Indicação',    '#3BA776', '🤝', 'paciente'),
  ('Urgência',     '#C43D3D', '🚨', 'consulta'),
  ('Primeira vez', '#2B8FD6', '✨', 'consulta'),
  ('Retorno',      '#3BA776', '🔁', 'consulta'),
  ('Encaixe',      '#E08A1E', '⏱️', 'consulta')
on conflict (nome, tipo) do nothing;

insert into modelos_mensagem (nome, gatilho, texto, antecedencia, antecedencia_unidade)
select * from (values
  ('Confirmação', 'confirmacao',
   'Olá, {nome}! 😊 Sua consulta na {clinica} está marcada para {dia_semana}, {data} às {hora}. Responda 1 para CONFIRMAR ou 2 se precisar REMARCAR.', 1, 'dias'),
  ('Lembrete do dia', 'lembrete_dia',
   'Oi, {nome}! Te esperamos hoje às {hora} na {clinica}. Até já!', 2, 'horas'),
  ('Manutenção do aparelho', 'manutencao',
   'Olá, {nome}! Está chegando a hora da manutenção do seu aparelho. Qual o melhor dia e horário para você vir?', 5, 'dias'),
  ('Falta', 'falta',
   'Oi, {nome}, sentimos sua falta hoje! Quer remarcar sua consulta? Temos horários esta semana.', 0, 'dias'),
  ('Aniversário', 'aniversario',
   'Feliz aniversário, {nome}! 🎉 Toda a equipe da {clinica} deseja um dia lindo pra você.', 0, 'dias')
) v(nome, gatilho, texto, antecedencia, antecedencia_unidade)
where not exists (select 1 from modelos_mensagem);
