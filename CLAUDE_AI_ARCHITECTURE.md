# Arquitetura de Integração com Claude — Zticket

> Documento de arquitetura para transformar o Claude num assistente de gestão e análise de tickets. Fundamentado no código **real** deste projeto (não é um guia genérico) — referencia arquivos, tabelas e padrões que já existem no repositório.

## Estado atual (ponto de partida)

Já existe uma integração pontual em [`backend/claude.js`](backend/claude.js):
- Usa `@anthropic-ai/sdk`, modelo `claude-opus-4-8`, `output_config.format: json_schema` (structured outputs).
- Rota `POST /api/ai/analyze-ticket` ([`backend/index.js`](backend/index.js)): recebe `ticket_id`, monta o texto do ticket + notas, chama o Claude, devolve `{resumo, categoria, sentimento, prioridade_sugerida, resposta_sugerida, proximos_passos}`.
- **Gap crítico**: essa análise é **efêmera** — o resultado só volta pra tela, nunca é salvo no banco, nunca aparece de novo, não alimenta relatórios, não dispara alertas. É a peça que falta para os objetivos 6–15 abaixo.

Tudo neste documento **estende** esse arquivo/rota existente — não substitui.

---

## 1. Como conectar o Claude ao sistema

Já conectado da forma certa: **só o backend fala com o Claude** (SDK `@anthropic-ai/sdk`, chave em `backend/.env`). O frontend nunca vê a API key — chama rotas internas do próprio backend (`/api/ai/*`), que por sua vez chamam a Anthropic. Manter esse desenho para tudo que vier a seguir: nenhuma chamada direta do navegador para `api.anthropic.com`.

Duas adições de infraestrutura:
- **Job runner** para processamento em lote/agendado (histórico, relatórios, detecção de anomalia). Pode ser `node-cron` dentro do próprio `backend/index.js` (mais simples, roda no mesmo processo) ou um worker separado — para o volume atual (helpdesk interno), `node-cron` no mesmo processo é suficiente.
- **Nenhuma infraestrutura de fila é necessária** para o volume esperado — a Message Batches API (seção 3) já resolve o processamento assíncrono de centenas/milhares de tickets sem precisar de Redis/SQS.

## 2. Quais APIs devem ser utilizadas

| API | Uso | Endpoint |
|---|---|---|
| **Messages API** | Análise em tempo real de 1 ticket (já implementado) | `POST /v1/messages` |
| **Message Batches API** | Análise em lote do histórico, reprocessamento, relatórios executivos | `POST /v1/messages/batches` |
| **Token Counting API** | Estimar custo antes de rodar um lote grande | `POST /v1/messages/count_tokens` |
| **Models API** | Opcional — checar capacidades do modelo em runtime | `GET /v1/models/{id}` |

Não são necessários: Files API, Code Execution, MCP, Managed Agents — este é um caso de classificação/análise estruturada, não um agente autônomo.

## 3. Quais dados precisam ser enviados para análise

O `buildTicketText()` em `claude.js` já monta o essencial. Lista completa recomendada por ticket:

```
Campos do ticket:  subject, description, status, priority, channel, sistema,
                    company.name, company.tenant.name, contact.name, tags[]
Histórico:         notas_ticket (nota, autor, is_internal, criado_em) — ordem cronológica
Metadados:         ticket_number, created_at, due_date (para contexto de SLA)
```

⚠️ **Dado sensível (LGPD)**: `nome_contato`/`telefone_contato` (capturados via extensão do Crisp) e o conteúdo das notas podem conter dados pessoais do cliente. Ao enviar para a API da Anthropic:
- A Anthropic **não usa dados de API para treinar modelos** por padrão (política vigente) — mas confirme isso no DPA/contrato antes de produção com dados reais de clientes.
- Considere mascarar telefone/CPF antes de enviar, se o campo `description`/notas costuma conter esses dados brutos.
- Documente a base legal (legítimo interesse / execução de contrato) para o tratamento, já que são dados de terceiros (clientes da empresa que usa o Zticket).

**Não enviar**: chaves de API, senhas, tokens — nenhum desses aparece nos campos de ticket hoje, mas vale um filtro defensivo se o campo `description` for de texto livre alimentado por clientes.

