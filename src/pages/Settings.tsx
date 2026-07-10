import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import { LogOut, User, MapPin, Shield, Users, MailPlus, X } from 'lucide-react';
import type { Profile } from '@/types/database';

interface AppInvite {
  id: string;
  email: string;
  role: string;
  claimed_at: string | null;
  created_at: string;
}

const roleLabels: Record<string, string> = {
  owner_manager: 'Owner / Manager',
  service_manager: 'Service Manager',
  salesperson: 'Salesperson',
  technician: 'Technician',
};
const ROLES = ['owner_manager', 'service_manager', 'salesperson', 'technician'] as const;

/** Team & permissions — owner/managers invite by email (signups are invite-only)
 *  and grant roles here. */
function TeamPanel() {
  const { profile, locations } = useAuth();
  const { toast } = useToast();
  const [team, setTeam] = useState<Profile[]>([]);
  const [invites, setInvites] = useState<AppInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('salesperson');
  const [inviting, setInviting] = useState(false);

  const fetchTeam = useCallback(async () => {
    if (!profile) return;
    const [profRes, invRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('org_id', profile.org_id).order('created_at'),
      supabase.from('app_invites').select('id, email, role, claimed_at, created_at').is('claimed_at', null).order('created_at', { ascending: false }),
    ]);
    setTeam((profRes.data as Profile[]) ?? []);
    setInvites((invRes.data as AppInvite[]) ?? []);
  }, [profile]);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!profile || !email || inviting) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('That email doesn’t look right', 'error'); return; }
    setInviting(true);
    const { error } = await supabase.from('app_invites').insert({
      org_id: profile.org_id,
      email,
      role: inviteRole,
      invited_by: profile.id,
    });
    setInviting(false);
    if (error) {
      toast(/duplicate|unique/i.test(error.message) ? 'That email is already invited' : `Couldn't invite: ${error.message}`, 'error');
      return;
    }
    toast(`${email} can now sign up — send them to the app`, 'success');
    setInviteEmail('');
    fetchTeam();
  };

  const revokeInvite = async (inv: AppInvite) => {
    const { error } = await supabase.from('app_invites').delete().eq('id', inv.id);
    if (error) { toast(`Couldn't revoke: ${error.message}`, 'error'); return; }
    toast(`Invite for ${inv.email} revoked`, 'success');
    fetchTeam();
  };

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
        Sign-ups are invite-only. Invite an email below, pick their role, then have them create their account at the login page.
      </p>

      {/* Invite a teammate — the only door into the app */}
      <div className="flex flex-wrap items-center gap-2 p-3 mb-3 bg-ink-950 rounded-lg border border-ink-800">
        <MailPlus className="w-4 h-4 text-brand-400 shrink-0" />
        <input
          type="email"
          value={inviteEmail}
          onChange={e => setInviteEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendInvite()}
          placeholder="teammate@email.com"
          className="flex-1 min-w-[180px] px-3 py-1.5 bg-ink-900 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500"
        />
        <select
          value={inviteRole}
          onChange={e => setInviteRole(e.target.value)}
          className="bg-ink-900 border border-ink-700 text-xs font-semibold text-brand-300 rounded-lg px-2 py-1.5 outline-none focus:border-brand-500"
        >
          {ROLES.map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
        </select>
        <button
          onClick={sendInvite}
          disabled={!inviteEmail.trim() || inviting}
          className="px-3.5 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {inviting ? 'Inviting…' : 'Invite'}
        </button>
      </div>

      {invites.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider mb-1.5">Waiting to sign up</p>
          <div className="space-y-1.5">
            {invites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 px-3 py-2 bg-ink-950 rounded-lg border border-ink-800 border-dashed">
                <span className="text-sm text-ink-300 truncate flex-1">{inv.email}</span>
                <span className="text-xs text-ink-500">{roleLabels[inv.role] ?? inv.role}</span>
                <button onClick={() => revokeInvite(inv)} className="p-1 text-ink-500 hover:text-red-400 transition-colors" title="Revoke invite" aria-label={`Revoke invite for ${inv.email}`}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
