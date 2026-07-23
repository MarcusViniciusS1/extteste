import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { _registerConfirmListener } from '../lib/confirm';

interface Request {
  message: string;
  resolve: (value: boolean) => void;
}

export default function ConfirmDialog() {
  const [req, setReq] = useState<Request | null>(null);

  useEffect(() => {
    _registerConfirmListener(setReq);
    return () => _registerConfirmListener(null);
  }, []);

  if (!req) return null;

  function answer(value: boolean) {
    req?.resolve(value);
    setReq(null);
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => answer(false)} />
      <div className="card animate-slide-in relative w-full max-w-sm space-y-4 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#f59e0b]" />
          <p className="text-sm text-white">{req.message}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#3f3f46] pt-3">
          <button onClick={() => answer(false)} className="btn-ghost">Cancelar</button>
          <button onClick={() => answer(true)} className="btn bg-[#ef4444] text-white hover:bg-[#dc2626]">Confirmar</button>
        </div>
      </div>
    </div>
  );
}
