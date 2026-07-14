import { useState } from 'react';
import { CheckCircle2, Download, Eye, FileText, Loader2, Share2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { AgentDeliverable } from '@/hooks/useAgentChat';

type Props = {
  artifact: AgentDeliverable;
  className?: string;
};

async function artifactAccess(id: string, download = false) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Your session has expired. Sign in again.');
  const response = await fetch(`/api/deliverables/file?id=${encodeURIComponent(id)}${download ? '&download=1' : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null) as {
    url?: string;
    file_name?: string | null;
    mime_type?: string | null;
    error?: string;
  } | null;
  if (!response.ok || !payload?.url) throw new Error(payload?.error || 'Could not open this file.');
  return payload;
}

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AriArtifactCard({ artifact, className }: Props) {
  const [busy, setBusy] = useState<'preview' | 'download' | 'share' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isReady = artifact.status === 'ready';
  const isBlocked = artifact.status === 'blocked';

  const run = async (action: 'preview' | 'download' | 'share') => {
    setBusy(action);
    setNotice(null);
    let previewWindow: Window | null = null;
    if (action === 'preview') previewWindow = window.open('about:blank', '_blank');
    try {
      const access = await artifactAccess(artifact.id, action === 'download');
      if (action === 'preview') {
        if (previewWindow) {
          previewWindow.opener = null;
          previewWindow.location.replace(access.url!);
        }
        else window.location.assign(access.url!);
      } else if (action === 'download') {
        const link = document.createElement('a');
        link.href = access.url!;
        link.download = access.file_name || artifact.file_name || 'ari-sales-tool.pdf';
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        const response = await fetch(access.url!);
        if (!response.ok) throw new Error('Could not prepare the file for sharing.');
        const blob = await response.blob();
        const file = new File(
          [blob],
          access.file_name || artifact.file_name || 'ari-sales-tool.pdf',
          { type: access.mime_type || artifact.mime_type || 'application/pdf' },
        );
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
          await navigator.share({ title: artifact.title, files: [file] });
        } else {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(file);
          link.download = file.name;
          link.click();
          URL.revokeObjectURL(link.href);
          setNotice('Downloaded — attach it in your email or messaging app.');
        }
      }
    } catch (error) {
      previewWindow?.close();
      if ((error as Error).name !== 'AbortError') setNotice((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className={cn(
      'overflow-hidden rounded-2xl border bg-gradient-to-br shadow-lg',
      isBlocked
        ? 'border-amber-500/35 from-amber-500/10 to-ink-900'
        : artifact.status === 'failed'
          ? 'border-red-500/35 from-red-500/10 to-ink-900'
          : 'border-brand-500/35 from-brand-500/15 via-ink-900 to-ink-950',
      className,
    )}>
      <div className="flex items-start gap-3 p-3.5">
        <div className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
          isBlocked ? 'border-amber-500/30 bg-amber-500/15 text-amber-300' : 'border-brand-500/30 bg-brand-500/15 text-brand-300',
        )}>
          {isBlocked ? <ShieldAlert className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-ink-50">{artifact.title}</p>
            {isReady && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
          </div>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-400">
            {isBlocked ? 'Blocked by preflight' : artifact.status === 'failed' ? 'Renderer needs attention' : `PDF · ${formatSize(artifact.file_size_bytes) || 'Ready'} · Citadel`}
          </p>
        </div>
      </div>

      {isBlocked && (
        <div className="mx-3.5 mb-3.5 rounded-xl border border-amber-500/20 bg-ink-950/55 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-300">Required before release</p>
          <ul className="space-y-1.5">
            {(artifact.missing_fields || []).map(item => (
              <li key={`${item.field}-${item.record_id || ''}`} className="text-xs leading-relaxed text-ink-300">
                <span className="font-semibold text-ink-100">{item.field}:</span> {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isReady && (
        <div className="grid grid-cols-3 border-t border-ink-700/70 bg-ink-950/45">
          {([
            ['preview', Eye, 'Preview'],
            ['download', Download, 'Download'],
            ['share', Share2, 'Share'],
          ] as const).map(([action, Icon, label]) => (
            <button
              key={action}
              onClick={() => run(action)}
              disabled={busy !== null}
              className="flex items-center justify-center gap-1.5 border-r border-ink-700/70 px-2 py-2.5 text-[11px] font-semibold text-ink-300 transition-colors last:border-r-0 hover:bg-brand-500/10 hover:text-brand-200 disabled:opacity-50"
            >
              {busy === action ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
              {label}
            </button>
          ))}
        </div>
      )}
      {notice && <p className="border-t border-ink-700/70 px-3.5 py-2 text-[10px] text-amber-200">{notice}</p>}
    </section>
  );
}
