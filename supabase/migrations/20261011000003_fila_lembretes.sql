-- =====================================================================
-- Fila de lembretes (Envio gradual humanizado pelo WhatsApp)
-- =====================================================================

-- Novas colunas na tabela configuracoes para controle da fila
alter table configuracoes
  add column if not exists fila_ativa boolean not null default true,
  add column if not exists fila_intervalo_minutos int not null default 60, -- 30, 60, 90, 120
  add column if not exists fila_janela_inicio_dias int not null default 3,  -- enviar a partir de X dias antes
  add column if not exists fila_janela_fim_dias int not null default 1,     -- enviar ate Y dias antes
  add column if not exists fila_incluir_faltas boolean not null default true,
  add column if not exists fila_ultimo_envio_em timestamptz,
  add column if not exists fila_erros_consecutivos int not null default 0;

-- Tabela fila_lembretes
create table if not exists fila_lembretes (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid references consultas(id) on delete cascade,
  paciente_id uuid not null references pacientes(id) on delete cascade,
  tipo text not null check (tipo in ('lembrete_consulta', 'manutencao_aparelho', 'remarcar_falta')),
  texto_final text not null,
  enviar_a_partir_de timestamptz not null default now(),
  enviar_ate timestamptz not null,
  prioridade int not null default 10, -- menor numero = maior prioridade
  status text not null default 'na fila'
    check (status in ('na fila', 'enviado', 'entregue', 'lido', 'respondido', 'erro', 'cancelado', 'pulado')),
  motivo text,
  resposta_paciente text,
  enviado_em timestamptz,
  provider_message_id text,
  chave_unica text unique,
  criado_em timestamptz not null default now()
);

create index if not exists fila_status_idx on fila_lembretes(status, prioridade, enviar_ate);
create index if not exists fila_consulta_idx on fila_lembretes(consulta_id);
create index if not exists fila_paciente_idx on fila_lembretes(paciente_id);

-- RLS
alter table fila_lembretes enable row level security;
drop policy if exists staff_fila_select on fila_lembretes;
drop policy if exists staff_fila_insert on fila_lembretes;
drop policy if exists staff_fila_update on fila_lembretes;
drop policy if exists staff_fila_delete on fila_lembretes;

create policy staff_fila_select on fila_lembretes for select to authenticated using (is_staff());
create policy staff_fila_insert on fila_lembretes for insert to authenticated with check (is_staff());
create policy staff_fila_update on fila_lembretes for update to authenticated using (is_staff()) with check (is_staff());
create policy staff_fila_delete on fila_lembretes for delete to authenticated using (is_staff());

-- Publicação em Realtime
do $$ begin
  alter publication supabase_realtime add table fila_lembretes;
exception when others then null; end $$;

