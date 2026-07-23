import { useEffect, useState } from 'react';
import { Ticket, Users, Building2, Plug, LayoutDashboard, Activity, Settings, ChevronDown, Tag as TagIcon } from 'lucide-react';
import { supabase } from './lib/supabase';
import Dashboard from './pages/Dashboard';
import Tickets from './pages/Tickets';
import TicketDetail from './pages/TicketDetail';
import Contacts from './pages/Contacts';
import Companies from './pages/Companies';
import Attendants from './pages/Attendants';
import ApiConnections from './pages/ApiConnections';
import SystemLogs from './pages/SystemLogs';
import Tags from './pages/tag';
import Registro from './pages/Registro';
import NotificationBell from './components/NotificationBell';
import ToastContainer from './components/ToastContainer';
import ConfirmDialog from './components/ConfirmDialog';

export type Page =
  | { name: 'dashboard' }
  | { name: 'tickets' }
  | { name: 'ticket'; id: string }
  | { name: 'contacts' }
  | { name: 'companies' }
  | { name: 'attendants' }
  | { name: 'api' }
  | { name: 'logs' }
  | { name: 'tags' }
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
  if (path.startsWith('/tags')) return { name: 'tags' };
  return { name: 'dashboard' };
};

const SETTINGS_PAGES: Page['name'][] = ['attendants', 'api', 'logs', 'tags'];

export default function App() {
  const [page, setPage] = useState<Page>(getInitialPage());
  const [counts, setCounts] = useState({ tickets: 0, companies: 0, contacts: 0, attendants: 0 });
  const [settingsOpen, setSettingsOpen] = useState(() => SETTINGS_PAGES.includes(getInitialPage().name));

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
    return (
      <>
        <Registro />
        <ToastContainer />
        <ConfirmDialog />
      </>
    );
  }

  const navItems: { key: Page['name']; label: string; icon: typeof Ticket; page: Page }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, page: { name: 'dashboard' } },
    { key: 'tickets', label: 'Tickets', icon: Ticket, page: { name: 'tickets' } },
    { key: 'contacts', label: 'Contatos', icon: Users, page: { name: 'contacts' } },
    { key: 'companies', label: 'Empresas', icon: Building2, page: { name: 'companies' } },
  ];

  const settingsItems: { key: Page['name']; label: string; icon: typeof Ticket; page: Page }[] = [
    { key: 'attendants', label: 'Atendentes', icon: Users, page: { name: 'attendants' } },
    { key: 'api', label: 'Conexões API', icon: Plug, page: { name: 'api' } },
    { key: 'logs', label: 'Logs do Sistema', icon: Activity, page: { name: 'logs' } },
    { key: 'tags', label: 'Tags', icon: TagIcon, page: { name: 'tags' } },
  ];
  const settingsActive = SETTINGS_PAGES.includes(page.name);

  const countMap: Record<string, number> = {
    tickets: counts.tickets,
    contacts: counts.contacts,
    companies: counts.companies,
    attendants: counts.attendants,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-[#3f3f46] bg-[#1c1c1f]/95 backdrop-blur">
        <div className="flex flex-col gap-2 px-5 py-5 border-b border-[#3f3f46]">
          <img src="/zorte.png" alt="Zorte — Software para transportadoras" className="h-auto w-full max-w-[180px] self-start" />
          <p className="text-[11px] text-[#a1a1aa]">Sistema de Atendimento</p>
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
                    ? 'bg-[#ef4444]/15 text-white shadow-inner'
                    : 'text-[#a1a1aa] hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className={`h-4.5 w-4.5 ${active ? 'text-[#ef4444]' : 'text-[#71717a] group-hover:text-white'}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {countMap[item.key] !== undefined && countMap[item.key] > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    active ? 'bg-[#ef4444]/30 text-white' : 'bg-white/5 text-[#a1a1aa]'
                  }`}>
                    {countMap[item.key]}
                  </span>
                )}
              </button>
            );
          })}

          {/* Configurações (engrenagem) */}
          <button
            onClick={() => setSettingsOpen((o) => !o)}
            className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              settingsActive
                ? 'bg-[#ef4444]/15 text-white shadow-inner'
                : 'text-[#a1a1aa] hover:bg-white/5 hover:text-white'
            }`}
          >
            <Settings className={`h-4.5 w-4.5 ${settingsActive ? 'text-[#ef4444]' : 'text-[#71717a] group-hover:text-white'}`} />
            <span className="flex-1 text-left">Configurações</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
          </button>

          {settingsOpen && (
            <div className="ml-3 space-y-1 border-l border-[#3f3f46] pl-3">
              {settingsItems.map((item) => {
                const Icon = item.icon;
                const active = page.name === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setPage(item.page)}
                    className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      active
                        ? 'bg-[#ef4444]/15 text-white shadow-inner'
                        : 'text-[#a1a1aa] hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-[#ef4444]' : 'text-[#71717a] group-hover:text-white'}`} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {countMap[item.key] !== undefined && countMap[item.key] > 0 && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        active ? 'bg-[#ef4444]/30 text-white' : 'bg-white/5 text-[#a1a1aa]'
                      }`}>
                        {countMap[item.key]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        <div className="p-3 border-t border-[#3f3f46]">
          <button onClick={() => setPage({ name: 'registro' })} className="btn-primary w-full">
            <Ticket className="h-4 w-4" /> Novo Ticket
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="flex justify-end border-b border-[#3f3f46] px-6 py-2">
          <NotificationBell />
        </div>
        <div className="mx-auto max-w-7xl p-6 animate-fade-in">
          {page.name === 'dashboard' && <Dashboard onNavigate={setPage} onNewTicket={() => setPage({ name: 'registro' })} />}
          {page.name === 'tickets' && <Tickets onOpen={(id) => setPage({ name: 'ticket', id })} onNewTicket={() => setPage({ name: 'registro' })} />}
          {page.name === 'ticket' && <TicketDetail id={page.id} onBack={() => setPage({ name: 'tickets' })} />}
          {page.name === 'contacts' && <Contacts />}
          {page.name === 'companies' && <Companies />}
          {page.name === 'attendants' && <Attendants />}
          {page.name === 'api' && <ApiConnections />}
          {page.name === 'logs' && <SystemLogs />}
          {page.name === 'tags' && <Tags />}
        </div>
      </main>
      <ToastContainer />
      <ConfirmDialog />
    </div>
  );
}