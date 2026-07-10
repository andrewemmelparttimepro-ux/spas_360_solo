import { useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isSignUp) {
      const { error: err } = await signUp(email, password, { first_name: firstName, last_name: lastName });
      // Signups are invite-only (DB-enforced) — the trigger's rejection surfaces
      // as a generic "database error"; translate it to the real story.
      if (err) {
        setError(/invite_only|database error saving new user/i.test(err)
          ? 'Sign-ups are invite-only. Ask your manager to invite this email address, then try again.'
          : err);
      }
    } else {
      const { error: err } = await signIn(email, password);
      if (err) setError(err);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center p-4" style={{ background: 'radial-gradient(120% 90% at 50% 0%, #0b2036 0%, #06080d 62%)' }}>
      <div className="w-full max-w-md">
        {/* Brand lockup — transparent mark + crisp HTML wordmark */}
        <div className="text-center mb-9">
          <img src="/logo-mark.png" alt="" aria-hidden="true" className="h-[76px] mx-auto mb-4 object-contain drop-shadow-[0_0_24px_rgba(52,160,255,0.28)]" />
          <h1 className="text-[26px] font-extrabold tracking-[0.14em] text-white leading-none">
            SPAS <span className="text-brand-400">360</span>
          </h1>
          <p className="text-[11px] font-medium tracking-[0.32em] uppercase text-ink-500 mt-2.5">Dealership Command Center</p>
        </div>

        {/* Form Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl shadow-black/40">
          <h2 className="text-xl font-semibold text-white mb-6">
            {isSignUp ? 'Create your account' : 'Sign in to your account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink-300 mb-1">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-ink-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-ink-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ink-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="matt@spas360.com"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-ink-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-ink-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-all"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors shadow-lg shadow-brand-500/25"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  {isSignUp ? 'Creating Account...' : 'Signing In...'}
                </span>
              ) : (
                isSignUp ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
              className="text-sm text-ink-500 hover:text-brand-400 transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-ink-500 mt-6">
          Minot & Bismarck, North Dakota
        </p>
        <p className="text-center text-[11px] text-ink-500 mt-1.5">
          Powered by <span className="text-ink-300 font-medium">NDAI</span>
        </p>
      </div>
    </div>
  );
}
