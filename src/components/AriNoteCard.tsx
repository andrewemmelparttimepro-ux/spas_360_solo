import { useState } from 'react';
import { Copy, FileText, Image, MessageCircleReply, Send, X } from 'lucide-react';
import MentionText from '@/components/MentionText';
import { useToast } from '@/components/ui/Toast';
import { ariNoteBody, stripMentions } from '@/lib/mentions';
import { exportAriDeliverable, type AriOutputFormat } from '@/lib/ariExport';
import AriAvatar from '@/components/AriAvatar';

interface AriNote {
  id: string;
  body: string;
  author_name?: string;
  created_at: string;
}

interface AriNoteCardProps {
  note: AriNote;
  contextTitle: string;
  preparedFor?: string;
  disabled?: boolean;
  onReply: (request: string, format: AriOutputFormat, previousOutput: string) => Promise<string | null>;
}

export default function AriNoteCard({ note, contextTitle, preparedFor, disabled, onReply }: AriNoteCardProps) {
  const { toast } = useToast();
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [format, setFormat] = useState<AriOutputFormat>('note');
  const [working, setWorking] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'jpg' | null>(null);
  const output = stripMentions(ariNoteBody(note.body));

  const copy = async () => {
    await navigator.clipboard.writeText(output);
    toast('Copied — paste it anywhere', 'success');
  };

  const download = async (kind: 'pdf' | 'jpg', body = output) => {
    setExporting(kind);
    try {
      await exportAriDeliverable(kind, { title: contextTitle, body, preparedFor });
      toast(`${kind.toUpperCase()} downloaded`, 'success');
    } catch (err) {
      toast((err as Error).message || `Could not create ${kind.toUpperCase()}`, 'error');
    } finally {
      setExporting(null);
    }
  };

  const submitReply = async () => {
    if (!reply.trim() || working || disabled) return;
    setWorking(true);
    const result = await onReply(reply.trim(), format, output);
    if (result) {
      if (format === 'pdf' || format === 'jpg') await download(format, result);
      setReply('');
      setReplyOpen(false);
      setFormat('note');
    }
    setWorking(false);
  };

  const actionClass = 'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-ink-400 hover:text-brand-300 hover:bg-brand-500/10 transition-colors disabled:opacity-50';

  return (
    <div className="p-3 bg-brand-500/5 rounded-lg border border-brand-500/30">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-400"><AriAvatar size="xs" />Ari — Sales Assistant</span>
        <div className="flex flex-wrap items-center justify-end gap-0.5">
          <button onClick={() => setReplyOpen(open => !open)} disabled={disabled} className={actionClass} aria-label="Reply to Ari here">
            <MessageCircleReply className="w-3 h-3" />Reply
          </button>
          <button onClick={() => download('pdf')} disabled={!!exporting} className={actionClass} aria-label="Download Ari response as PDF">
            <FileText className="w-3 h-3" />{exporting === 'pdf' ? 'Building…' : 'PDF'}
          </button>
          <button onClick={() => download('jpg')} disabled={!!exporting} className={actionClass} aria-label="Download Ari response as JPG">
            <Image className="w-3 h-3" />{exporting === 'jpg' ? 'Building…' : 'JPG'}
          </button>
          <button onClick={copy} className={actionClass} aria-label="Copy Ari response">
            <Copy className="w-3 h-3" />Copy
          </button>
        </div>
      </div>

      <p className="text-sm text-ink-100 whitespace-pre-wrap"><MentionText body={ariNoteBody(note.body)} /></p>
      <p className="text-xs text-ink-500 mt-2">for {note.author_name} · {new Date(note.created_at).toLocaleDateString()}</p>

      {replyOpen && (
        <div className="mt-3 pt-3 border-t border-brand-500/20">
          <textarea
            value={reply}
            onChange={event => setReply(event.target.value)}
            onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void submitReply(); }}
            placeholder="Reply to Ari… e.g. Make this customer-ready and remove the [CONFIRM] lines"
            className="w-full min-h-20 px-3 py-2 rounded-lg bg-ink-950 border border-ink-700 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-brand-500 resize-y"
            autoFocus
            disabled={working || disabled}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-ink-950 border border-ink-800" aria-label="Ari reply output format">
              {(['note', 'pdf', 'jpg'] as AriOutputFormat[]).map(option => (
                <button
                  key={option}
                  onClick={() => setFormat(option)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase transition-colors ${format === option ? 'bg-brand-500 text-white' : 'text-ink-400 hover:text-ink-200'}`}
                  aria-label={`Return Ari reply as ${option.toUpperCase()}`}
                >
                  {option === 'note' ? 'Note' : option.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => { setReplyOpen(false); setReply(''); }} className="p-2 rounded-lg text-ink-500 hover:text-ink-200 hover:bg-ink-800" aria-label="Cancel Ari reply"><X className="w-4 h-4" /></button>
              <button onClick={submitReply} disabled={!reply.trim() || working || disabled} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-xs font-semibold" aria-label="Send reply to Ari">
                <Send className="w-3.5 h-3.5" />{working ? 'Ari is working…' : format === 'note' ? 'Send' : `Create ${format.toUpperCase()}`}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-ink-500 mt-1.5">⌘ Enter to send · Ari keeps the earlier output as context</p>
        </div>
      )}
    </div>
  );
}
