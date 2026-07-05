import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User, MapPin, Shield } from 'lucide-react';

export default function Settings() {
  const { profile, locations, signOut } = useAuth();

  const roleLabels: Record<string, string> = {
    owner_manager: 'Owner / Manager',
    service_manager: 'Service Manager',
    salesperson: 'Salesperson',
    technician: 'Technician',
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-ink-100 tracking-tight">Settings</h1>

      {/* Profile */}
      <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider mb-4 flex items-center">
          <User className="w-4 h-4 mr-2" /> Profile
        </h2>
        {profile ? (
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-xs text-ink-500">Name</p><p className="text-sm font-medium">{profile.first_name} {profile.last_name}</p></div>
            <div><p className="text-xs text-ink-500">Email</p><p className="text-sm">{profile.email}</p></div>
            <div><p className="text-xs text-ink-500">Phone</p><p className="text-sm">{profile.phone ?? '—'}</p></div>
            <div>
              <p className="text-xs text-ink-500">Role</p>
              <p className="text-sm flex items-center">
                <Shield className="w-3.5 h-3.5 mr-1 text-brand-400" />
                {roleLabels[profile.role] ?? profile.role}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-500">Loading...</p>
        )}
      </div>

      {/* Locations */}
      <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider mb-4 flex items-center">
          <MapPin className="w-4 h-4 mr-2" /> Locations
        </h2>
        <div className="space-y-3">
          {locations.map(loc => (
            <div key={loc.id} className="flex items-center justify-between p-3 bg-ink-950 rounded-lg">
              <div>
                <p className="text-sm font-medium text-ink-100">{loc.name}</p>
                {loc.address && <p className="text-xs text-ink-400">{loc.address}</p>}
              </div>
              {loc.phone && <span className="text-xs text-ink-500">{loc.phone}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Sign Out */}
      <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
        <button
          onClick={signOut}
          className="flex items-center text-red-400 hover:text-red-300 text-sm font-medium"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