## 4. Estrutura recomendada para banco de dados e histórico

Seguindo o padrão já estabelecido no projeto (tabelas pt-br no banco local, `backend/resources.js` faz o mapeamento inglês↔português, migrações duplicadas pt-br/inglês em `supabase/migrations/`):

### `analises_ia` (nova tabela) — resultado persistido de cada análise
```sql
CREATE TABLE analises_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  categoria text,                    -- "Bug", "Reclamação", "Sugestão", "Cancelamento", "Financeiro", "Operacional"
  subcategoria text,
  sentimento text,                   -- positivo | neutro | negativo | frustrado
  prioridade_sugerida text,
  impacto text,                      -- baixo | medio | alto | critico
  resumo text,
  resposta_sugerida text,
  proximos_passos jsonb,             -- array de strings
  aplicada boolean DEFAULT false,    -- atendente aplicou a sugestão?
  modelo text,                       -- ex: "claude-opus-4-8"
  tokens_entrada int,
  tokens_saida int,
  origem text DEFAULT 'tempo_real',  -- 'tempo_real' | 'lote' | 'reprocessamento'
  criado_em timestamptz DEFAULT now()
);
CREATE INDEX idx_analises_ia_ticket ON analises_ia (ticket_id);
CREATE INDEX idx_analises_ia_categoria ON analises_ia (categoria);
CREATE INDEX idx_analises_ia_criado ON analises_ia (criado_em);
```
Uma análise por linha (não substitui a anterior) — permite ver a evolução de sentimento/categoria ao longo do atendimento, e serve de base para os relatórios.

### `lotes_analise_ia` (nova tabela) — rastreia execuções da Message Batches API
```sql
CREATE TABLE lotes_analise_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id_anthropic text NOT NULL,  -- ID retornado pela Anthropic (msgbatch_...)
  status text DEFAULT 'processando', -- processando | concluido | erro
  total_tickets int,
  tickets_sucesso int DEFAULT 0,
  tickets_erro int DEFAULT 0,
  iniciado_em timestamptz DEFAULT now(),
  concluido_em timestamptz
);
```

### `alertas_ia` (nova tabela) — reaproveita o padrão de `notificacoes` já criado nesta sessão
```sql
CREATE TABLE alertas_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,                -- 'pico_categoria' | 'pico_bug' | 'sentimento_negativo'
  categoria text,
  descricao text NOT NULL,
  severidade text DEFAULT 'media',   -- baixa | media | alta
  metadados jsonb,                   -- { "contagem_atual": 12, "media_historica": 3, ... }
  resolvido boolean DEFAULT false,
  criado_em timestamptz DEFAULT now()
);
```

### `backend/resources.js` — novas entradas (reaproveitando as rotas genéricas)
```js
ai_analyses: {
  table: 'analises_ia',
  columns: {
    id: 'id', ticket_id: 'ticket_id', category: 'categoria', subcategory: 'subcategoria',
    sentiment: 'sentimento', suggested_priority: 'prioridade_sugerida', impact: 'impacto',
    summary: 'resumo', suggested_response: 'resposta_sugerida', next_steps: 'proximos_passos',
    applied: 'aplicada', model: 'modelo', input_tokens: 'tokens_entrada', output_tokens: 'tokens_saida',
    source: 'origem', created_at: 'criado_em',
  },
  jsonb: ['next_steps'],
  embeds: { ticket: { resource: 'tickets', localKey: 'ticket_id', foreignKey: 'id' } },
},
ai_alerts: {
  table: 'alertas_ia',
  columns: {
    id: 'id', type: 'tipo', category: 'categoria', description: 'descricao',
    severity: 'severidade', metadata: 'metadados', resolved: 'resolvido', created_at: 'criado_em',
  },
  jsonb: ['metadata'],
},
```
Com isso, `GET/POST/PATCH /api/ai_analyses` e `/api/ai_alerts` já funcionam sem nenhuma rota nova (mesmo padrão usado por `tags`/`notifications` já implementados).

## 5. Campos obrigatórios dos tickets e atendimentos

