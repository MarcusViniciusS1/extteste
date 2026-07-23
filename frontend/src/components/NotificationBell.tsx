import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Attendant, Notification } from '../lib/types';
import { getCurrentAttendantId, setCurrentAttendantId } from '../lib/currentAttendant';

// Sino de notificações internas (ex.: aviso de que uma sugestão vinculada no
// Linear recebeu retorno). Como o sistema não tem login, cada atendente
// seleciona uma vez "quem é você" (salvo no navegador) para ver só os avisos
// dele.
export default function NotificationBell() {
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [attendantId, setAttendantId] = useState(getCurrentAttendantId());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.from('attendants').select('*').eq('active', true).order('name').then(({ data }) => setAttendants(data ?? []));
  }, []);

  async function loadNotifications(forId: string) {
    if (!forId) { setNotifications([]); return; }
    const { data } = await supabase
      .from('notifications')
      .select('*, ticket(*)')
      .eq('attendant_id', forId)
      .order('created_at', { ascending: false })
      .limit(30);
    setNotifications(data ?? []);
  }

  useEffect(() => {
    loadNotifications(attendantId);
    if (!attendantId) return;
    const interval = setInterval(() => loadNotifications(attendantId), 30000);
    return () => clearInterval(interval);
  }, [attendantId]);

  function selectAttendant(id: string) {
    setAttendantId(id);
    setCurrentAttendantId(id);
  }

  async function markAsRead(n: Notification) {
    if (n.read) return;
    await supabase.from('notifications').update({ read: true }).eq('id', n.id);
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative flex items-center gap-2">
      <select
        className="input w-auto py-1.5 text-xs"
        value={attendantId}
        onChange={(e) => selectAttendant(e.target.value)}
        title="Quem é você? (define quais notificações você vê)"
      >
        <option value="">Quem é você?</option>
        {attendants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>

      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-[#a1a1aa] transition-colors hover:bg-white/5 hover:text-white"
        title="Notificações"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 max-h-96 w-80 overflow-y-auto rounded-lg border border-[#3f3f46] bg-[#18181b] shadow-xl">
          {!attendantId ? (
            <p className="p-4 text-sm text-[#a1a1aa]">Selecione quem você é para ver suas notificações.</p>
          ) : notifications.length === 0 ? (
            <p className="p-4 text-sm text-[#a1a1aa]">Nenhuma notificação.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => markAsRead(n)}
                className={`block w-full border-b border-[#3f3f46] px-4 py-3 text-left text-sm hover:bg-white/5 ${n.read ? 'opacity-60' : ''}`}
              >
                <p className="text-[#ffffff]">{n.message}</p>
                <p className="mt-1 text-xs text-[#71717a]">
                  {n.created_at ? new Date(n.created_at).toLocaleString('pt-BR') : ''}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
