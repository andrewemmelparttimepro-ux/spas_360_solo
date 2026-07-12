import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError('Use at least 10 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) setError(updateError.message);
    else setComplete(true);
  }

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4" style={{ background: 'radial-gradient(120% 90% at 50% 0%, #0b2036 0%, #06080d 62%)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo-mark.png" alt="SPAS 360" className="h-[72px] mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-extrabold tracking-[0.12em] text-white">SPAS <span className="text-brand-400">360</span></h1>
        </div>
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl shadow-black/40">
          {complete ? (
            <div className="text-center">
              <div className="text-emerald-300 text-lg font-semibold mb-2">Password updated</div>
              <p className="text-sm text-ink-400 mb-6">Your new password works in both SPAS 360 and Agent OS.</p>
              <a href="/" className="inline-flex px-5 py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg">Return to SPAS 360</a>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">Choose a new password</h2>
              <p className="text-sm text-ink-400 mb-6">This updates the same secure login used by both apps.</p>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink-300 mb-1">New password</label>
                  <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" required minLength={10} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-300 mb-1">Confirm password</label>
                  <input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" required minLength={10} />
                </div>
                {error && <div className="bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-3 rounded-lg" role="alert">{error}</div>}
                <button type="submit" disabled={loading} className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-lg">
                  {loading ? 'Updating…' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
