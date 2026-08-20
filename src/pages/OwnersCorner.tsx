import { BarChart3, Building2, Crown, LockKeyhole, Settings, ShieldCheck } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const OWNER_DESTINATIONS = [
  {
    name: 'Reports',
    description: 'Review dealership performance, pipeline, service, and inventory reporting.',
    path: '/reports',
    icon: BarChart3,
  },
  {
    name: 'Citadel',
    description: 'Open the canonical workspace for Ari briefs, proposals, and other deliverables.',
    path: '/citadel',
    icon: Building2,
  },
  {
    name: 'Settings',
    description: 'Manage the organization profile, team, branding, and owner controls.',
    path: '/settings',
    icon: Settings,
  },
] as const;

export default function OwnersCorner() {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner_manager';

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">Owner workspace</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-100">
          <Crown className="h-6 w-6 text-amber-500" />
          Owners Corner
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">A focused starting point for dealership oversight and owner-level administration.</p>
      </header>

      {isOwner ? (
        <>
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p>Owner access is active. Each destination keeps its existing permissions and data controls.</p>
          </div>
          <section aria-label="Owner destinations" className="grid gap-4 md:grid-cols-3">
            {OWNER_DESTINATIONS.map(destination => (
              <NavLink
                key={destination.path}
                to={destination.path}
                className="group rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-sm transition-colors hover:border-amber-500/60"
              >
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
                  <destination.icon className="h-5 w-5" />
                </span>
                <h2 className="text-base font-bold text-ink-100 group-hover:text-amber-600">{destination.name}</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-500">{destination.description}</p>
              </NavLink>
            ))}
          </section>
        </>
      ) : (
        <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-ink-700 bg-ink-900/60 px-6 text-center">
          <LockKeyhole className="mb-3 h-9 w-9 text-ink-500" />
          <h2 className="text-base font-bold text-ink-100">Owner access required</h2>
          <p className="mt-1 max-w-md text-sm text-ink-500">This workspace is available to Owner / Manager accounts. Your normal SPAS 360 destinations remain available from the menu.</p>
          <NavLink to="/dashboard" className="mt-5 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
            Back to Dashboard
          </NavLink>
        </section>
      )}
    </div>
  );
}
