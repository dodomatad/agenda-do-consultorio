-- =====================================================================
-- Mover Filtros de Pacientes para o Servidor (PostgreSQL View)
-- Permite busca textual, aniversariantes, status de consultas e tags
-- serem processados diretamente no banco com paginação e contagem exatas.
-- =====================================================================

create or replace view vw_pacientes_resumo as
select
  p.id,
  p.nome,
  p.telefone_whatsapp,
  p.data_nascimento,
  p.cpf,
  p.email,
  p.usa_aparelho,
  p.intervalo_manutencao_dias,
  p.aceita_whatsapp,
  p.observacoes,
  p.foto_url,
  p.ativo,
  p.criado_em,
  extract(month from p.data_nascimento)::int as mes_aniversario,
  coalesce(
    (
      select array_agg(pe.etiqueta_id)
      from paciente_etiquetas pe
      where pe.paciente_id = p.id
    ),
    '{}'::uuid[]
  ) as etiquetas_ids,
  (
    select max(c.data)
    from consultas c
    where c.paciente_id = p.id and c.status = 'atendido' and c.data <= current_date
  ) as ultima_consulta,
  (
    select jsonb_build_object('data', c.data, 'hora_inicio', c.hora_inicio)
    from consultas c
    where c.paciente_id = p.id and c.status in ('agendado', 'confirmado') and c.data >= current_date
    order by c.data asc, c.hora_inicio asc
    limit 1
  ) as proxima_consulta,
  exists (
    select 1
    from consultas c
    where c.paciente_id = p.id and c.status in ('agendado', 'confirmado') and c.data >= current_date
  ) as tem_consulta_futura,
  (
    exists (
      select 1
      from consultas c
      where c.paciente_id = p.id and c.status = 'faltou'
    )
    or exists (
      select 1
      from consultas c
      where c.paciente_id = p.id and c.status in ('agendado', 'confirmado') and c.data < current_date
    )
    or (
      p.usa_aparelho and not exists (
        select 1
        from consultas c
        where c.paciente_id = p.id and c.status in ('agendado', 'confirmado') and c.data >= current_date
      )
    )
  ) as atrasado
from pacientes p
where p.ativo = true;

-- Concede permissão de leitura para usuários autenticados da clínica
grant select on vw_pacientes_resumo to authenticated;
