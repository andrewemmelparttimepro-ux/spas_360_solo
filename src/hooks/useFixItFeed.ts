import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile } from '@/types/database';

const UI_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_UI_PREVIEW === '1';

export type FixItStatus = 'open' | 'in_progress' | 'fixed' | 'agent_done' | 'archived';
export type FixItAttachmentPurpose = 'report' | 'comment' | 'validation_proof';

export interface FixItAttachment {
  id: string;
  postId: string;
  commentId: string | null;
  uploadedBy: string | null;
  name: string;
  purpose: FixItAttachmentPurpose;
  type: 'image' | 'pdf' | 'text' | 'audio' | 'video' | 'file';
  mimeType: string;
  size: string;
  storagePath: string | null;
  url: string;
  ts: string;
}

export interface FixItComment {
  id: string;
  postId: string;
  body: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string | null;
  attachments: FixItAttachment[];
}

export interface FixItPost {
  id: string;
  body: string;
  orgId: string;
  createdBy: string;
  claimedBy: string | null;
  agentTestedBy: string | null;
  agentTestedAt: string | null;
  humanReviewedBy: string | null;
  humanReviewedAt: string | null;
  archivedBy: string | null;
  archivedAt: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
  reopenCount: number;
  reopenedFromStatus: string | null;
  status: FixItStatus;
  createdAt: string;
  updatedAt: string;
  attachments: FixItAttachment[];
  comments: FixItComment[];
  validationProof: FixItAttachment | null;
  validationProofs: FixItAttachment[];
}

interface DbFixItPost {
  id: string;
  body: string | null;
  org_id: string;
  created_by: string;
  claimed_by: string | null;
  agent_tested_by: string | null;
  agent_tested_at: string | null;
  human_reviewed_by: string | null;
  human_reviewed_at: string | null;
  archived_by: string | null;
  archived_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  reopen_count: number | null;
  reopened_from_status: string | null;
  status: FixItStatus | null;
  created_at: string;
  updated_at: string;
}

