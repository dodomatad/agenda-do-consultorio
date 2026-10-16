-- =====================================================================
-- Índices de Desempenho e Busca Eficiente
-- =====================================================================

-- Extensão pg_trgm para buscas textuais parciais ultra-rápidas em nomes
create extension if not exists pg_trgm;

-- Índice trigram para busca rápida por aproximação ou trecho do nome do paciente
create index if not exists pacientes_nome_trgm_idx on pacientes using gin (nome gin_trgm_ops);

-- Índices B-Tree para buscas exatas e parciais por telefone e CPF
create index if not exists pacientes_telefone_idx on pacientes (telefone_whatsapp);
create index if not exists pacientes_cpf_idx on pacientes (cpf);
create index if not exists pacientes_ativo_nome_idx on pacientes (ativo, nome);

-- Índices compostos na tabela de consultas para agilizar a agenda e relatórios
create index if not exists consultas_data_hora_idx on consultas (data, hora_inicio);
create index if not exists consultas_paciente_status_data_idx on consultas (paciente_id, status, data);

-- Índices para histórico de mensagens e fila de lembretes
create index if not exists mensagens_criado_desc_idx on mensagens_whatsapp (criado_em desc);
create index if not exists fila_criado_desc_idx on fila_lembretes (criado_em desc);
