import { useCallback, useEffect, useRef, useState } from 'react';
import { CommitStrategy, useScribe } from '@elevenlabs/react';
import { supabase } from '@/lib/supabase';

export type VoiceDictationState = 'idle' | 'connecting' | 'listening' | 'finalizing' | 'error';

const KEYTERMS = [
  'SPAS 360', 'Ari', 'Magic City', 'Sundance', 'Hot Spring', 'Master Spas',
  'Finnleo', 'Chilly Goat', 'swim spa', 'cold plunge', 'Bismarck', 'Minot',
];

function joinTranscript(base: string, committed: string[], partial = ''): string {
  const dictated = [...committed, partial].map(part => part.trim()).filter(Boolean).join(' ');
  if (!base.trim()) return dictated;
  if (!dictated) return base;
  const spacer = /\s$/.test(base) ? '' : ' ';
  return `${base}${spacer}${dictated}`;
}

function friendlyVoiceError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (/permission|notallowed|denied/i.test(raw)) return 'Microphone access is off. Allow it in your browser settings, then try again.';
  if (/notfound|device|microphone/i.test(raw)) return 'No microphone is available on this device.';
  if (/quota|resource exhausted/i.test(raw)) return 'Voice is at capacity right now. Try again in a moment.';
  return 'Voice did not start. Check your connection and try again.';
}

interface Options {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function useVoiceDictation({ value, onValueChange, disabled = false }: Options) {
  const [state, setState] = useState<VoiceDictationState>('idle');
  const [error, setError] = useState<string | null>(null);
  const snapshotRef = useRef('');
  const baseRef = useRef('');
  const committedRef = useRef<string[]>([]);
  const partialRef = useRef('');
  const cancelledRef = useRef(false);
  const onValueChangeRef = useRef(onValueChange);
  const stateRef = useRef<VoiceDictationState>('idle');

  useEffect(() => { onValueChangeRef.current = onValueChange; }, [onValueChange]);
  useEffect(() => { stateRef.current = state; }, [state]);

  const moveState = useCallback((next: VoiceDictationState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const renderTranscript = useCallback((partial = '') => {
    onValueChangeRef.current(joinTranscript(baseRef.current, committedRef.current, partial));
  }, []);

  const scribe = useScribe({
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: 1.1,
    vadThreshold: 0.4,
    minSpeechDurationMs: 100,
    minSilenceDurationMs: 120,
    languageCode: 'en',
    keyterms: KEYTERMS,
    noVerbatim: true,
    onConnect: () => moveState('listening'),
    onPartialTranscript: data => {
      partialRef.current = data.text;
      renderTranscript(data.text);
    },
    onCommittedTranscript: data => {
      if (cancelledRef.current || !data.text.trim()) return;
      committedRef.current.push(data.text.trim());
      partialRef.current = '';
      renderTranscript();
    },
    onError: event => {
      if (cancelledRef.current || stateRef.current === 'finalizing') return;
      setError(friendlyVoiceError(event));
      moveState('error');
    },
    onDisconnect: () => {
      if (!cancelledRef.current && stateRef.current !== 'error') moveState('idle');
    },
  });

  const start = useCallback(async () => {
    if (disabled || stateRef.current === 'connecting' || stateRef.current === 'listening') return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Voice dictation is not supported in this browser.');
      moveState('error');
      return;
    }

    snapshotRef.current = value;
    baseRef.current = value;
    committedRef.current = [];
    partialRef.current = '';
    cancelledRef.current = false;
    setError(null);
    moveState('connecting');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your session expired. Sign in again.');
      const response = await fetch('/api/voice/token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = (await response.json().catch(() => ({}))) as { token?: string; error?: string };
      if (!response.ok || !body.token) throw new Error(body.error || 'Voice token unavailable');
      await scribe.connect({
        token: body.token,
        microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (event) {
      setError(friendlyVoiceError(event));
      moveState('error');
    }
  }, [disabled, scribe, value]);

  const stop = useCallback(async () => {
    if (!scribe.isConnected) {
      moveState('idle');
      return;
    }
    moveState('finalizing');
    scribe.commit();
    await new Promise(resolve => window.setTimeout(resolve, 550));
    scribe.disconnect();
    const raw = [...committedRef.current, partialRef.current].map(part => part.trim()).filter(Boolean).join(' ');
    if (raw) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch('/api/voice/polish', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ text: raw, context: 'SPAS 360 business composer' }),
        });
        const body = (await response.json().catch(() => ({}))) as { text?: string };
        if (response.ok && body.text?.trim()) onValueChangeRef.current(joinTranscript(baseRef.current, [], body.text));
      } catch { /* Raw transcript remains editable when polish is unavailable. */ }
    }
    moveState('idle');
  }, [moveState, scribe]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    scribe.disconnect();
    committedRef.current = [];
    partialRef.current = '';
    onValueChangeRef.current(snapshotRef.current);
    setError(null);
    moveState('idle');
  }, [moveState, scribe]);

  const clearError = useCallback(() => {
    setError(null);
    moveState('idle');
  }, [moveState]);

  return {
    state,
    error,
    active: state === 'connecting' || state === 'listening' || state === 'finalizing',
    start,
    stop,
    cancel,
    clearError,
  };
}
