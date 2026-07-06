import {
  Archive,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  File,
  FileText,
  Image,
  Loader2,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type ElementType,
  type MouseEvent,
} from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { Profile } from '@/types/database';
import type { FixItAttachment, FixItComment, FixItPost, UseFixItFeedResult } from '@/hooks/useFixItFeed';

const FILE_ACCEPT = [
  'image/*',
  'audio/*',
  'video/*',
  '.pdf',
  '.txt',
  '.md',
  '.csv',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.heic',
  '.heif',
].join(',');

const statusMeta: Record<FixItPost['status'], { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
  in_progress: { label: 'In progress', className: 'bg-brand-500/15 text-brand-300 border-brand-500/25' },
  fixed: { label: 'Fixed', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  agent_done: { label: 'Validation complete', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
  archived: { label: 'Archived', className: 'bg-ink-800 text-ink-300 border-ink-700' },
};

type FeedView = 'active' | 'archive';
type PreviewFile = FixItAttachment | { name: string; type: string; mimeType: string; file: File; url?: string };

function isFixItAgentUser(user?: Partial<Profile> | null) {
  const identity = `${user?.email ?? ''} ${user?.first_name ?? ''} ${user?.last_name ?? ''}`.toLowerCase();
  return identity.includes('andrew@ndai.pro')
    || identity.includes('andrewemmel')
    || identity.includes('andrew emmel');
}

function personName(user?: Partial<Profile> | null, fallback = 'Unknown') {
  if (!user) return fallback;
  if (isFixItAgentUser(user)) return 'Agent';
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || fallback;
}

function initials(user?: Partial<Profile> | null) {
  if (isFixItAgentUser(user)) return 'AG';
  const first = user?.first_name?.[0] ?? '';
  const last = user?.last_name?.[0] ?? '';
  return `${first}${last}` || '??';
}

function timeAgo(input?: string | null) {
  if (!input) return '';
  const diff = Date.now() - new Date(input).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function hasDraggedFiles(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types || []).includes('Files');
}

function clipboardFiles(data: DataTransfer | null) {
  return Array.from(data?.files ?? []).filter(file => file.name);
}

function Avatar({ user, size = 'md' }: { user?: Partial<Profile> | null; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'rounded-full bg-brand-500/15 text-brand-300 font-bold flex items-center justify-center shrink-0 border border-brand-500/20',
        isFixItAgentUser(user) && 'bg-ink-950 text-ink-100 border-brand-500/40',
        size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-[11px]'
      )}
    >
      {initials(user)}
    </span>
  );
}

