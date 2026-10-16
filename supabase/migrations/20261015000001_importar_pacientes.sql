-- =====================================================================
-- SCRIPT COMPLETO: Financeiro + Índices + View + 65 Pacientes Reais
-- =====================================================================

-- 1. MÓDULO FINANCEIRO (procedimentos.preco + transacoes_financeiras)
alter table procedimentos add column if not exists preco numeric(10,2);

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

create index if not exists transacoes_data_competencia_idx on transacoes_financeiras (data_competencia desc);
create index if not exists transacoes_status_idx on transacoes_financeiras (status);
create index if not exists transacoes_consulta_idx on transacoes_financeiras (consulta_id);
create index if not exists transacoes_paciente_idx on transacoes_financeiras (paciente_id);
create index if not exists transacoes_tipo_idx on transacoes_financeiras (tipo);

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

alter table transacoes_financeiras enable row level security;
drop policy if exists transacoes_select on transacoes_financeiras;
drop policy if exists transacoes_insert on transacoes_financeiras;
drop policy if exists transacoes_update on transacoes_financeiras;
drop policy if exists transacoes_delete on transacoes_financeiras;

create policy transacoes_select on transacoes_financeiras for select to authenticated using (is_staff());
create policy transacoes_insert on transacoes_financeiras for insert to authenticated with check (is_staff());
create policy transacoes_update on transacoes_financeiras for update to authenticated using (is_staff()) with check (is_staff());
create policy transacoes_delete on transacoes_financeiras for delete to authenticated using (is_admin());

-- 2. ÍNDICES DE DESEMPENHO (pg_trgm + buscas rápidas)
create extension if not exists pg_trgm;
create index if not exists pacientes_nome_trgm_idx on pacientes using gin (nome gin_trgm_ops);
create index if not exists pacientes_telefone_idx on pacientes (telefone_whatsapp);
create index if not exists pacientes_cpf_idx on pacientes (cpf);
create index if not exists pacientes_ativo_nome_idx on pacientes (ativo, nome);
create index if not exists consultas_data_hora_idx on consultas (data, hora_inicio);
create index if not exists consultas_paciente_status_data_idx on consultas (paciente_id, status, data);
create index if not exists mensagens_criado_desc_idx on mensagens_whatsapp (criado_em desc);
create index if not exists fila_criado_desc_idx on fila_lembretes (criado_em desc);

-- 3. VIEW DE FILTROS DE PACIENTES NO SERVIDOR (vw_pacientes_resumo)
create or replace view vw_pacientes_resumo as
select
  p.id, p.nome, p.telefone_whatsapp, p.data_nascimento, p.cpf, p.email,
  p.usa_aparelho, p.intervalo_manutencao_dias, p.aceita_whatsapp, p.observacoes,
  p.foto_url, p.ativo, p.criado_em,
  extract(month from p.data_nascimento)::int as mes_aniversario,
  coalesce((select array_agg(pe.etiqueta_id) from paciente_etiquetas pe where pe.paciente_id = p.id), '{}'::uuid[]) as etiquetas_ids,
  (select max(c.data) from consultas c where c.paciente_id = p.id and c.status = 'atendido' and c.data <= current_date) as ultima_consulta,
  (select jsonb_build_object('data', c.data, 'hora_inicio', c.hora_inicio) from consultas c where c.paciente_id = p.id and c.status in ('agendado', 'confirmado') and c.data >= current_date order by c.data asc, c.hora_inicio asc limit 1) as proxima_consulta,
  exists (select 1 from consultas c where c.paciente_id = p.id and c.status in ('agendado', 'confirmado') and c.data >= current_date) as tem_consulta_futura,
  (
    exists (select 1 from consultas c where c.paciente_id = p.id and c.status = 'faltou')
    or exists (select 1 from consultas c where c.paciente_id = p.id and c.status in ('agendado', 'confirmado') and c.data < current_date)
    or (p.usa_aparelho and not exists (select 1 from consultas c where c.paciente_id = p.id and c.status in ('agendado', 'confirmado') and c.data >= current_date))
  ) as atrasado
from pacientes p
where p.ativo = true;

grant select on vw_pacientes_resumo to authenticated;

