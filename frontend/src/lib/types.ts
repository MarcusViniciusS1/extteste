export type TicketStatus = 'novo' | 'assumido' | 'em_andamento' | 'aguardando' | 'resolvido' | 'fechado';
export type TicketPriority = 'baixa' | 'media' | 'alta' | 'urgente';
export type TicketChannel = 'telefone' | 'email' | 'chat' | 'whatsapp' | 'presencial' | 'api';

export type TicketSystem = 'Z' | 'L';

export interface Tenant {
  id: string;
  name: string;
  slug?: string | null;
}

// Catálogo de tags reutilizáveis (independente do array tickets.tags, que
// guarda só os NOMES das tags aplicadas em cada ticket).
export interface Tag {
  id: string;
  name: string;
  color: string;
  description?: string | null;
  is_preset?: boolean;
  created_at?: string;
}

export interface Company {
  id: string;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  tenant_id?: string | null;
  tenant?: Tenant | null;
  tags?: string[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface Contact {
  id: string;
  company_id?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  position?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  company?: Company | null;
}

export interface Attendant {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  department?: string | null;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Ticket {
  id: string;
  ticket_number?: number;
  subject: string;
  description?: string | null;
  url_atendimento?: string | null;
  nome_contato?: string | null;
  telefone_contato?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  channel: TicketChannel;
  company_id?: string | null;
  contact_id?: string | null;
  attendant_id?: string | null;
  due_date?: string | null;
  sistema?: TicketSystem | null;
  tags?: string[] | null;
  linear_issue_id?: string | null;
  linear_issue_url?: string | null;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
  company?: Company | null;
  contact?: Contact | null;
  attendant?: Attendant | null;
}

export interface TicketNote {
  id: string;
  ticket_id: string;
  attendant_id?: string | null;
  note: string;
  is_internal?: boolean;
  created_at?: string;
  attendant?: Attendant | null;
}

// Notificação interna para um atendente (ex.: aviso de que a issue do Linear
// vinculada a um ticket recebeu retorno).
export interface Notification {
  id: string;
  attendant_id?: string | null;
  ticket_id?: string | null;
  message: string;
  read?: boolean;
  created_at?: string;
  ticket?: Ticket | null;
}

export interface SystemLog {
  id: string;
  action: string;
  entity?: string | null;
  entity_id?: string | null;
  attendant_id?: string | null;
  details?: Record<string, unknown> | null;
  created_at?: string;
  attendant?: Attendant | null;
}

export interface ApiConnection {
  id: string;
  name: string;
  type: string;
  endpoint?: string | null;
  api_key_ref?: string | null;
  status: 'active' | 'inactive' | 'error';
  last_sync_at?: string | null;
  config?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  novo: 'Novo',
  assumido: 'Assumido',
  em_andamento: 'Em Andamento',
  aguardando: 'Aguardando',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const CHANNEL_LABELS: Record<TicketChannel, string> = {
  telefone: 'Telefone',
  email: 'E-mail',
  chat: 'Chat',
  whatsapp: 'WhatsApp',
  presencial: 'Presencial',
  api: 'API',
};