-- ---------------------------------------------------------------------
-- Função para sincronizar a fila de lembretes
-- ---------------------------------------------------------------------
create or replace function sincronizar_fila_lembretes() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_cfg configuracoes;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agora timestamptz := now();
  r record;
  v_count int := 0;
  v_modelo_lembrete text;
  v_modelo_manut text;
  v_modelo_falta text;
  v_texto text;
  v_a_partir timestamptz;
  v_ate timestamptz;
  v_dia_semana text;
  v_dias text[] := array['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  v_data_br text;
  v_hora_br text;
begin
  select * into v_cfg from configuracoes where id = 1;

  -- 1) Pular lembretes vencidos ("pulado")
  update fila_lembretes
  set status = 'pulado',
      motivo = 'Prazo limite de envio expirou antes de ser disparado'
  where status = 'na fila' and enviar_ate < v_agora;

  -- Gerar notificação para os itens que foram pulados agora
  insert into notificacoes (tipo, paciente_id, consulta_id, titulo, mensagem, prioridade, data_referencia, chave_unica)
  select 'confirmacao', f.paciente_id, f.consulta_id,
         p.nome || ': lembrete não deu tempo de sair',
         'O lembrete perdeu o prazo de envio na fila. Entre em contato manualmente ou ligue.',
         'alta', v_hoje, 'pulado:' || f.id
  from fila_lembretes f
  join pacientes p on p.id = f.paciente_id
  where f.status = 'pulado' and f.enviar_ate >= (v_agora - interval '1 hour')
  on conflict (chave_unica) do nothing;

  -- Obter modelos ativos
  select coalesce(texto, 'Olá, {nome}! Sua consulta na {clinica} está marcada para {dia_semana}, {data} às {hora}. Responda 1 para CONFIRMAR ou 2 para REMARCAR.')
  into v_modelo_lembrete from modelos_mensagem where gatilho = 'confirmacao' and ativo limit 1;

  select coalesce(texto, 'Olá, {nome}! Está chegando a hora da manutenção do seu aparelho. Qual o melhor dia e horário para você vir?')
  into v_modelo_manut from modelos_mensagem where gatilho = 'manutencao' and ativo limit 1;

  select coalesce(texto, 'Oi, {nome}, sentimos sua falta hoje! Quer remarcar sua consulta? Temos horários esta semana.')
  into v_modelo_falta from modelos_mensagem where gatilho = 'falta' and ativo limit 1;

  -- 2) Alimentar lembretes de consultas futuras (entre janela_inicio e janela_fim)
  for r in
    select c.id as consulta_id, c.paciente_id, c.data, c.hora_inicio,
           p.nome as paciente_nome, p.telefone_whatsapp, p.aceita_whatsapp,
           pr.nome as proc_nome, pf.nome as prof_nome
    from consultas c
    join pacientes p on p.id = c.paciente_id
    left join procedimentos pr on pr.id = c.procedimento_id
    left join profissionais pf on pf.id = c.profissional_id
    where c.status = 'agendado'
      and c.confirmado_via_whatsapp = false
      and c.data >= v_hoje
      and c.data <= (v_hoje + (v_cfg.fila_janela_inicio_dias || ' days')::interval)::date
      and p.ativo
      and not exists (
        select 1 from fila_lembretes f
        where f.consulta_id = c.id
          and f.tipo = 'lembrete_consulta'
          and f.status in ('na fila', 'enviado', 'entregue', 'lido', 'respondido')
      )
  loop
    -- Formata data e hora
    v_dia_semana := v_dias[extract(dow from r.data)::int + 1];
    v_data_br := to_char(r.data, 'DD/MM/YYYY');
    v_hora_br := to_char(r.hora_inicio, 'HH24:MI');

    -- Substitui tags no modelo
    v_texto := v_modelo_lembrete;
    v_texto := replace(v_texto, '{nome}', split_part(trim(r.paciente_nome), ' ', 1));
    v_texto := replace(v_texto, '{clinica}', v_cfg.nome_clinica);
    v_texto := replace(v_texto, '{endereco}', coalesce(v_cfg.endereco, ''));
    v_texto := replace(v_texto, '{dia_semana}', v_dia_semana);
    v_texto := replace(v_texto, '{data}', v_data_br);
    v_texto := replace(v_texto, '{hora}', v_hora_br);
    v_texto := replace(v_texto, '{procedimento}', coalesce(r.proc_nome, 'Consulta'));
    v_texto := replace(v_texto, '{profissional}', coalesce(r.prof_nome, ''));

    -- Janela de envio: enviar_a_partir_de (data - janela_inicio) e enviar_ate (data - janela_fim no fim do expediente)
    v_a_partir := (r.data - (v_cfg.fila_janela_inicio_dias || ' days')::interval)::date + v_cfg.horario_abertura;
    v_ate := (r.data - (v_cfg.fila_janela_fim_dias || ' days')::interval)::date + v_cfg.horario_fechamento;

    -- Se já estiver dentro da janela ou atrasado para entrar, enviar imediatamente a partir de agora
    if v_a_partir < v_agora then v_a_partir := v_agora; end if;

    -- Só insere se enviar_ate ainda estiver no futuro
    if v_ate > v_agora then
      insert into fila_lembretes (
        consulta_id, paciente_id, tipo, texto_final, enviar_a_partir_de, enviar_ate, prioridade, status, chave_unica
      ) values (
        r.consulta_id, r.paciente_id, 'lembrete_consulta', v_texto, v_a_partir, v_ate,
        -- Prioridade baseada no quão próxima é a consulta (dias até a consulta)
        greatest(1, (r.data - v_hoje)),
        'na fila',
        'lembrete:' || r.consulta_id
      )
      on conflict (chave_unica) do nothing;
      v_count := v_count + 1;
    end if;
  end loop;

  -- 3) Manutenção do aparelho: pacientes de aparelho sem consulta futura
  for r in
    select p.id as paciente_id, p.nome as paciente_nome, p.intervalo_manutencao_dias,
           (select max(c.data) from consultas c
            join procedimentos pr on pr.id = c.procedimento_id
            where c.paciente_id = p.id and pr.eh_manutencao_aparelho and c.status = 'atendido') as ultima_data
    from pacientes p
    where p.ativo
      and p.usa_aparelho
      and not exists (
        select 1 from consultas c
        where c.paciente_id = p.id
          and c.data >= v_hoje
          and c.status in ('agendado', 'confirmado', 'em atendimento')
      )
  loop
    if r.ultima_data is not null then
      declare
        v_venc date := r.ultima_data + (r.intervalo_manutencao_dias || ' days')::interval;
        v_dias_ate_venc int := v_venc - v_hoje;
      begin
        -- Entra na fila X dias antes do vencimento (padrão 5 dias)
        if v_dias_ate_venc <= v_cfg.antecedencia_manutencao_dias and v_dias_ate_venc >= -15 then
          v_texto := replace(v_modelo_manut, '{nome}', split_part(trim(r.paciente_nome), ' ', 1));
          v_texto := replace(v_texto, '{clinica}', v_cfg.nome_clinica);

          insert into fila_lembretes (
            paciente_id, tipo, texto_final, enviar_a_partir_de, enviar_ate, prioridade, status, chave_unica
          ) values (
            r.paciente_id, 'manutencao_aparelho', v_texto, v_agora,
            (v_venc + interval '2 days'), 5, 'na fila',
            'fila_manut:' || r.paciente_id || ':' || v_venc
          )
          on conflict (chave_unica) do nothing;
        end if;
      end;
    end if;
  end loop;

  -- 4) Faltas (dia seguinte ao que faltou)
  if v_cfg.fila_incluir_faltas then
    for r in
      select c.id as consulta_id, c.paciente_id, c.data, p.nome as paciente_nome
      from consultas c
      join pacientes p on p.id = c.paciente_id
      where c.status = 'faltou'
        and c.data >= (v_hoje - interval '2 days')
        and not exists (
          select 1 from fila_lembretes f
          where f.consulta_id = c.id and f.tipo = 'remarcar_falta'
        )
        and not exists (
          select 1 from consultas cf
          where cf.paciente_id = c.paciente_id
            and cf.data >= v_hoje
            and cf.status in ('agendado', 'confirmado')
        )
    loop
      v_texto := replace(v_modelo_falta, '{nome}', split_part(trim(r.paciente_nome), ' ', 1));
      v_texto := replace(v_texto, '{clinica}', v_cfg.nome_clinica);

      insert into fila_lembretes (
        consulta_id, paciente_id, tipo, texto_final, enviar_a_partir_de, enviar_ate, prioridade, status, chave_unica
      ) values (
        r.consulta_id, r.paciente_id, 'remarcar_falta', v_texto, v_agora,
        (v_agora + interval '2 days'), 8, 'na fila',
        'fila_falta:' || r.consulta_id
      )
      on conflict (chave_unica) do nothing;
    end loop;
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Trigger: Atualização automática da fila quando uma consulta muda
-- ---------------------------------------------------------------------
create or replace function trg_consultas_atualizar_fila() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Se desmarcou ou faltou ou confirmou, cancela lembrete pendente
  if (new.status in ('desmarcou', 'atendido', 'confirmado') or new.confirmado_via_whatsapp) then
    update fila_lembretes
    set status = 'cancelado',
        motivo = case when new.status = 'desmarcou' then 'Consulta desmarcada'
                      when new.confirmado_via_whatsapp or new.status = 'confirmado' then 'Consulta já confirmada'
                      else 'Consulta finalizada' end
    where consulta_id = new.id and status = 'na fila' and tipo = 'lembrete_consulta';
  end if;

  -- Se remarcou (mudou data ou hora), cancela o anterior para recriar com a nova data
  if (old.data is distinct from new.data or old.hora_inicio is distinct from new.hora_inicio) then
    update fila_lembretes
    set status = 'cancelado',
        motivo = 'Consulta remarcada'
    where consulta_id = new.id and status = 'na fila' and tipo = 'lembrete_consulta';
  end if;

  -- Re-sincroniza
  perform public.sincronizar_fila_lembretes();
  return new;
end;
$$;

drop trigger if exists consultas_fila_aiu on consultas;
create trigger consultas_fila_aiu after insert or update on consultas
  for each row execute function trg_consultas_atualizar_fila();
