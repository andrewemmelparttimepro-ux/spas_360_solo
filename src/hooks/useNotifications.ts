import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  link: string | null;
  created_at: string;
}

/** Insert a notification for a user. RLS allows insert-for-anyone (notif_insert WITH CHECK TRUE). */
export async function createNotification(
  userId: string,
  n: { type: string; title: string; body?: string; link?: string }
) {
  if (!userId) return;
  await supabase.from('notifications').insert({
    user_id: userId,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    link: n.link ?? null,
  });
}

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) { setItems([]); setIsLoading(false); return; }
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, read, link, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setItems((data as AppNotification[]) ?? []);
    setIsLoading(false);
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Realtime: refetch whenever this user's notifications change
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  const unreadCount = items.filter(n => !n.read).length;

  const markRead = useCallback(async (id: string) => {
    setItems(prev => prev.map(n => n.id === id ? { ...n, read: true } : n)); // optimistic
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
  }, [user]);

  return { items, unreadCount, isLoading, markRead, markAllRead, refresh: fetchNotifications };
}
