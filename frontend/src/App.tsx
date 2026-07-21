import { useEffect, useState } from 'react';
import { Ticket, Users, Building2, Plug, LayoutDashboard, Activity } from 'lucide-react';
import { supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import Contacts from './pages/Contacts';
import Companies from './pages/Companies';
import Attendants from './pages/Attendants';
import ApiConnections from './pages/ApiConnections';
import SystemLogs from './pages/SystemLogs';
import Registro from './pages/Registro';

export type Page =
  | { name: 'dashboard' }
  | { name: 'tickets' }
  | { name: 'ticket'; id: string }
  | { name: 'contacts' }
  | { name: 'companies' }
  | { name: 'attendants' }
  | { name: 'api' }
  | { name: 'logs' }
  | { name: 'registro' };

const getInitialPage = (): Page => {
  const path = window.location.pathname;
  if (path.startsWith('/registro')) return { name: 'registro' };
  if (path.startsWith('/tickets')) return { name: 'tickets' };
  if (path.startsWith('/contacts')) return { name: 'contacts' };
  if (path.startsWith('/companies')) return { name: 'companies' };
  if (path.startsWith('/attendants')) return { name: 'attendants' };
  if (path.startsWith('/api')) return { name: 'api' };
  if (path.startsWith('/logs')) return { name: 'logs' };
  return { name: 'dashboard' };
};

export default function App() {
  const [page, setPage] = useState<Page>(getInitialPage());
  const [counts, setCounts] = useState({ tickets: 0, companies: 0, contacts: 0, attendants: 0 });

  async function refreshCounts() {
    const [t, c, co, a] = await Promise.all([
      supabase.from('tickets').select('*', { count: 'exact', head: true }),
      supabase.from('contacts').select('*', { count: 'exact', head: true }),
      supabase.from('companies').select('*', { count: 'exact', head: true }),
      supabase.from('attendants').select('*', { count: 'exact', head: true }),
    ]);
    setCounts({
      tickets: t.count ?? 0,
      contacts: c.count ?? 0,
      companies: co.count ?? 0,
      attendants: a.count ?? 0,
    });
  }

  useEffect(() => {
    if (page.name !== 'ticket') {
      const newPath = page.name === 'dashboard' ? '/' : `/${page.name}`;
      if (window.location.pathname !== newPath) {
        window.history.pushState({}, '', newPath);
      }
    }
    refreshCounts();
  }, [page]);

  if (page.name === 'registro') {
    return <Registro />;
  }

  const navItems: { key: Page['name']; label: string; icon: typeof Ticket; page: Page }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, page: { name: 'dashboard' } },
    { key: 'tickets', label: 'Tickets', icon: Ticket, page: { name: 'tickets' } },
    { key: 'contacts', label: 'Contatos', icon: Users, page: { name: 'contacts' } },
    { key: 'companies', label: 'Empresas', icon: Building2, page: { name: 'companies' } },
    { key: 'attendants', label: 'Atendentes', icon: Users, page: { name: 'attendants' } },
    { key: 'api', label: 'Conexões API', icon: Plug, page: { name: 'api' } },
    { key: 'logs', label: 'Logs do Sistema', icon: Activity, page: { name: 'logs' } },
  ];

  const countMap: Record<string, number> = {
    tickets: counts.tickets,
    contacts: counts.contacts,
    companies: counts.companies,
    attendants: counts.attendants,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-[#1f2d4d] bg-[#0b1220]/80 backdrop-blur">
        <div className="flex flex-col gap-2 px-5 py-5 border-b border-[#1f2d4d]">
          <img src="/zorte.png" alt="Zorte — Software para transportadoras" className="h-auto w-full max-w-[180px] self-start" />
          <p className="text-[11px] text-[#8a99b8]">Sistema de Atendimento</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = page.name === item.key || (item.key === 'tickets' && page.name === 'ticket');
            return (
              <button
                key={item.key}
                onClick={() => setPage(item.page)}
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? 'bg-[#2f7ff0]/15 text-white shadow-inner'
                    : 'text-[#8a99b8] hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className={`h-4.5 w-4.5 ${active ? 'text-[#2f7ff0]' : 'text-[#5a6a8a] group-hover:text-white'}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {countMap[item.key] !== undefined && countMap[item.key] > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    active ? 'bg-[#2f7ff0]/30 text-white' : 'bg-white/5 text-[#8a99b8]'
                  }`}>
                    {countMap[item.key]}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#1f2d4d]">
          <button onClick={() => setPage({ name: 'registro' })} className="btn-primary w-full">
            <Ticket className="h-4 w-4" /> Novo Ticket
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6 animate-fade-in">
          {page.name === 'dashboard' && <Dashboard onNavigate={setPage} onNewTicket={() => setPage({ name: 'registro' })} />}
          {page.name === 'tickets' && <Tickets onOpen={(id) => setPage({ name: 'ticket', id })} onNewTicket={() => setPage({ name: 'registro' })} />}
          {page.name === 'ticket' && <TicketDetail id={page.id} onBack={() => setPage({ name: 'tickets' })} />}
          {page.name === 'contacts' && <Contacts />}
          {page.name === 'companies' && <Companies />}
          {page.name === 'attendants' && <Attendants />}
          {page.name === 'api' && <ApiConnections />}
          {page.name === 'logs' && <SystemLogs />}
        </div>
      </main>
    </div>
  );
}