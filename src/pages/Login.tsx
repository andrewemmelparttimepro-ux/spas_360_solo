import { useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Droplets } from 'lucide-react';

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
      if (err) setError(err);
    } else {
      const { error: err } = await signIn(email, password);
      if (err) setError(err);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-cyan-500/10 rounded-2xl mb-4">
            <Droplets className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">SPAS 360</h1>
          <p className="text-slate-400 mt-1">Unified Spa & Hot Tub Business Platform</p>
        </div>

        {/* Form Card */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6">
            {isSignUp ? 'Create your account' : 'Sign in to your account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="matt@spas360.com"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
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
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors shadow-lg shadow-cyan-500/25"
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
              className="text-sm text-slate-400 hover:text-cyan-400 transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Minot & Bismarck, North Dakota
        </p>
      </div>
    </div>
  );
}