function FilePreviewModal({ file, onClose }: { file: PreviewFile | null; onClose: () => void }) {
  const [objectUrl, setObjectUrl] = useState('');
  const mimeType = file?.mimeType || ('mimeType' in (file ?? {}) ? file?.mimeType : '') || '';
  const url = objectUrl || file?.url || '';
  const isImage = mimeType.startsWith('image/') || file?.type === 'image';

  useEffect(() => {
    if (!file || !('file' in file)) return undefined;
    const nextUrl = URL.createObjectURL(file.file);
    setObjectUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="max-w-3xl w-full max-h-[84vh] bg-ink-900 border border-ink-700 rounded-lg overflow-hidden shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="h-12 px-4 border-b border-ink-700 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-100 truncate pr-4">{file.name}</span>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-ink-800 text-ink-400" aria-label="Close preview">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 max-h-[calc(84vh-3rem)] overflow-auto">
          {isImage && url ? (
            <img src={url} alt={file.name} className="max-w-full mx-auto rounded border border-ink-800" />
          ) : url ? (
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-sm font-semibold text-white">
              <File className="w-4 h-4" /> Open file
            </a>
          ) : (
            <p className="text-sm text-ink-400">Preview is not available for this file.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ValidationProofModal({
  post,
  currentUser,
  profilesById,
  canManage,
  onUploadProof,
  onClose,
}: {
  post: FixItPost | null;
  currentUser: Profile;
  profilesById: Record<string, Profile>;
  canManage: boolean;
  onUploadProof: (postId: string, file: File) => Promise<void>;
  onClose: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  if (!post) return null;
  const proof = post.validationProof;
  const proofUser = proof?.uploadedBy ? profilesById[proof.uploadedBy] : null;

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await onUploadProof(post.id, file);
      toast('Validation proof saved');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save validation proof', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="max-w-3xl w-full max-h-[84vh] bg-ink-900 border border-ink-700 rounded-lg overflow-hidden shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="h-12 px-4 border-b border-ink-700 flex items-center gap-3">
          <button onClick={onClose} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-400 hover:text-ink-100">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Camera className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-semibold text-ink-100">Validation proof</span>
          </div>
        </div>
        <div className="p-4 space-y-4 max-h-[calc(84vh-3rem)] overflow-auto">
          <div className={cn('inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold', proof ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25' : 'bg-amber-500/10 text-amber-300 border-amber-500/25')}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            {proof ? `Proof captured by ${personName(proofUser, 'Agent')} ${timeAgo(proof.ts)}` : 'Proof screenshot missing'}
          </div>
          {proof?.url ? (
            <img src={proof.url} alt={proof.name || 'Validation proof'} className="max-w-full rounded border border-ink-800" />
          ) : (
            <div className="border border-dashed border-ink-700 rounded-lg p-8 text-center text-ink-400">
              <Camera className="w-8 h-8 mx-auto mb-3 text-ink-500" />
              <p className="text-sm font-semibold text-ink-300">No proof attached yet</p>
            </div>
          )}
          {canManage && (
            <div className="flex justify-end gap-2">
              <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFile} />
              <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ink-800 hover:bg-ink-700 disabled:opacity-60 text-xs font-semibold text-ink-100">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {proof ? 'Replace proof' : 'Add proof'}
              </button>
              <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-xs font-semibold text-white">
                Done
              </button>
            </div>
          )}
          {!canManage && currentUser && (
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-xs font-semibold text-white">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedComposer({
  onSubmit,
  compact = false,
}: {
  onSubmit: (body: string, files: File[]) => Promise<void>;
  compact?: boolean;
}) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const addFiles = (incoming: FileList | File[]) => {
    const nextFiles = Array.from(incoming || []).filter(file => file.name);
    if (nextFiles.length === 0) return;
    setFiles(prev => {
      const seen = new Set(prev.map(file => `${file.name}-${file.size}-${file.lastModified}`));
      return [...prev, ...nextFiles.filter(file => !seen.has(`${file.name}-${file.size}-${file.lastModified}`))];
    });
  };

  const submit = async () => {
    if (!body.trim() && files.length === 0) {
      toast(compact ? 'Add a reply or file before posting.' : 'Add a note, screenshot, or file before posting.', 'error');
      return;
    }
    setPosting(true);
    try {
      await onSubmit(body, files);
      setBody('');
      setFiles([]);
      toast(compact ? 'Reply added' : 'Posted to Fix-It Feed');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not post to Fix-It Feed', 'error');
    } finally {
      setPosting(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    setDragOver(false);
    addFiles(event.dataTransfer.files);
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = clipboardFiles(event.clipboardData);
    if (pasted.length === 0) return;
    event.preventDefault();
    addFiles(pasted);
  };

  return (
    <div
      className={cn('border border-ink-700 bg-ink-950/60 rounded-lg p-2.5 space-y-2 transition-colors', dragOver && 'border-brand-500 bg-brand-500/10')}
      onDragEnter={event => { if (hasDraggedFiles(event)) setDragOver(true); }}
      onDragOver={event => { if (hasDraggedFiles(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <textarea
        value={body}
        onChange={event => setBody(event.target.value)}
        onPaste={onPaste}
        rows={compact ? 2 : 3}
        placeholder={compact ? 'Reply...' : 'Flag something to fix or clarify...'}
        className="w-full resize-none bg-transparent text-[13px] text-ink-100 placeholder-ink-500 outline-none"
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((file, index) => (
            <button
              key={`${file.name}-${file.size}-${index}`}
              type="button"
              onClick={() => setFiles(prev => prev.filter((_, i) => i !== index))}
              className="inline-flex items-center gap-1 max-w-full px-2 py-1 rounded bg-ink-800 text-[11px] text-ink-300 hover:text-red-300"
              title="Remove file"
            >
              <Paperclip className="w-3 h-3 shrink-0" />
              <span className="truncate">{file.name}</span>
              <X className="w-3 h-3 shrink-0" />
            </button>
          ))}
        </div>
      )}
      <input ref={inputRef} type="file" multiple hidden accept={FILE_ACCEPT} onChange={event => addFiles(event.target.files ?? [])} />
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-ink-800 hover:bg-ink-700 text-[12px] font-semibold text-ink-300">
          <Upload className="w-3.5 h-3.5" /> Files
        </button>
        <button type="button" onClick={submit} disabled={posting} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-[12px] font-semibold text-white">
          {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {compact ? 'Reply' : 'Post'}
        </button>
      </div>
    </div>
  );
}

function AttachmentButton({ file, onPreview }: { file: FixItAttachment; onPreview: (file: FixItAttachment) => void }) {
  const icons: Record<string, ElementType> = { image: Image, pdf: FileText, text: FileText, audio: File, video: File, file: File };
  const Icon = icons[file.type] ?? File;
  return (
    <button
      type="button"
      onClick={() => onPreview(file)}
      className="inline-flex max-w-full items-center gap-1.5 px-2 py-1.5 rounded-lg bg-ink-950 border border-ink-700 hover:border-brand-500/40 text-[11px] text-ink-300"
    >
      <Icon className="w-3.5 h-3.5 text-brand-400 shrink-0" />
      <span className="truncate">{file.name}</span>
      {file.size && <span className="text-ink-500 shrink-0">{file.size}</span>}
    </button>
  );
}

export default function FixItFeed({ feed }: { feed: UseFixItFeedResult }) {
  const [view, setView] = useState<FeedView>('active');
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [validationPostId, setValidationPostId] = useState<string | null>(null);
  const [deletePost, setDeletePost] = useState<FixItPost | null>(null);
  const { profile } = useAuth();
  const { toast } = useToast();

  const currentUser = profile;
  const canModerate = currentUser?.role === 'owner_manager'
    || currentUser?.role === 'service_manager'
    || isFixItAgentUser(currentUser);

  const getPerson = (id?: string | null) => (id ? feed.profilesById[id] : null);
  const activePosts = useMemo(() => feed.posts.filter(post => post.status !== 'archived'), [feed.posts]);
  const archivedPosts = useMemo(() => feed.posts.filter(post => post.status === 'archived'), [feed.posts]);
  const visiblePosts = view === 'active' ? activePosts : archivedPosts;
  const validationPost = feed.posts.find(post => post.id === validationPostId) ?? null;
  const validationCanManage = validationPost
    ? canModerate || validationPost.claimedBy === currentUser?.id || validationPost.createdBy === currentUser?.id
    : false;

  if (!currentUser) {
    return <div className="p-4 text-sm text-ink-500">Sign in to use Fix-It Feed.</div>;
  }

  const createPost = (body: string, files: File[]) => feed.createPost({ body, files });
  const createComment = (postId: string) => (body: string, files: File[]) => feed.createComment({ postId, body, files });

  const claim = async (post: FixItPost) => {
    try {
      await feed.updatePostStatus(post.id, { status: 'in_progress', claimedBy: currentUser.id });
      toast("Marked as yours. You're on it.");
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not claim this item', 'error');
    }
  };

  const markFixed = async (post: FixItPost) => {
    try {
      await feed.updatePostStatus(post.id, {
        status: 'agent_done',
        claimedBy: post.claimedBy ?? currentUser.id,
        agentTestedBy: currentUser.id,
        agentTestedAt: new Date().toISOString(),
      });
      toast('Marked fixed and validation complete');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not mark fixed', 'error');
    }
  };

  const archive = async (post: FixItPost) => {
    try {
      await feed.updatePostStatus(post.id, {
        status: 'archived',
        humanReviewedBy: currentUser.id,
        humanReviewedAt: new Date().toISOString(),
        archivedBy: currentUser.id,
        archivedAt: new Date().toISOString(),
      });
      setView('archive');
      toast('Archived after human review');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not archive this item', 'error');
    }
  };

  const reopen = async (post: FixItPost) => {
    try {
      await feed.updatePostStatus(post.id, {
        status: 'open',
        claimedBy: null,
        agentTestedBy: null,
        agentTestedAt: null,
        humanReviewedBy: null,
        humanReviewedAt: null,
        archivedBy: null,
        archivedAt: null,
        reopenedBy: currentUser.id,
        reopenedAt: new Date().toISOString(),
        reopenCount: (post.reopenCount ?? 0) + 1,
        reopenedFromStatus: post.status,
      });
      setView('active');
      toast('Reopened');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not reopen this item', 'error');
    }
  };

  const removeComment = async (comment: FixItComment) => {
    try {
      await feed.deleteComment(comment);
      toast('Comment deleted');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not delete comment', 'error');
    }
  };

  const confirmDeletePost = async () => {
    if (!deletePost) return;
    try {
      await feed.deletePost(deletePost);
      setDeletePost(null);
      toast('Fix-It item deleted');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not delete item', 'error');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 py-2 border-b border-ink-800">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink-950 p-1">
          <button
            type="button"
            onClick={() => setView('active')}
            className={cn('flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-semibold transition-colors', view === 'active' ? 'bg-brand-500 text-white' : 'text-ink-400 hover:text-ink-100')}
          >
            Active <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">{activePosts.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setView('archive')}
            className={cn('flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-semibold transition-colors', view === 'archive' ? 'bg-brand-500 text-white' : 'text-ink-400 hover:text-ink-100')}
          >
            Archive <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">{archivedPosts.length}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {view === 'active' && <FeedComposer onSubmit={createPost} />}

        {feed.isLoading ? (
          <div className="py-10 flex items-center justify-center text-ink-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : visiblePosts.length === 0 ? (
          <div className="py-10 text-center text-ink-500">
            <Wrench className="w-7 h-7 mx-auto mb-2" />
            <p className="text-sm font-medium">{view === 'archive' ? 'No human-reviewed items archived yet.' : 'Nothing active has been flagged yet.'}</p>
          </div>
        ) : visiblePosts.map(post => {
          const author = getPerson(post.createdBy);
          const claimedUser = getPerson(post.claimedBy);
          const testedUser = getPerson(post.agentTestedBy) ?? claimedUser;
          const reviewedUser = getPerson(post.humanReviewedBy);
          const reopenedUser = getPerson(post.reopenedBy);
          const meta = statusMeta[post.status] ?? statusMeta.open;
          const canClose = canModerate || post.claimedBy === currentUser.id || post.createdBy === currentUser.id;
          const canDelete = canModerate || post.createdBy === currentUser.id;

          return (
            <article key={post.id} className={cn('rounded-lg border bg-ink-850/60 p-3 space-y-3', post.status === 'agent_done' ? 'border-emerald-500/25' : 'border-ink-700')}>
              <div className="flex items-start gap-2">
                <Avatar user={author} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink-100">{personName(author)}</p>
                      <p className="text-[11px] text-ink-500">{timeAgo(post.createdAt)}</p>
                    </div>
                    <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', meta.className)}>
                      {meta.label}
                    </span>
                  </div>
                </div>
              </div>

              {post.reopenedAt && (
                <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
                  <RefreshCw className="w-3 h-3" />
                  Reopened{reopenedUser ? ` by ${personName(reopenedUser)}` : ''} {timeAgo(post.reopenedAt)}
                </div>
              )}

              {post.body && <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-200">{post.body}</p>}

              {post.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {post.attachments.map(file => <AttachmentButton key={file.id} file={file} onPreview={setPreviewFile} />)}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                {post.status === 'agent_done' || post.status === 'fixed' ? (
                  <button
                    type="button"
                    onClick={() => setValidationPostId(post.id)}
                    title="Open validation proof"
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold',
                      post.validationProof ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                    )}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {testedUser && <Avatar user={testedUser} size="sm" />}
                    <span>{post.validationProof ? 'Fixed by Agent; validation complete' : 'Validation proof needed'}</span>
                  </button>
                ) : post.status === 'archived' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-950 px-2 py-1.5 text-[11px] font-semibold text-ink-300">
                    <Archive className="w-3.5 h-3.5" />
                    {reviewedUser ? `Human reviewed by ${personName(reviewedUser)}` : 'Human reviewed'}
                  </span>
                ) : claimedUser ? (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/20 bg-brand-500/10 px-2 py-1.5 text-[11px] font-semibold text-brand-300">
                    <Avatar user={claimedUser} size="sm" />
                    {claimedUser.id === currentUser.id ? "You're on it" : `${personName(claimedUser)} is on it`}
                  </span>
                ) : (
                  <button type="button" onClick={() => claim(post)} className="inline-flex items-center gap-1.5 rounded-lg bg-ink-800 hover:bg-ink-700 px-2 py-1.5 text-[11px] font-semibold text-ink-200">
                    <UserPlus className="w-3.5 h-3.5" /> I'm on it
                  </button>
                )}

                {['open', 'in_progress'].includes(post.status) && canClose && (
                  <button type="button" onClick={() => markFixed(post)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 px-2 py-1.5 text-[11px] font-semibold text-white">
                    <Check className="w-3.5 h-3.5" /> Mark fixed
                  </button>
                )}
                {['fixed', 'agent_done'].includes(post.status) && canModerate && (
                  <button type="button" onClick={() => archive(post)} className="inline-flex items-center gap-1.5 rounded-lg bg-ink-800 hover:bg-ink-700 px-2 py-1.5 text-[11px] font-semibold text-ink-300">
                    <Archive className="w-3.5 h-3.5" /> Archive
                  </button>
                )}
                {post.status !== 'open' && canClose && (
                  <button type="button" onClick={() => reopen(post)} className="inline-flex items-center gap-1.5 rounded-lg bg-ink-800 hover:bg-ink-700 px-2 py-1.5 text-[11px] font-semibold text-ink-300">
                    <RefreshCw className="w-3.5 h-3.5" /> Reopen
                  </button>
                )}
                {canDelete && (
                  <button type="button" onClick={() => setDeletePost(post)} title="Delete item" className="ml-auto inline-flex items-center justify-center rounded-lg p-1.5 text-ink-500 hover:bg-red-500/10 hover:text-red-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {post.comments.length > 0 && (
                <div className="space-y-2 border-t border-ink-800 pt-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-500">
                    <MessageSquare className="w-3.5 h-3.5" /> Task comments
                  </div>
                  {post.comments.map(comment => {
                    const commenter = getPerson(comment.createdBy);
                    const canDeleteComment = canModerate || comment.createdBy === currentUser.id;
                    return (
                      <div key={comment.id} className={cn('flex gap-2 rounded-lg p-2', isFixItAgentUser(commenter) ? 'bg-brand-500/10' : 'bg-ink-950/70')}>
                        <Avatar user={commenter} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
                            <strong className="text-ink-300">{personName(commenter)}</strong>
                            {isFixItAgentUser(commenter) && <span className="rounded bg-brand-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-300">Agent reply</span>}
                            <span>{timeAgo(comment.createdAt)}</span>
                            {canDeleteComment && (
                              <button type="button" onClick={() => removeComment(comment)} className="ml-auto text-ink-600 hover:text-red-300" aria-label="Delete comment">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {comment.body && <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-300">{comment.body}</p>}
                          {comment.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {comment.attachments.map(file => <AttachmentButton key={file.id} file={file} onPreview={setPreviewFile} />)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {view === 'active' && (
                <FeedComposer compact onSubmit={createComment(post.id)} />
              )}
            </article>
          );
        })}
      </div>

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      <ValidationProofModal
        post={validationPost}
        currentUser={currentUser}
        profilesById={feed.profilesById}
        canManage={validationCanManage}
        onUploadProof={feed.uploadValidationProof}
        onClose={() => setValidationPostId(null)}
      />

      {deletePost && (
        <div className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setDeletePost(null)}>
          <div className="w-full max-w-sm bg-ink-900 border border-ink-700 rounded-lg shadow-2xl p-4 space-y-4" onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}>
            <div className="flex items-center gap-2 text-red-300">
              <Trash2 className="w-5 h-5" />
              <h3 className="text-sm font-bold">Delete Fix-It item</h3>
            </div>
            <p className="text-sm leading-relaxed text-ink-400">Delete this item and all attached files? This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeletePost(null)} className="px-3 py-2 rounded-lg bg-ink-800 hover:bg-ink-700 text-xs font-semibold text-ink-300">Cancel</button>
              <button type="button" onClick={confirmDeletePost} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-semibold text-white">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
