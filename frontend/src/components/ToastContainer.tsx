import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { toast, ToastItem, ToastType } from '../lib/toast';

const STYLES: Record<ToastType, { icon: typeof CheckCircle2; color: string }> = {
  success: { icon: CheckCircle2, color: '#22c55e' },
  error: { icon: XCircle, color: '#ef4444' },
  info: { icon: Info, color: '#a1a1aa' },
};

export default function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => toast.subscribe(setItems), []);

  if (!items.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {items.map((it) => {
        const { icon: Icon, color } = STYLES[it.type];
        return (
          <div
            key={it.id}
            className="card animate-slide-in flex items-start gap-2.5 p-3 shadow-xl"
            style={{ borderColor: `${color}40` }}
          >
            <Icon className="h-5 w-5 flex-shrink-0" style={{ color }} />
            <p className="flex-1 text-sm text-white">{it.message}</p>
            <button onClick={() => toast.dismiss(it.id)} className="text-[#a1a1aa] hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