Para a IA analisar bem, os campos abaixo devem estar **sempre preenchidos** (hoje `subject` é o único `NOT NULL` real):

| Campo | Por quê é importante pra IA | Ação recomendada |
|---|---|---|
| `subject` | já obrigatório | manter |
| `description` | sem isso a análise vira só o assunto — pobre | tornar obrigatório na UI (`Registro.tsx`), não no banco (para não quebrar tickets antigos) |
| `status`, `priority`, `channel` | já têm default, ok | manter |
| **ao menos 1 nota antes de fechar** | sem interação registrada, "resumo"/"próximos passos" ficam vazios | validação no botão "Finalizar Ticket" (`TicketDetail.tsx`) — já existe modal de solução obrigatória, é o suficiente |
| `tags` | ajuda a categorização e o agrupamento por tema nos alertas (seção 13) | incentivar uso do `TagPicker` já implementado |
| `company_id` | permite relatórios por cliente/segmento | já existe, opcional hoje — considerar obrigatório |

## 6. Fluxo completo de comunicação entre sistema e IA

```
┌─────────────────┐      ┌──────────────────────┐      ┌─────────────────┐
│   TEMPO REAL     │      │   LOTE / HISTÓRICO   │      │   ALERTAS       │
└────────┬─────────┘      └──────────┬───────────┘      └────────┬────────┘
         │                           │                            │
         ▼                           ▼                            ▼
Atendente clica       Job agendado (node-cron,           Job agendado (a cada
"Analisar com IA"     ex: toda madrugada) varre           1h) agrupa analises_ia
no TicketDetail       tickets sem analises_ia             por categoria/período,
         │            recentes                            compara com baseline
         ▼                           │                            │
POST /api/ai/                        ▼                            ▼
analyze-ticket             Monta N requests →           Se pico anormal →
         │                 POST /v1/messages/batches     INSERT em alertas_ia
         ▼                           │                    + notificacoes (sino)
Claude Messages API                  ▼
(1 chamada)                Poll a cada 60s
         │                 GET /v1/messages/
         ▼                 batches/{id}
Salva em analises_ia                 │
         │                           ▼
         ▼                 Quando "ended": stream
Mostra na UI                results, salva cada
(TicketDetail.tsx)          um em analises_ia
                            com origem='lote'
```

## 7. Métodos de autenticação e segurança

- **Backend → Anthropic**: header `x-api-key`, valor de `process.env.ANTHROPIC_API_KEY` (já implementado em `claude.js`). Nunca em código, nunca no frontend.
- **Frontend → Backend**: o Zticket não tem autenticação hoje (single-tenant, uso compartilhado — mesmo padrão dos outros módulos). Se a análise de IA for exposta a mais gente, considere ao menos validar que o `ticket_id` existe antes de gastar uma chamada de API.
- **Rate limiting da rota `/api/ai/*`**: adicionar um limite simples (ex.: `express-rate-limit`, 20 req/min) para não deixar um clique acidental repetido estourar custo.
- **Nunca logar o corpo completo da resposta do Claude** em produção se ela contiver dados de clientes — hoje `claude.js` não loga nada sensível, manter assim.

## 8. Como gerar e armazenar as chaves de API (API Keys)

1. **Gerar**: console da Anthropic (`platform.claude.com` → Settings → API Keys) → criar uma chave por ambiente (dev/staging/produção) — nunca reaproveitar a mesma chave entre ambientes.
2. **Armazenar em desenvolvimento**: `backend/.env` (já é o padrão, arquivo no `.gitignore`), variável `ANTHROPIC_API_KEY` — já existe em `backend/.env.example` como placeholder.
3. **Armazenar em produção**: **não usar `.env` em disco** — usar o secret manager do provedor de hospedagem (AWS Secrets Manager, Railway/Render "Environment Variables" criptografadas, etc.), injetado como variável de ambiente no processo.
4. **Rotação**: trocar a chave periodicamente (ex.: a cada 90 dias) e sempre que alguém com acesso sair do time. Como a chave só vive no backend, rotacionar é só atualizar a variável de ambiente e reiniciar o processo — nenhum código muda.
5. **Escopo/limites**: configurar um limite de gasto mensal na chave (disponível no console da Anthropic) como rede de segurança contra um loop de análise descontrolado.

