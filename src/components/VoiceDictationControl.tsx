import { Mic, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceDictation } from '@/hooks/useVoiceDictation';

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function VoiceDictationControl({ value, onValueChange, disabled, className }: Props) {
  const voice = useVoiceDictation({ value, onValueChange, disabled });
  return (
    <div className={cn('relative shrink-0', className)}>
      {(voice.active || voice.error) && (
        <div className={cn(
          'absolute right-0 bottom-full mb-2 z-[60] flex min-w-max max-w-[min(22rem,82vw)] items-center gap-2 rounded-xl border px-3 py-2 shadow-2xl backdrop-blur-md',
          voice.error ? 'border-red-500/40 bg-red-950/95 text-red-100' : 'border-brand-500/35 bg-ink-900/95 text-ink-100'
        )} role="status" aria-live="polite">
          {!voice.error && <span className="voice-live-bars" aria-hidden="true"><i /><i /><i /></span>}
          <span className="text-[11px] font-semibold">
            {voice.error
              ? voice.error
              : voice.state === 'connecting'
                ? 'Starting microphone…'
                : voice.state === 'finalizing'
                  ? 'Finishing your thought…'
                  : 'Listening · speak naturally'}
          </span>
          {voice.error ? (
            <button type="button" onClick={voice.clearError} className="p-0.5 text-red-300 hover:text-white" aria-label="Dismiss voice error"><X className="h-3.5 w-3.5" /></button>
          ) : (
            <button type="button" onClick={voice.cancel} className="text-[10px] font-bold uppercase tracking-wide text-ink-400 hover:text-white">Cancel</button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => { void (voice.active ? voice.stop() : voice.start()); }}
        disabled={disabled || voice.state === 'connecting' || voice.state === 'finalizing'}
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-xl border transition-all disabled:cursor-wait',
          voice.state === 'listening'
            ? 'border-red-400/60 bg-red-500 text-white shadow-[0_0_0_4px_rgba(239,68,68,0.14)]'
            : voice.error
              ? 'border-red-500/40 bg-red-500/10 text-red-300'
              : 'border-ink-700 bg-ink-950 text-ink-400 hover:border-brand-500/50 hover:bg-brand-500/10 hover:text-brand-300'
        )}
        aria-label={voice.state === 'listening' ? 'Stop voice dictation' : 'Start voice dictation'}
        title={voice.state === 'listening' ? 'Stop dictation' : 'Talk instead of typing'}
      >
        {voice.state === 'listening' ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-5 w-5" />}
      </button>
    </div>
  );
}
