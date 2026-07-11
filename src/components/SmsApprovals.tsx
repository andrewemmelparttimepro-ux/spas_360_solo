import { useCallback, useEffect, useState } from 'react';
import { Bot, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import { fetchPendingSms, approveSms, rejectSms, type PendingSms } from '@/agent/smsOutbox';

/**
 * The approval tap. Texts Ari queued sit here until a human sends or rejects
 * them — the moment Twilio creds land in Vercel, Approve goes fully live with
 * zero further build.
 */
export default function SmsApprovals({ onSent }: { onSent?: () => void }) {
  const { toast } = useToast();
  const [items, setItems] = useState<PendingSms[]>([]);
  const [working, setWorking] = useState<string | null>(null);

  const refresh = useCallback(async () => setItems(await fetchPendingSms()), []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel(`sms-outbox-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_outbox' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  if (items.length === 0) return null;

  const handleApprove = async (item: PendingSms) => {
    setWorking(item.id);
    const { error } = await approveSms(item);
    setWorking(null);
    if (error) { toast(`Not sent: ${error}`, 'error'); return; }
    toast('Text sent', 'success');
    refresh();
    onSent?.();
  };

  const handleReject = async (item: PendingSms) => {
    setWorking(item.id);
    const { error } = await rejectSms(item.id);
    setWorking(null);
    if (error) { toast(error, 'error'); return; }
    refresh();
  };

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/5">
      <p className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
        <Bot className="w-3.5 h-3.5" /> Ari — waiting on your approval ({items.length})
      </p>
      {items.map(item => (
        <div key={item.id} className="px-4 py-3 border-t border-ink-800/60">
          <p className="text-xs font-semibold text-ink-100 mb-1">
            To {item.contact ? `${item.contact.first_name} ${item.contact.last_name}` : item.to_phone}
            <span className="ml-2 font-normal text-ink-500">{item.to_phone}</span>
          </p>
          <p className="text-sm text-ink-300 bg-ink-950 border border-ink-800 rounded-lg px-3 py-2 whitespace-pre-wrap">{item.body}</p>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => handleApprove(item)}
              disabled={working === item.id}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Approve &amp; send
            </button>
            <button
              onClick={() => handleReject(item)}
              disabled={working === item.id}
              className="flex items-center gap-1.5 px-3 py-1.5 text-ink-400 hover:text-red-400 hover:bg-red-500/10 text-xs font-semibold rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
