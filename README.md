# Agenda do Consultório 🦷

Aplicativo web responsivo desenvolvido especialmente para a recepção de consultórios odontológicos, focado em agilidade, clareza e atendimento humanizado.

---

## 🚀 Tecnologias Utilizadas
- **Frontend**: React 18, TypeScript, Vite.
- **Estilização**: CSS Puro Moderno com Design System personalizado, variáveis nativas e modo claro/escuro.
- **Banco de Dados & Autenticação**: Supabase (PostgreSQL com Row Level Security ativa).
- **Backend / Serverless**: Supabase Edge Functions (Deno/TypeScript) e Tarefas Agendadas (`pg_cron` e `pg_net`).
- **Comunicação**: WhatsApp via Z-API (QR Code) com camada desacoplada pronta para Meta Cloud API (API Oficial).

---

## 📁 Estrutura do Projeto

```
eager-heisenberg/
├── src/
│   ├── components/
│   │   ├── ConsultaCard.tsx      # Cartão de detalhes da consulta com ações e histórico
│   │   ├── ConsultaForm.tsx      # Agendamento, repetição mensal e avisos inteligentes
│   │   ├── EnviarWhatsApp.tsx    # Envio manual de WhatsApp com modelos e fallback wa.me
│   │   ├── Paciente.tsx          # Ficha completa do paciente e formulário de cadastro
│   │   └── ui.tsx                # Design system: ícones, modais, pills, avatar, tagpicker
│   ├── lib/
│   │   ├── acoes.ts              # Regra do aparelho e mudança de status
│   │   ├── store.tsx             # Contexto global, dados em tempo real e notificações
│   │   ├── supabase.ts           # Cliente Supabase
│   │   ├── types.ts              # Tipagem completa de todo o domínio
│   │   └── utils.ts              # Máscaras de CPF/fone, datas pt-BR e preenchimento de modelos
│   ├── pages/
│   │   ├── Agenda.tsx            # Agenda visual (Dia, Semana, Mês, Drag & Drop)
│   │   ├── Configuracoes.tsx     # Horários, alertas, profissionais, procedimentos e equipe
│   │   ├── Etiquetas.tsx         # Gestão de etiquetas coloridas para pacientes e consultas
│   │   ├── FilaLembretes.tsx     # Módulo da Fila de Lembretes (cadência humana, 1 a 1)
│   │   ├── Login.tsx             # Autenticação e cadastro inicial de administrador
│   │   ├── Notificacoes.tsx      # Central de notificações com ações diretas
│   │   ├── Pacientes.tsx         # Lista em cartões/tabela, busca instantânea e filtros
│   │   └── WhatsApp.tsx          # Conexão por QR Code, modelos automáticos e histórico
│   ├── App.tsx                   # Layout principal responsivo (Desktop Sidebar / Mobile Bar)
│   ├── index.css                 # Identidade visual moderna, acolhedora e responsiva
│   └── main.tsx
├── supabase/
│   ├── config.toml               # Configuração das Edge Functions
│   ├── migrations/
│   │   ├── 20261011000001_schema.sql  # Tabelas, RLS, triggers de auditoria e dados iniciais
│   │   ├── 20261011000002_cron.sql    # Agendamentos pg_cron (7h e horários comerciais)
│   │   └── 20261011000003_fila_lembretes.sql # Tabela e triggers da fila gradual
│   └── functions/
│       ├── _shared/whatsapp.ts        # Camada de serviço única desacoplada (Z-API / Meta)
│       ├── cron-automacoes/           # Envios automáticos periódicos
│       ├── cron-fila-lembretes/       # Disparo humanizado da fila a cada 5 min (1 a 1)
│       ├── enviar-mensagem/           # Envio manual autenticado
│       ├── gerenciar-usuarios/        # Gestão de perfis (Admin)
│       ├── whatsapp-conexao/          # Status e QR Code da instância
│       └── whatsapp-webhook/          # Respostas dos pacientes (1=SIM, 2=NÃO) e status

├── .env.example
├── package.json
└── README.md
```

---

## 🛠️ Como Configurar

### 1. Banco de Dados (Supabase)
1. No seu projeto do Supabase, acesse o **SQL Editor**.
2. Execute o conteúdo de [`supabase/migrations/20261011000001_schema.sql`](file:///c:/Users/dedeu/Documents/antigravity/eager-heisenberg/supabase/migrations/20261011000001_schema.sql).
3. Salve suas chaves do projeto no Vault para o cron e execute [`supabase/migrations/20261011000002_cron.sql`](file:///c:/Users/dedeu/Documents/antigravity/eager-heisenberg/supabase/migrations/20261011000002_cron.sql):
   ```sql
   select vault.create_secret('https://SEU-PROJETO.supabase.co', 'project_url');
   select vault.create_secret('SUA_SERVICE_ROLE_KEY', 'service_role_key');
   ```

### 2. Edge Functions e Secrets do WhatsApp
As credenciais do WhatsApp ficam guardadas com segurança no Supabase e **nunca** no front-end:
```bash
supabase secrets set ZAPI_INSTANCE_ID="sua_instancia"
supabase secrets set ZAPI_TOKEN="seu_token"
supabase secrets set ZAPI_CLIENT_TOKEN="seu_client_token"
supabase secrets set WEBHOOK_SECRET="seu_token_secreto"
```
Para implantar as funções:
```bash
supabase functions deploy --no-verify-jwt whatsapp-webhook
supabase functions deploy cron-automacoes
supabase functions deploy enviar-mensagem
supabase functions deploy whatsapp-conexao
supabase functions deploy gerenciar-usuarios
```

### 3. Frontend
Copie o arquivo `.env.example` para `.env`:
```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-aqui
```
Inicie a aplicação:
```bash
npm run dev
```

---

## ✨ Destaques de Implementação

1. **Agenda Visual Humanizada**:
   - Visões de Dia, Semana e Mês.
   - Indicação de horário de almoço com listras sutis e linha vermelha com o horário atual em tempo real.
   - Remarcação facilitada arrastando e soltando blocos, com confirmação e opção de notificar o paciente pelo WhatsApp.
2. **Regra Automática do Aparelho**:
   - Ao marcar como atendida uma consulta de aparelho, o sistema sugere automaticamente a próxima manutenção no intervalo configurado (padrão 30 dias), avançando feriados e domingos para o próximo dia útil.
   - Opção de repetir mensalmente consultas por 2, 5 ou 11 meses.
3. **Respostas Inteligentes no WhatsApp**:
   - Webhook interpreta "1", "SIM", "CONFIRMO" e marca a consulta como confirmada automaticamente.
   - Respostas como "2", "NÃO" geram imediatamente uma notificação de alta prioridade na recepção com ação rápida de remarcação.
4. **LGPD e Segurança**:
   - Row Level Security (RLS) habilitada em todas as tabelas.
   - CPF com máscara visual para preservar a privacidade na recepção.
   - Trilhas de auditoria registrando quem criou e editou cada consulta.