## 9. Exemplo de requisição e resposta da API

### Tempo real (já implementado, referência)
```json
// Request (via SDK, backend/claude.js)
{
  "model": "claude-opus-4-8",
  "max_tokens": 4096,
  "thinking": { "type": "adaptive" },
  "output_config": {
    "effort": "medium",
    "format": { "type": "json_schema", "schema": { "...": "ANALYSIS_SCHEMA" } }
  },
  "system": "Você é um assistente de suporte da Zorte...",
  "messages": [{ "role": "user", "content": "Assunto: Cobrança em duplicidade\nDescrição: ...\n..." }]
}
```
```json
// Response (parseada de response.content[0].text)
{
  "resumo": "Cliente relata cobrança duplicada na fatura de julho.",
  "categoria": "Financeiro",
  "sentimento": "frustrado",
  "prioridade_sugerida": "alta",
  "resposta_sugerida": "Olá! Peço desculpas pelo transtorno...",
  "proximos_passos": ["Verificar duplicidade no sistema de faturamento", "Estornar valor se confirmado"]
}
```

### Lote (novo — Message Batches API)
```json
// POST /v1/messages/batches
{
  "requests": [
    {
      "custom_id": "ticket_3f2a1b",
      "params": {
        "model": "claude-sonnet-5",
        "max_tokens": 2048,
        "output_config": { "format": { "type": "json_schema", "schema": "..." } },
        "system": [{ "type": "text", "text": "<mesmo system prompt>", "cache_control": { "type": "ephemeral" } }],
        "messages": [{ "role": "user", "content": "Assunto: ...\n..." }]
      }
    }
  ]
}
```
```json
// Poll: GET /v1/messages/batches/msgbatch_abc123 → quando processing_status == "ended"
// Stream: GET /v1/messages/batches/msgbatch_abc123/results (JSONL, uma linha por ticket)
{ "custom_id": "ticket_3f2a1b", "result": { "type": "succeeded", "message": { "content": [{ "type": "text", "text": "{...json...}" }] } } }
```
`custom_id` = `ticket_id` do seu banco — é assim que você casa o resultado de volta com a linha certa ao salvar em `analises_ia` (os resultados **não** voltam na mesma ordem em que foram enviados).

## 10. Como implementar análise automática por categoria

Estenda o `ANALYSIS_SCHEMA` em `claude.js` — trocar o `categoria` de texto livre para `enum` fechado, e adicionar um campo `acao_recomendada` específico por categoria:

```js
categoria: {
  type: 'string',
  enum: ['Bug', 'Reclamação', 'Sugestão de Melhoria', 'Cancelamento', 'Problema Financeiro', 'Problema Operacional', 'Dúvida', 'Outro'],
},
gravidade: { type: 'string', enum: ['baixa', 'media', 'alta', 'critica'] },
```

Mapeamento de ação por categoria (lógica no backend, após receber a resposta):

| Categoria | Ação automática |
|---|---|
| **Bug** | Sugerir vínculo com o Linear (campo `linear_issue_id` já existe em `tickets` — ver integração feita nesta sessão); se `gravidade=critica`, criar `alertas_ia` imediato |
| **Reclamação** | Marcar `priority=alta` automaticamente se `sentimento IN (negativo, frustrado)` |
| **Sugestão de melhoria** | Tag automática `"sugestao"` (usa o catálogo de tags já implementado) para facilitar filtro |
| **Cancelamento** | Notificação imediata (tabela `notificacoes` já existe) para o atendente + flag num relatório de retenção |
| **Problema Financeiro** | Tag `"financeiro"` + prioridade mínima `alta` |
| **Problema Operacional** | Agrupa no alerta de "gargalo operacional" (seção 13) |

## 11. Como treinar o contexto da IA usando o histórico de tickets

O Claude **não usa fine-tuning tradicional** para este tipo de uso — a abordagem correta é **contexto em tempo de chamada** (RAG leve), sem precisar de infraestrutura de vetor:

