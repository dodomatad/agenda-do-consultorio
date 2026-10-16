-- =====================================================================
-- IMPORTAÇÃO LOTE 2: +49 PACIENTES REAIS E HISTÓRICO DE ÚLTIMA CONSULTA
-- =====================================================================
do $$
declare
  v_tag_sem_hist uuid;
  v_proc_prof uuid;
  v_pac_id uuid;
  v_item jsonb;
  v_nome text;
  v_tel text;
  v_nasc date;
  v_ult date;
  v_sem_hist boolean;
  v_obs text;
  v_dados jsonb := '[["Micheles Maria de Souza Leite","81996498193","1969-10-31","2026-09-08",0,0,0,""],["Paulo Andre Santana de Araújo","81987453057","1996-08-26","2026-09-01",0,0,0,""],["Yago Alexandre Luna Oliveira de Melo","81985699383","2009-07-14","2026-09-01",0,0,0,""],["Elaina dos Santos Silva","81988173240","1983-08-26","2026-05-19",0,0,0,""],["Edmar Ailton da Silva Junior","81988094363","2009-01-20","2025-11-04",0,0,0,""],["Ellen Eduarda dos Santos","81987760993","2001-06-22","2023-09-30",0,0,0,""],["Eduardo Vitor Dos Santos Souza","8198770993","1998-05-22","2023-09-30",0,0,0,""],["Esdras Gomes Cadete","81987995216","1997-08-25",null,1,0,0,"Sem registro de última consulta (sem historico)"],["Eric Cauã Borba C. da Costa","81986699445","2003-06-05","2025-07-01",0,0,0,"Tel secundário: 83069118"],["Ewerton Diego Gomes da Silva","81986251893","2012-12-06",null,1,0,0,"Última consulta: NÃO TEVE (sem historico)"],["Fabio Jose Patricio","8198875418","1983-10-11","2024-11-18",0,0,0,"Data original na ficha: 18/111/2024"],["Guilherme dos Santos Silva","81988173240","2011-02-08","2026-07-28",0,0,0,""],["Gilka Maria da S. Coelho","81988975667","1975-05-31","2025-10-29",0,0,0,""],["Gabriella Camily Cipriano Santos","81986765736","2002-10-08","2023-12-16",0,0,0,""],["Guilherme Leonardo da S. de Oliveira","81983315473","2010-08-02","2024-09-04",0,0,0,""],["Giovanna Beatriz Paes Barreto da Silva","81985939985","2007-10-08","2025-07-28",0,0,0,""],["Geisiane Maria de Araújo e Silva","81987179200","2022-07-22","2026-03-10",0,0,0,""],["Italo Herinque da Silva Machado","81995094130","2002-12-18","2026-03-17",0,0,0,""],["Igor Gabriel Silva de Lima","81985140126","2006-11-17","2025-07-01",0,0,0,""],["José Luciano Pedro dos Santos","81984812162","1986-07-25","2025-06-20",0,0,0,"Data original na ficha: 20/16/2025"],["Joao Vitor Moura","81988290780","2001-09-15","2023-12-04",0,0,0,""],["Jose Luciano dos Santos Silva","81985341843","1994-09-01","2023-12-16",0,0,0,""],["Josefa Patricia Da Conceição","","1984-01-19","2020-09-28",0,0,0,"Sem telefone na ficha"],["Laila Jasmine G. C. da Silva","81988912821","2008-04-30","2025-10-23",0,0,0,""],["Lenilson Antônio da Silva Junior","81991234370","2007-10-12",null,1,0,0,"Última consulta: NÃO TEVE (sem historico)"],["Luciano Jose Cicero da Silva","81983380555","2002-07-04","2023-01-16",0,0,0,""],["Leticia Vitoria M. G. dos Santos","81198875667","2011-04-05","2026-07-28",0,0,0,""],["Lindraci Maria da Conceição da Silva","81994545395","1989-09-22","2026-08-18",0,0,0,""],["Whallyson Oliveira Silva","81985970272","1992-09-12","2021-08-30",0,0,0,""],["Adriana Silva da F. B. da Silva","81985630244","1976-05-16","2024-07-02",0,0,0,""],["Alexsandra Araújo Dos Santos","81988875418","1978-12-13","2023-01-16",0,0,0,""],["Ana Paula das Neves Da Paz","81985347715","1984-05-03",null,1,0,0,"Última consulta: não tem (sem historico)"],["Ana Rita de K. P. P.da Silva","81985650782","1998-09-29","2023-04-18",0,0,0,""],["Alef Cauã da Silva Tomo Md","8198556901","2010-05-21","2025-01-23",0,0,0,""],["Demétrius De Moura Silva Oliveira","81987356537","2004-03-03","2024-04-29",0,0,0,""],["Dafilly Arielly da Silva Santos","81985360829","2006-12-17","2024-04-22",0,0,0,""],["Laila Jenifer Rodrigues Farias","81995706637","2001-05-24","2024-04-12",0,0,0,""],["Jaciara Bezerra Ferreira","8197683986","1991-02-04",null,1,0,0,"Última consulta: NÃO TEM (sem historico)"],["Julia Stefanny Berros","81984891839","2006-03-29","2023-09-04",0,0,0,""],["Jesus Emanuell Soares Das Chagas","81997228812","2009-07-21","2023-12-04",0,0,0,""],["Emerson Paulino Silva da Costa","81988099444","2004-12-10","2026-10-13",0,0,0,""],["Daniel Williamis Pyrroho de Lima","81934551509","2003-10-13","2026-10-13",0,0,0,""],["Nicollas Henrique S. Jose da Silva","81988889251","2013-06-05","2026-07-28",0,0,0,""],["Adrielly Monique dos Santos Silva","81986987910","2005-06-28","2026-10-11",0,0,0,""],["Raphael Jonatan da Silva Souza","81998689536","1998-12-16",null,1,0,0,"Última consulta: NÃO TEM (sem historico)"],["Thiago Wilians G. da Silva","81987616174","2003-08-06","2024-03-12",0,0,0,""],["Thielly Eloize Valenca","81991610018","2005-05-08","2021-09-20",0,0,0,""],["Talita Marirtins Barreto","81988428973","2003-03-03","2024-01-16",0,0,0,""],["Renata Gonçalves de Santana","81992300294","2020-10-29","2025-01-19",0,0,0,""]]'::jsonb;
