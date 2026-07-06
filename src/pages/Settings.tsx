import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import { LogOut, User, MapPin, Shield, Users } from 'lucide-react';
import type { Profile } from '@/types/database';

const roleLabels: Record<string, string> = {
  owner_manager: 'Owner / Manager',
  service_manager: 'Service Manager',
  salesperson: 'Salesperson',
  technician: 'Technician',
};
const ROLES = ['owner_manager', 'service_manager', 'salesperson', 'technician'] as const;

/** Team & permissions — owner/managers grant roles here (new signups start as Salesperson). */
function TeamPanel() {
  const { profile, locations } = useAuth();
  const { toast } = useToast();
  const [team, setTeam] = useState<Profile[]>([]);

  const fetchTeam = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at');
    setTeam((data as Profile[]) ?? []);
  }, [profile]);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  const setRole = async (member: Profile, role: string) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', member.id);
    if (error) { toast(`Couldn't update role: ${error.message}`, 'error'); return; }
    toast(`${member.first_name} is now ${roleLabels[role]}`, 'success');
    fetchTeam();
  };

  const setHomeStore = async (member: Profile, locationId: string) => {
    const { error } = await supabase.from('profiles').update({ location_id: locationId || null }).eq('id', member.id);
    if (error) { toast(`Couldn't update store: ${error.message}`, 'error'); return; }
    toast(`${member.first_name}'s home store updated`, 'success');
    fetchTeam();
  };

  if (profile?.role !== 'owner_manager') return null;

  return (
    <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
      <h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider mb-1 flex items-center">
        <Users className="w-4 h-4 mr-2" /> Team & Permissions
      </h2>
      <p className="text-xs text-ink-500 mb-4">
        New signups start as Salesperson — promote them here. Owner / Manager sees and controls everything.
      </p>
      <div className="space-y-2">
        {team.map(member => {
          const isSelf = member.id === profile.id;
          return (
            <div key={member.id} className="flex flex-wrap items-center gap-3 p-3 bg-ink-950 rounded-lg border border-ink-800">
              <span className="w-8 h-8 rounded-full bg-brand-500/15 text-brand-300 text-xs font-bold flex items-center justify-center shrink-0">
                {(member.first_name?.[0] ?? '') + (member.last_name?.[0] ?? '')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-100 truncate">
                  {member.first_name} {member.last_name}{isSelf && <span className="text-ink-500 font-normal"> (you)</span>}
                </p>
                <p className="text-xs text-ink-500 truncate">{member.email}</p>
              </div>
              <select
                value={member.location_id ?? ''}
                onChange={e => setHomeStore(member, e.target.value)}
                className="bg-ink-900 border border-ink-700 text-xs text-ink-300 rounded-lg px-2 py-1.5 outline-none focus:border-brand-500"
                title="Home store"
              >
                <option value="">No home store</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <select
                value={member.role}
                onChange={e => setRole(member, e.target.value)}
                disabled={isSelf}
                className="bg-ink-900 border border-ink-700 text-xs font-semibold text-brand-300 rounded-lg px-2 py-1.5 outline-none focus:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isSelf ? "You can't change your own role" : 'Role'}
              >
                {ROLES.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Settings() {
  const { profile, locations, signOut } = useAuth();

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

      {/* Team & permissions — owner/manager only */}
      <TeamPanel />

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