1. **Curto prazo (sem pgvector)**: ao analisar um ticket, buscar os 3 tickets mais recentes da **mesma empresa** ou com **tags iguais** já resolvidos (`SELECT ... WHERE company_id = $1 AND status = 'resolvido' ORDER BY closed_at DESC LIMIT 3`) e incluir o resumo deles no prompt como contexto: *"Atendimentos anteriores similares deste cliente: ..."*.
2. **Médio prazo (com busca semântica)**: adicionar a extensão `pgvector` ao Postgres, gerar embedding do `subject+description` de cada ticket resolvido (via um endpoint de embeddings, ou usando o próprio resumo gerado pelo Claude), e buscar por similaridade de cosseno os tickets mais parecidos — mais preciso que igualdade de tags.
3. **"Playbook" reutilizável**: manter um bloco de system prompt com os padrões mais comuns encontrados (atualizado manualmente ou gerado pelo relatório executivo da seção 15) — ex.: *"Problemas de cobrança duplicada geralmente são causados por X; a solução padrão é Y"*. Esse texto entra no `system` e se beneficia do prompt caching (próxima seção).

## Prompt caching

O `system` prompt de `claude.js` é fixo e reaproveitado em toda análise — candidato ideal para cache:

```js
system: [
  { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
],
```
Com isso, a partir da 2ª chamada dentro do TTL (5 min padrão, ou `ttl: "1h"`), o texto do system prompt é lido do cache a ~10% do custo. Em lotes grandes (Message Batches), colocar o mesmo `system` com `cache_control` em **todas as requests do lote compartilha o cache** entre elas — economiza significativamente quando processando centenas de tickets.

## 12. Como implementar sugestões automáticas para os atendentes

Hoje `resposta_sugerida` e `proximos_passos` já são gerados, mas **não aparecem em lugar nenhum da UI** — é a lacuna a fechar:

- Em `TicketDetail.tsx`: adicionar um card "Sugestão da IA" (busca `GET /api/ai_analyses?eq.ticket_id=...&order_by=created_at&order_dir=desc&limit=1`), mostrando `resumo`, `resposta_sugerida` (com botão "Copiar" ou "Usar como nota") e `proximos_passos` como checklist.
- Botão **"Analisar com IA"** que chama a rota existente e recarrega o card.
- Campo `aplicada` em `analises_ia`: marcar `true` quando o atendente usa a resposta sugerida — vira métrica de quão útil a IA está sendo (para o relatório executivo).

## 13. Como criar alertas quando houver aumento anormal de ocorrências

Job agendado (ex.: a cada hora, `node-cron`) faz uma query de comparação:

```sql
-- Contagem da última hora vs. média das últimas 4 semanas na mesma janela
WITH atual AS (
  SELECT categoria, count(*) AS total
  FROM analises_ia
  WHERE criado_em >= now() - interval '1 hour'
  GROUP BY categoria
),
historico AS (
  SELECT categoria, count(*) / 4.0 AS media_hora
  FROM analises_ia
  WHERE criado_em >= now() - interval '4 weeks'
    AND criado_em < now() - interval '1 hour'
  GROUP BY categoria
)
SELECT a.categoria, a.total, h.media_hora
FROM atual a
JOIN historico h ON h.categoria = a.categoria
WHERE a.total > h.media_hora * 3;  -- limiar: 3x a média = anômalo
```
Cada linha retornada vira um `INSERT INTO alertas_ia` (tipo `pico_categoria`) + uma notificação no sino (tabela `notificacoes`, já implementada, atribuída a um atendente "supervisor" ou a todos). O limiar (`3x`) é ajustável; comece conservador para não gerar ruído.

## 14. Como implementar análise de sentimento dos clientes

Já existe no schema (`sentimento`), só falta **persistir e agregar**. Com `analises_ia` salvando cada análise:

```sql
-- Tendência de sentimento por semana (para o dashboard)
SELECT date_trunc('week', criado_em) AS semana,
       sentimento,
       count(*) AS total
FROM analises_ia
GROUP BY 1, 2
ORDER BY 1;
```
No frontend, um gráfico de linha (uma linha por sentimento) na página de relatórios (seção 15) mostra a evolução — sinaliza se a satisfação está piorando antes que vire cancelamento.

## 15. Como gerar indicadores gerenciais e relatórios executivos