-- 4. ETIQUETAS CLÍNICAS E IMPORTAÇÃO DOS 65 PACIENTES
do $$
declare
  v_tag_orto uuid;
  v_tag_prof uuid;
  v_tag_remocao uuid;
  v_tag_duvida_rem uuid;
  v_tag_pasta uuid;
  v_tag_sem_hist uuid;
  v_proc_orto uuid;
  v_proc_prof uuid;
  v_pac_id uuid;
  v_item jsonb;
  v_nome text;
  v_tel text;
  v_nasc date;
  v_ult date;
  v_nao_veio boolean;
  v_faltou boolean;
  v_aparelho boolean;
  v_obs text;
  v_obs_lower text;
  v_dados jsonb := '[["Lais Milena Barbosa","81983103495","2004-10-05","2026-09-22",0,0,1,"ortodontia"],["Alessandra Borba de Araújo","81986699445","1987-03-12","2026-09-22",0,0,1,"ortodontia"],["Whallyson Oliveira da Silva","81996959758","1992-09-12","2026-09-22",0,0,1,"ortodontia"],["Aline Maria Alves da Silva","81996701439","2003-05-26","2026-09-08",0,0,1,"ortodontia"],["Anderson Alves da Silva","81996701439","1999-06-25","2026-09-08",0,0,1,"ortodontia"],["Apolo Henrique Pereira Ferreira da","819962994836","2002-12-21","2026-09-22",0,0,0,"consultar pasta"],["Alayn Galdino da Silva","81986988737","1998-05-08","2026-09-22",0,0,0,"remoção do aparelho falta rever profilaxia"],["Ana Carolayne R. de Oliveira","81999073267","2001-03-07","2025-07-01",0,0,1,"ortodontia"],["Allison de Barros da Silva","81987732549","1986-11-25","2025-09-02",0,0,0,"consultar pasta"],["Agatha Gabriella Ribeiro Bezerra","81988224527","2008-04-21","2025-08-12",0,0,0,"remoção do aparelho falta rever profilaxia"],["Douglas Andre da S. Maciel","81984179044","2005-02-08","2025-08-12",0,0,0,"remoção do aparelho falta rever profilaxia"],["Catarina Cibelle da Silva de Oliveira","81983315473","1985-06-12","2025-08-12",0,0,0,"cirurgia rever profilaxia"],["Anne Beatriz da Silva Costa","81988158689","2008-10-24","2024-03-18",0,0,0,"remoção do aparelho falta rever profilaxia"],["Adriana Demétrio Cunha","81987893781","1978-11-29","2024-05-20",0,0,0,"remoção do aparelho, falta rever profilaxia"],["Anna Yasmim de F. Silva","81987631577","2004-02-16","2025-02-04",0,0,0,"consultar pasta, falta rever profilaxia"],["Bruna dos Santos Lucas","81995956142","1995-02-15","2025-07-29",0,0,0,"consultar pasta, falta rever profilaxia"],["Davi Andrade Batista de Souza","81991198246","2012-02-02","2026-04-18",0,0,1,"ortodontia, falta rever profilaxia"],["Davi Lucas Ferreira dos Santos","81988135183","2008-06-10","2025-04-18",0,0,1,"ortodontia, falta rever profilaxia"],["Danilo Williams Pyrrho de Lima","81984639938","2003-10-13","2025-04-18",0,0,1,"ortodontia, falta rever profilaxia"],["Celson Oliveira de Freitas","81983172225","1981-07-11","2026-04-17",0,0,1,"ortodontia"],["Beatrix Brayner de Souza","81983676176","2001-04-18","2025-09-30",0,0,1,"ortodontia, falta rever profilaxia"],["Bianca Manuella S. das Chagas Silva","81997228812","2004-09-18","2025-09-30",0,0,0,"ortodontia, falta rever profilaxia já fez a remoção"],["Williane Eloar Aroujo de Lima","81987179200","2002-08-15","2026-07-28",0,0,0,"ortodontia, falta rever profilaxia já fez a remoção"],["Valdeclere Maria da Silva","81983637117","1981-02-20","2023-06-24",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Wilma Valeria da Silva","81999763892","1995-01-16","2025-05-08",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Walesca Cristina Barros de Oliveira","81985834481","2005-07-31","2024-05-14",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Mayara Tavares da Silva","819872224985","2000-12-10","2023-04-28",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Micael de Souza Brito","81984123491","2009-03-03","2024-03-19",0,0,0,"ortodontia,rever profilaxia já fez a remoção"],["Marlos Luan da Silva Soares","81986916653","1998-08-15","2025-11-18",0,0,0,"ortodontia, rever profilaxia já fez a remoção"],["Nicolle Cauane Silva da Silva","81985569901","2014-11-06","2026-07-28",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Paulo Vinycios B. Pereira da Silva","81999433452","2006-08-17","2025-02-17",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Pedro Henrique Borba de Araujo","81993301649","2005-09-23","2026-07-28",0,0,1,"ortodontia, falta rever profilaxia"],["Priscila Valeria Santana da Silva","81999938692","2003-04-09","2026-07-14",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Paulo Victor da Silva","81996853030","1994-12-01","2026-07-28",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Raissa Ketily de S. Silva","81995485979","2009-03-14","2024-01-29",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Rute Albuquerque de Souza","81996692156","1995-07-01","2025-11-04",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Renata Patricia da Silva","81988158689","1989-07-25",null,1,1,0,"ortodontia, falta rever profilaxia já fez a remoção | Última consulta: não veio"],["Ryvson Ivan Napoleão de Lima","81984640401","2008-03-19","2026-09-16",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Stephane Maria da Silva","81987179200","2002-08-15","2026-07-28",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Saulo Henrique Paes Barreto da Silva","81985939985","2004-10-08","2025-07-28",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Stephane Wngrid da S. Gomes","81983251893","2009-01-08","2025-08-27",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Sergio André dos Santos Silva Filho","81994711700","1999-11-29","2026-07-28",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Samyra Amancio Luna de Lima","81985699383","2003-01-01","2026-06-02",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Stephany Vitoria da Silva Vital","81998145142","2007-03-01","2025-07-29",0,0,0,"ortodontia, feita a remoção fazer a profilaxia"],["Thaylla Silva de Melo","81981508008","2016-08-04","2026-08-25",0,1,1,"ortodontia, faltau esse mes"],["Thalia Poema de A. Aguiar","81983208204","1997-08-02","2022-12-21",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção?"],["Thiago Pinto Ferreira","81986227827","1993-04-09","2026-07-28",0,0,0,"ortodontia, falta rever profilaxia já fez a remoção | Data original na ficha: 09/040/1993"],["Vanessa Dantas Vera Crus","81983217957","1990-11-07","2025-09-16",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ? | Data original na ficha: 16/19/2025"],["Thaiz Cristina de Oliveira","81988639534","1986-04-03","2025-01-20",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ?"],["Thiago Ferreira da Silva","81987456467","1990-09-05","2026-07-07",0,0,1,"ortodontia, falta vim ?"],["Luiz Cassiono Gomes Junior","81986362588","1981-01-11","2026-07-28",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ? paciente sem historico"],["Klebson Aureliano de A e Silva","81988783985","1983-09-24","2026-07-28",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção ? paciente sem historico"],["Janaina Maria da Silva","81985248903","1979-11-02","2023-09-12",0,0,0,"ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)"],["Larissa Vitoria de S.Souza","819988201234","2004-09-28","2025-02-22",0,0,0,"ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)"],["Lucas Lima da Silva","819996074690","2004-08-08","2024-07-08",0,0,0,"ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)"],["Leilane Bezerra Santos","8197345238","1996-09-03","2024-02-26",0,0,0,"ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)"],["Maria Vitoria Silva","81998753871","2006-02-07","2024-08-05",0,0,0,"ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)"],["Maria Jose da Silva Mendes","81987672810","1972-12-11",null,1,1,0,"sem historico | Última consulta: não veio"],["Maria Andrea Correia de Lima","81985649090","1986-09-19","2024-08-13",0,0,0,"ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)"],["Maria Lais Braz dos Santos","81996955746","2001-11-04",null,1,1,0,"sem historico | Última consulta: não veio"],["Marcelly Moura do Nascimento","81983411817","2008-05-23","2025-04-22",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção do aparelho ?"],["Ricassia Maria de Oliveira Farias","81985313709","1989-08-09","2024-10-15",0,0,0,"mandar novamente mensagem para profilaxia"],["Ruth Gomes Pereira da Silva","81984395746","2007-11-24","2025-01-21",0,0,1,"ortodontia, falta rever profilaxia já fez a remoção do aparelho ?"],["Rubens Renan Correia Monteiro","81984375927","2002-01-22","2024-12-17",0,0,0,"ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)"],["Raphael Jonatan da","81985649090","1986-09-19","2024-08-13",0,0,0,"ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)"]]'::jsonb;
