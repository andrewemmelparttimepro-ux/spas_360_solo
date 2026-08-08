import { useState, useEffect, useCallback, useRef } from 'react';
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
  // This is the single funnel for every mention/deal-won/SMS ping — a dropped
  // insert must at least leave a trace
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    link: n.link ?? null,
  });
  if (error) console.error('Error creating notification:', error);
}

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const itemsRef = useRef<AppNotification[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

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
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
    if (error) {
      console.error('Error marking notification read:', error);
      setItems(prev => prev.map(n => n.id === id ? { ...n, read: false } : n)); // revert — bell must match the DB
    }
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const before = itemsRef.current;
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    if (error) {
      console.error('Error marking all notifications read:', error);
      setItems(before); // revert — bell must match the DB
    }
  }, [user]);

  return { items, unreadCount, isLoading, markRead, markAllRead, refresh: fetchNotifications };
}
