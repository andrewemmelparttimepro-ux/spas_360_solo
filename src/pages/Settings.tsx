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
      <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>

      {/* Profile */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center">
          <User className="w-4 h-4 mr-2" /> Profile
        </h2>
        {profile ? (
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-xs text-slate-400">Name</p><p className="text-sm font-medium">{profile.first_name} {profile.last_name}</p></div>
            <div><p className="text-xs text-slate-400">Email</p><p className="text-sm">{profile.email}</p></div>
            <div><p className="text-xs text-slate-400">Phone</p><p className="text-sm">{profile.phone ?? '—'}</p></div>
            <div>
              <p className="text-xs text-slate-400">Role</p>
              <p className="text-sm flex items-center">
                <Shield className="w-3.5 h-3.5 mr-1 text-cyan-500" />
                {roleLabels[profile.role] ?? profile.role}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Loading...</p>
        )}
      </div>

      {/* Locations */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center">
          <MapPin className="w-4 h-4 mr-2" /> Locations
        </h2>
        <div className="space-y-3">
          {locations.map(loc => (
            <div key={loc.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-slate-900">{loc.name}</p>
                {loc.address && <p className="text-xs text-slate-500">{loc.address}</p>}
              </div>
              {loc.phone && <span className="text-xs text-slate-400">{loc.phone}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Sign Out */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <button
          onClick={signOut}
          className="flex items-center text-red-600 hover:text-red-700 text-sm font-medium"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