Duas camadas:

**A) Indicadores quantitativos (sem IA, só SQL)** — nova rota `GET /api/ai/reports/summary?from=...&to=...`:
```json
{
  "total_tickets": 340,
  "por_categoria": { "Bug": 42, "Reclamação": 18, "Financeiro": 25, "...": "..." },
  "por_sentimento": { "positivo": 120, "neutro": 150, "negativo": 50, "frustrado": 20 },
  "tempo_medio_resolucao_horas": 14.2,
  "taxa_sugestao_aplicada": 0.63,
  "gargalos": [{ "empresa": "Transportes X", "total_tickets": 22, "categoria_predominante": "Operacional" }]
}
```

**B) Resumo executivo narrativo (com IA)** — uma chamada mensal ao Claude, alimentando os números da camada A como contexto, pedindo um texto corrido:
```
system: "Você é um analista que resume indicadores de atendimento para diretoria."
user: "Dados do mês: {json da camada A}. Escreva um resumo executivo de 1 parágrafo
       destacando tendências, riscos e uma recomendação."
```
Isso é **1 chamada barata** (não precisa reprocessar tickets, só interpretar números já agregados) — pode usar `claude-sonnet-5` ou até `claude-haiku-4-5` para custo mínimo, já que a tarefa é simples sumarização de números, não análise profunda.

---

## Estrutura recomendada para escalabilidade

| Preocupação | Solução recomendada |
|---|---|
| Muitos tickets simultâneos em tempo real | Rate limit na rota + fila simples em memória (array) se necessário; volume atual não justifica Redis/BullMQ |
| Reprocessar milhares de tickets antigos | Message Batches API (50% mais barato, sem bloquear o servidor) |
| Custo sob controle | Token Counting antes de rodar lote grande + limite de gasto na chave (seção 8) + cache do system prompt |
| Latência da análise em tempo real | `effort: "medium"` (já configurado) é o ponto de equilíbrio; não subir para `high`/`xhigh` a menos que a qualidade não esteja satisfatória |
| Não perder análises | Tabela `analises_ia` histórica (nunca sobrescreve) + `lotes_analise_ia` rastreando cada execução em lote |

## Modelos recomendados (tiers) — custo/latência

| Tarefa | Modelo sugerido | Por quê |
|---|---|---|
| Análise em tempo real de 1 ticket (já implementado) | `claude-opus-4-8` (atual) | Mais qualidade na resposta sugerida ao cliente; volume baixo (1 clique por vez) não pesa no custo |
| Classificação em lote de milhares de tickets históricos | `claude-sonnet-5` | ~40% mais barato que Opus, qualidade de classificação/categoria é suficiente para esse tipo de tarefa estruturada |
| Sumarização de números já agregados (resumo executivo) | `claude-haiku-4-5` ou `claude-sonnet-5` | Tarefa simples (só interpretar números), não precisa do modelo mais caro |
| Detecção de anomalia (comparação de contagens) | **Nenhum modelo** — é aritmética/SQL pura (seção 13), não chame o Claude para isso |

Preços de referência (checar `platform.claude.com/docs/en/pricing` para valores atuais): Opus 4.8 = $5/$25 por milhão de tokens (entrada/saída); Sonnet 5 = $3/$15 (com desconto introdutório $2/$10 até 2026-08-31); Haiku 4.5 = $1/$5. A Message Batches API aplica **50% de desconto** sobre qualquer um desses.

---

## Ordem de implementação sugerida

1. Criar `analises_ia` + persistir toda análise em tempo real que já roda hoje (ganho imediato: histórico deixa de se perder).
2. Exibir a sugestão na UI do `TicketDetail.tsx` (fecha o objetivo 12, maior valor por esforço).
3. Relatório de indicadores (seção 15-A) — só SQL sobre o que já está sendo salvo no passo 1.
4. Message Batches para o histórico existente (seção 3/9) — popula `analises_ia` retroativamente.
5. Alertas de anomalia (seção 13) e resumo executivo narrativo (15-B) — dependem de volume de dados dos passos anteriores.

Este documento é a arquitetura; nenhuma dessas mudanças foi implementada ainda — me diga por qual etapa começar.
