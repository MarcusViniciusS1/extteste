// Integração com a API da Anthropic (Claude).
//
// Este módulo é o único lugar que fala com o Claude. A chave da API fica
// SOMENTE aqui no backend (nunca vai para o navegador). O app React chama a
// rota /api/ai/analyze-ticket, e este arquivo monta o prompt e devolve uma
// análise estruturada do ticket em JSON.

import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;

// true quando há uma chave configurada no backend/.env. O frontend consulta
// isso (/api/ai/status) para mostrar ou esconder os botões de IA.
export const claudeConfigured = Boolean(apiKey && apiKey.trim());

const client = claudeConfigured ? new Anthropic({ apiKey }) : null;

// Opus 4.8 é o padrão. Para volume alto, troque para claude-sonnet-5 no .env.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

// Esquema da resposta. Structured outputs garante que o Claude devolva
// exatamente estes campos, sempre em JSON válido.
const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    resumo: {
      type: 'string',
      description: 'Resumo curto (2-3 frases) do problema do cliente e do estado atual do ticket.',
    },
    categoria: {
      type: 'string',
      description: 'Categoria do chamado, ex: "Financeiro", "Suporte Técnico", "Dúvida", "Reclamação".',
    },
    sentimento: {
      type: 'string',
      enum: ['positivo', 'neutro', 'negativo', 'frustrado'],
      description: 'Sentimento predominante do cliente.',
    },
    prioridade_sugerida: {
      type: 'string',
      enum: ['baixa', 'media', 'alta', 'urgente'],
      description: 'Prioridade recomendada com base na urgência e no impacto.',
    },
    resposta_sugerida: {
      type: 'string',
      description: 'Rascunho de resposta ao cliente, em português, tom profissional e cordial. O atendente vai revisar antes de enviar.',
    },
    proximos_passos: {
      type: 'array',
      items: { type: 'string' },
      description: 'Lista de ações internas recomendadas para o atendente resolver o ticket.',
    },
  },
  required: ['resumo', 'categoria', 'sentimento', 'prioridade_sugerida', 'resposta_sugerida', 'proximos_passos'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Você é um assistente de suporte da Zorte que ajuda atendentes a analisar e responder tickets de clientes.
Analise o ticket e o histórico de interações fornecidos e produza uma análise objetiva.
Escreva sempre em português do Brasil. A resposta sugerida deve ser cordial, clara e pronta para o atendente revisar e enviar ao cliente — não invente informações que não estejam no ticket; se faltar dado, peça-o educadamente na resposta.`;

function buildTicketText({ ticket, notes }) {
  const linhas = [];
  linhas.push(`Assunto: ${ticket.subject ?? '(sem assunto)'}`);
  if (ticket.description) linhas.push(`Descrição: ${ticket.description}`);
  linhas.push(`Status atual: ${ticket.status ?? '—'}`);
  linhas.push(`Prioridade atual: ${ticket.priority ?? '—'}`);
  linhas.push(`Canal: ${ticket.channel ?? '—'}`);
  if (ticket.company?.name) linhas.push(`Empresa: ${ticket.company.name}`);
  if (ticket.contact?.name) linhas.push(`Contato: ${ticket.contact.name}`);
  if (Array.isArray(ticket.tags) && ticket.tags.length) linhas.push(`Tags: ${ticket.tags.join(', ')}`);

  if (Array.isArray(notes) && notes.length) {
    linhas.push('', 'Histórico de interações (mais antigas primeiro):');
    for (const n of notes) {
      const autor = n.attendant?.name ?? 'Sistema/Cliente';
      const marca = n.is_internal ? ' [nota interna]' : '';
      linhas.push(`- ${autor}${marca}: ${n.note}`);
    }
  } else {
    linhas.push('', 'Ainda não há interações registradas neste ticket.');
  }

  return linhas.join('\n');
}

// Recebe um ticket (já com company/contact embutidos) e suas notas, e devolve
// o objeto de análise validado contra ANALYSIS_SCHEMA.
export async function analyzeTicket({ ticket, notes }) {
  if (!client) {
    throw Object.assign(
      new Error('ANTHROPIC_API_KEY não configurada no backend/.env — a IA está desativada.'),
      { status: 503 }
    );
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: ANALYSIS_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildTicketText({ ticket, notes }) }],
  });

  if (response.stop_reason === 'refusal') {
    throw Object.assign(new Error('O modelo recusou a solicitação por motivos de segurança.'), { status: 422 });
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw Object.assign(new Error('Resposta vazia do modelo.'), { status: 502 });

  return JSON.parse(textBlock.text);
}