interface DbFixItComment {
  id: string;
  post_id: string;
  body: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

interface DbFixItAttachment {
  id: string;
  post_id: string;
  comment_id: string | null;
  uploaded_by: string | null;
  name: string;
  purpose: FixItAttachmentPurpose | null;
  type: FixItAttachment['type'] | null;
  mime_type: string | null;
  size: string | null;
  storage_path: string | null;
  url: string | null;
  created_at: string;
}

export interface FixItPostStatusPatch {
  status?: FixItStatus;
  claimedBy?: string | null;
  agentTestedBy?: string | null;
  agentTestedAt?: string | null;
  humanReviewedBy?: string | null;
  humanReviewedAt?: string | null;
  archivedBy?: string | null;
  archivedAt?: string | null;
  reopenedBy?: string | null;
  reopenedAt?: string | null;
  reopenCount?: number;
  reopenedFromStatus?: string | null;
}

export interface UseFixItFeedResult {
  posts: FixItPost[];
  activeCount: number;
  profilesById: Record<string, Profile>;
  isLoading: boolean;
  createPost: (input: { body: string; files?: File[] }) => Promise<void>;
  createComment: (input: { postId: string; body: string; files?: File[] }) => Promise<void>;
  updatePostStatus: (postId: string, changes: FixItPostStatusPatch) => Promise<void>;
  uploadValidationProof: (postId: string, file: File) => Promise<void>;
  deleteComment: (comment: FixItComment) => Promise<void>;
  deletePost: (post: FixItPost) => Promise<void>;
  refetch: () => Promise<FixItPost[]>;
}

function formatSize(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function getFileType(mime = ''): FixItAttachment['type'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

function sanitizeName(name: string) {
  return (name || 'upload').replace(/[^\w.!@()+,=\-\s]/g, '_');
}

async function signedUrl(path: string | null) {
  if (!path) return '';
  const { data, error } = await supabase.storage.from('fix-it-files').createSignedUrl(path, 60 * 60);
  if (error) return '';
  return data?.signedUrl ?? '';
}

export function useFixItFeed(enabled = true): UseFixItFeedResult {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<FixItPost[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});
  const [isLoading, setIsLoading] = useState(true);
  const orgId = profile?.org_id ?? null;
  const userId = profile?.id ?? null;
  const canRun = enabled && !UI_PREVIEW && Boolean(orgId && userId);

  const fetchPosts = useCallback(async () => {
    if (!canRun || !orgId) {
      setPosts([]);
      setProfilesById({});
      setIsLoading(false);
      return [];
    }

    setIsLoading(true);
    const { data: postRows, error } = await supabase
      .from('fix_it_posts')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching Fix-It Feed:', error);
      setPosts([]);
      setIsLoading(false);
      return [];
    }

    const rawPosts = (postRows ?? []) as DbFixItPost[];
    const postIds = rawPosts.map(post => post.id);
    const [attachmentRes, commentRes] = postIds.length > 0
      ? await Promise.all([
        supabase.from('fix_it_attachments').select('*').in('post_id', postIds).order('created_at', { ascending: true }),
        supabase.from('fix_it_comments').select('*').in('post_id', postIds).order('created_at', { ascending: true }),
      ])
      : [{ data: [] as DbFixItAttachment[], error: null }, { data: [] as DbFixItComment[], error: null }];

    if (attachmentRes.error) console.error('Error fetching Fix-It attachments:', attachmentRes.error);
    if (commentRes.error) console.error('Error fetching Fix-It comments:', commentRes.error);

    const attachmentRows = ((attachmentRes.data ?? []) as DbFixItAttachment[]);
    const commentRows = ((commentRes.data ?? []) as DbFixItComment[]);
    const attachments = await Promise.all(attachmentRows.map(async file => {
      const url = file.storage_path ? await signedUrl(file.storage_path) : (file.url ?? '');
      return {
        id: file.id,
        postId: file.post_id,
        commentId: file.comment_id,
        uploadedBy: file.uploaded_by,
        name: file.name,
        purpose: file.purpose ?? 'report',
        type: file.type ?? getFileType(file.mime_type ?? ''),
        mimeType: file.mime_type ?? '',
        size: file.size ?? '',
        storagePath: file.storage_path,
        url,
        ts: file.created_at,
      } satisfies FixItAttachment;
    }));

    const attachmentsByPost = attachments.reduce<Record<string, FixItAttachment[]>>((acc, file) => {
      (acc[file.postId] = acc[file.postId] ?? []).push(file);
      return acc;
    }, {});
    const attachmentsByComment = attachments.reduce<Record<string, FixItAttachment[]>>((acc, file) => {
      if (file.commentId) (acc[file.commentId] = acc[file.commentId] ?? []).push(file);
      return acc;
    }, {});
    const commentsByPost = commentRows.reduce<Record<string, FixItComment[]>>((acc, comment) => {
      (acc[comment.post_id] = acc[comment.post_id] ?? []).push({
        id: comment.id,
        postId: comment.post_id,
        body: comment.body ?? '',
        createdBy: comment.created_by,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        attachments: attachmentsByComment[comment.id] ?? [],
      });
      return acc;
    }, {});

    const nextPosts = rawPosts.map(post => {
      const postAttachments = attachmentsByPost[post.id] ?? [];
      const validationProofs = postAttachments
        .filter(file => file.purpose === 'validation_proof')
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
      return {
        id: post.id,
        body: post.body ?? '',
        orgId: post.org_id,
        createdBy: post.created_by,
        claimedBy: post.claimed_by,
        agentTestedBy: post.agent_tested_by,
        agentTestedAt: post.agent_tested_at,
        humanReviewedBy: post.human_reviewed_by,
        humanReviewedAt: post.human_reviewed_at,
        archivedBy: post.archived_by,
        archivedAt: post.archived_at,
        reopenedBy: post.reopened_by,
        reopenedAt: post.reopened_at,
        reopenCount: post.reopen_count ?? 0,
        reopenedFromStatus: post.reopened_from_status,
        status: post.status ?? 'open',
        createdAt: post.created_at,
        updatedAt: post.updated_at,
        attachments: postAttachments.filter(file => file.purpose !== 'validation_proof' && !file.commentId),
        comments: commentsByPost[post.id] ?? [],
        validationProof: validationProofs[0] ?? null,
        validationProofs,
      } satisfies FixItPost;
    });

    const profileIds = new Set<string>();
    nextPosts.forEach(post => {
      [post.createdBy, post.claimedBy, post.agentTestedBy, post.humanReviewedBy, post.archivedBy, post.reopenedBy]
        .filter(Boolean)
        .forEach(id => profileIds.add(id as string));
      post.comments.forEach(comment => profileIds.add(comment.createdBy));
      [...post.attachments, ...post.validationProofs].forEach(file => {
        if (file.uploadedBy) profileIds.add(file.uploadedBy);
      });
    });

    if (profileIds.size > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', Array.from(profileIds));
      if (profileError) {
        console.error('Error fetching Fix-It profile map:', profileError);
      }
      setProfilesById(((profileRows ?? []) as Profile[]).reduce<Record<string, Profile>>((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {}));
    } else {
      setProfilesById({});
    }

    setPosts(nextPosts);
    setIsLoading(false);
    return nextPosts;
  }, [canRun, orgId]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  useEffect(() => {
    if (!canRun) return undefined;
    const suffix = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`fix-it-feed-${suffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fix_it_posts' }, () => fetchPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fix_it_comments' }, () => fetchPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fix_it_attachments' }, () => fetchPosts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [canRun, fetchPosts]);

  const uploadAttachment = useCallback(async (
    postId: string,
    file: File,
    purpose: FixItAttachmentPurpose = 'report',
    commentId: string | null = null
  ) => {
    if (!orgId || !userId) throw new Error('Sign in before uploading files.');
    const path = commentId
      ? `${postId}/comments/${commentId}/${Date.now()}_${sanitizeName(file.name)}`
      : `${postId}/${Date.now()}_${sanitizeName(file.name)}`;

    const { error: uploadError } = await supabase.storage.from('fix-it-files').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { error } = await supabase.from('fix_it_attachments').insert({
      post_id: postId,
      comment_id: commentId,
      org_id: orgId,
      uploaded_by: userId,
      name: file.name,
      purpose,
      type: getFileType(file.type),
      size: formatSize(file.size),
      mime_type: file.type || 'application/octet-stream',
      storage_path: path,
      url: '',
    });
    if (error) {
      await supabase.storage.from('fix-it-files').remove([path]);
      throw error;
    }
  }, [orgId, userId]);

  const createPost = useCallback(async ({ body, files = [] }: { body: string; files?: File[] }) => {
    if (!orgId || !userId) throw new Error('Sign in before posting.');
    const cleanBody = body.trim();
    if (!cleanBody && files.length === 0) throw new Error('Add a note, screenshot, or file before posting.');

    const { data, error } = await supabase.from('fix_it_posts').insert({
      org_id: orgId,
      body: cleanBody,
      created_by: userId,
      status: 'open',
    }).select('id').single();
    if (error) throw error;

    const postId = (data as { id: string }).id;
    try {
      for (const file of files) await uploadAttachment(postId, file, 'report');
    } catch (uploadError) {
      await supabase.from('fix_it_posts').delete().eq('id', postId);
      throw uploadError;
    }
    await fetchPosts();
  }, [fetchPosts, orgId, uploadAttachment, userId]);

  const createComment = useCallback(async ({ postId, body, files = [] }: { postId: string; body: string; files?: File[] }) => {
    if (!orgId || !userId) throw new Error('Sign in before replying.');
    const cleanBody = body.trim();
    if (!postId) throw new Error('Fix-It item is required before replying.');
    if (!cleanBody && files.length === 0) throw new Error('Add a reply or file before posting.');

    const { data, error } = await supabase.from('fix_it_comments').insert({
      org_id: orgId,
      post_id: postId,
      body: cleanBody,
      created_by: userId,
    }).select('id').single();
    if (error) throw error;

    const commentId = (data as { id: string }).id;
    try {
      for (const file of files) await uploadAttachment(postId, file, 'comment', commentId);
    } catch (uploadError) {
      await supabase.from('fix_it_comments').delete().eq('id', commentId);
      throw uploadError;
    }
    await fetchPosts();
  }, [fetchPosts, orgId, uploadAttachment, userId]);

  const updatePostStatus = useCallback(async (postId: string, changes: FixItPostStatusPatch) => {
    const patch: Record<string, string | number | null> = { updated_at: new Date().toISOString() };
    if (changes.status !== undefined) patch.status = changes.status;
    if (changes.claimedBy !== undefined) patch.claimed_by = changes.claimedBy;
    if (changes.agentTestedBy !== undefined) patch.agent_tested_by = changes.agentTestedBy;
    if (changes.agentTestedAt !== undefined) patch.agent_tested_at = changes.agentTestedAt;
    if (changes.humanReviewedBy !== undefined) patch.human_reviewed_by = changes.humanReviewedBy;
    if (changes.humanReviewedAt !== undefined) patch.human_reviewed_at = changes.humanReviewedAt;
    if (changes.archivedBy !== undefined) patch.archived_by = changes.archivedBy;
    if (changes.archivedAt !== undefined) patch.archived_at = changes.archivedAt;
    if (changes.reopenedBy !== undefined) patch.reopened_by = changes.reopenedBy;
    if (changes.reopenedAt !== undefined) patch.reopened_at = changes.reopenedAt;
    if (changes.reopenCount !== undefined) patch.reopen_count = changes.reopenCount;
    if (changes.reopenedFromStatus !== undefined) patch.reopened_from_status = changes.reopenedFromStatus;

    const { error } = await supabase.from('fix_it_posts').update(patch).eq('id', postId);
    if (error) throw error;
    await fetchPosts();
  }, [fetchPosts]);

  const uploadValidationProof = useCallback(async (postId: string, file: File) => {
    if (!file.type.startsWith('image/')) throw new Error('Validation proof must be a screenshot or image.');
    await uploadAttachment(postId, file, 'validation_proof');
    await fetchPosts();
  }, [fetchPosts, uploadAttachment]);

  const deleteComment = useCallback(async (comment: FixItComment) => {
    const paths = comment.attachments.map(file => file.storagePath).filter(Boolean) as string[];
    if (paths.length > 0) await supabase.storage.from('fix-it-files').remove(paths);
    const { error } = await supabase.from('fix_it_comments').delete().eq('id', comment.id);
    if (error) throw error;
    await fetchPosts();
  }, [fetchPosts]);

  const deletePost = useCallback(async (post: FixItPost) => {
    const paths = [
      ...post.attachments,
      ...post.validationProofs,
      ...post.comments.flatMap(comment => comment.attachments),
    ].map(file => file.storagePath).filter(Boolean) as string[];
    if (paths.length > 0) await supabase.storage.from('fix-it-files').remove(paths);
    const { error } = await supabase.from('fix_it_posts').delete().eq('id', post.id);
    if (error) throw error;
    await fetchPosts();
  }, [fetchPosts]);

  const activeCount = useMemo(() => posts.filter(post => post.status !== 'archived').length, [posts]);

  return {
    posts,
    activeCount,
    profilesById,
    isLoading,
    createPost,
    createComment,
    updatePostStatus,
    uploadValidationProof,
    deleteComment,
    deletePost,
    refetch: fetchPosts,
  };
}
