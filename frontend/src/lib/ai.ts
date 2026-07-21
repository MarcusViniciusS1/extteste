// Cliente das rotas de IA do backend (Claude). A chave da API fica só no
// servidor; aqui só chamamos os endpoints /api/ai/*.

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3001';

export interface TicketAnalysis {
  resumo: string;
  categoria: string;
  sentimento: 'positivo' | 'neutro' | 'negativo' | 'frustrado';
  prioridade_sugerida: 'baixa' | 'media' | 'alta' | 'urgente';
  resposta_sugerida: string;
  proximos_passos: string[];
}

// Diz se a IA está configurada (há chave no backend). Nunca lança — em caso de
// falha de rede, retorna configured=false para o app simplesmente esconder a IA.
export async function getAiStatus(): Promise<{ configured: boolean; model: string }> {
  try {
    const res = await fetch(`${API_URL}/api/ai/status`);
    if (!res.ok) return { configured: false, model: '' };
    return await res.json();
  } catch {
    return { configured: false, model: '' };
  }
}

export async function analyzeTicket(ticketId: string): Promise<TicketAnalysis> {
  const res = await fetch(`${API_URL}/api/ai/analyze-ticket`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_id: ticketId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Falha ao analisar o ticket');
  return json.data as TicketAnalysis;
}