begin
  insert into etiquetas (nome, cor, icone, tipo) values ('Ortodontia', '#5B3FC4', '🦷', 'paciente')
    on conflict (nome, tipo) do update set cor = excluded.cor returning id into v_tag_orto;
  insert into etiquetas (nome, cor, icone, tipo) values ('Rever Profilaxia', '#2B8FD6', '✨', 'paciente')
    on conflict (nome, tipo) do update set cor = excluded.cor returning id into v_tag_prof;
  insert into etiquetas (nome, cor, icone, tipo) values ('Aparelho Removido', '#3BA776', '✅', 'paciente')
    on conflict (nome, tipo) do update set cor = excluded.cor returning id into v_tag_remocao;
  insert into etiquetas (nome, cor, icone, tipo) values ('Confirmar Remoção?', '#D4A017', '❓', 'paciente')
    on conflict (nome, tipo) do update set cor = excluded.cor returning id into v_tag_duvida_rem;
  insert into etiquetas (nome, cor, icone, tipo) values ('Consultar Pasta', '#E08A1E', '📁', 'paciente')
    on conflict (nome, tipo) do update set cor = excluded.cor returning id into v_tag_pasta;
  insert into etiquetas (nome, cor, icone, tipo) values ('Sem Histórico', '#C43D3D', '⚠️', 'paciente')
    on conflict (nome, tipo) do update set cor = excluded.cor returning id into v_tag_sem_hist;

  select id into v_proc_orto from procedimentos where eh_manutencao_aparelho = true limit 1;
  select id into v_proc_prof from procedimentos where lower(nome) like '%limpeza%' or lower(nome) like '%profilaxia%' limit 1;

  for v_item in select * from jsonb_array_elements(v_dados)
  loop
    v_nome := v_item->>0;
    v_tel := v_item->>1;
    v_nasc := (v_item->>2)::date;
    v_ult := (v_item->>3)::date;
    v_nao_veio := (v_item->>4)::int = 1;
    v_faltou := (v_item->>5)::int = 1;
    v_aparelho := (v_item->>6)::int = 1;
    v_obs := v_item->>7;
    v_obs_lower := lower(v_obs);

    select id into v_pac_id from pacientes where lower(nome) = lower(v_nome) limit 1;
    if v_pac_id is null then
      insert into pacientes (nome, telefone_whatsapp, data_nascimento, usa_aparelho, intervalo_manutencao_dias, aceita_whatsapp, observacoes)
      values (v_nome, v_tel, v_nasc, v_aparelho, 30, true, v_obs)
      returning id into v_pac_id;
    else
      update pacientes set
        telefone_whatsapp = coalesce(telefone_whatsapp, v_tel),
        data_nascimento = coalesce(data_nascimento, v_nasc),
        usa_aparelho = v_aparelho,
        observacoes = coalesce(observacoes, v_obs)
      where id = v_pac_id;
    end if;

    if v_obs_lower like '%ortodontia%' then
      insert into paciente_etiquetas (paciente_id, etiqueta_id) values (v_pac_id, v_tag_orto) on conflict do nothing;
    end if;
    if v_obs_lower like '%profilaxia%' then
      insert into paciente_etiquetas (paciente_id, etiqueta_id) values (v_pac_id, v_tag_prof) on conflict do nothing;
    end if;
    if v_obs_lower like '%(sim)%' or v_obs_lower like '%feita a remoção%' or (v_obs_lower like '%remoção%' and v_obs_lower not like '%?%') then
      insert into paciente_etiquetas (paciente_id, etiqueta_id) values (v_pac_id, v_tag_remocao) on conflict do nothing;
    end if;
    if v_obs_lower like '%remoção%' and v_obs_lower like '%?%' then
      insert into paciente_etiquetas (paciente_id, etiqueta_id) values (v_pac_id, v_tag_duvida_rem) on conflict do nothing;
    end if;
    if v_obs_lower like '%consultar pasta%' then
      insert into paciente_etiquetas (paciente_id, etiqueta_id) values (v_pac_id, v_tag_pasta) on conflict do nothing;
    end if;
    if v_obs_lower like '%sem historico%' then
      insert into paciente_etiquetas (paciente_id, etiqueta_id) values (v_pac_id, v_tag_sem_hist) on conflict do nothing;
    end if;

    if v_ult is not null then
      if not exists (select 1 from consultas where paciente_id = v_pac_id and data = v_ult) then
        insert into consultas (paciente_id, data, hora_inicio, duracao_minutos, procedimento_id, status, observacoes)
        values (v_pac_id, v_ult, '09:00', 30, case when v_obs_lower like '%ortodontia%' then v_proc_orto else v_proc_prof end, case when v_faltou then 'faltou' else 'atendido' end, v_obs);
      end if;
    elsif v_nao_veio then
      if not exists (select 1 from consultas where paciente_id = v_pac_id and status = 'faltou') then
        insert into consultas (paciente_id, data, hora_inicio, duracao_minutos, procedimento_id, status, observacoes)
        values (v_pac_id, current_date - 15, '09:00', 30, case when v_obs_lower like '%ortodontia%' then v_proc_orto else v_proc_prof end, 'faltou', v_obs);
      end if;
    end if;
  end loop;
end $$;