begin
  insert into etiquetas (nome, cor, icone, tipo) values ('Sem Histórico', '#C43D3D', '⚠️', 'paciente')
    on conflict (nome, tipo) do update set cor = excluded.cor returning id into v_tag_sem_hist;

  select id into v_proc_prof from procedimentos where lower(nome) like '%limpeza%' or lower(nome) like '%profilaxia%' or lower(nome) like '%consulta%' limit 1;

  for v_item in select * from jsonb_array_elements(v_dados)
  loop
    v_nome := v_item->>0;
    v_tel := coalesce(v_item->>1, '');
    v_nasc := (v_item->>2)::date;
    v_ult := (v_item->>3)::date;
    v_sem_hist := (v_item->>4)::int = 1;
    v_obs := nullif(v_item->>7, '');

    select id into v_pac_id from pacientes where lower(nome) = lower(v_nome) limit 1;
    if v_pac_id is null then
      insert into pacientes (nome, telefone_whatsapp, data_nascimento, usa_aparelho, intervalo_manutencao_dias, aceita_whatsapp, observacoes)
      values (v_nome, v_tel, v_nasc, false, 30, (v_tel <> ''), v_obs)
      returning id into v_pac_id;
    else
      update pacientes set
        telefone_whatsapp = case when v_tel <> '' then v_tel else telefone_whatsapp end,
        data_nascimento = coalesce(data_nascimento, v_nasc),
        observacoes = coalesce(observacoes, v_obs)
      where id = v_pac_id;
    end if;

    if v_sem_hist then
      insert into paciente_etiquetas (paciente_id, etiqueta_id) values (v_pac_id, v_tag_sem_hist) on conflict do nothing;
    end if;

    if v_ult is not null then
      if not exists (select 1 from consultas where paciente_id = v_pac_id and data = v_ult) then
        insert into consultas (paciente_id, data, hora_inicio, duracao_minutos, procedimento_id, status, observacoes)
        values (v_pac_id, v_ult, '09:00', 30, v_proc_prof, 'atendido', v_obs);
      end if;
    end if;
  end loop;
end $$;
