'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Image from 'next/image';
import {
  BadgeCheck,
  BarChart3,
  Bookmark,
  Camera,
  Clapperboard,
  Film,
  Flag,
  Heart,
  Globe,
  House,
  Image as ImageIcon,
  ArrowLeft,
  BookmarkPlus,
  Lock,
  Trash2,
  Link2,
  ListVideo,
  LayoutDashboard,
  MessageCircle,
  MoreHorizontal,
  Play,
  Plus,
  Pencil,
  Search,
  Send,
  Share2,
  Sparkles,
  Tv2,
  TrendingUp,
  UploadCloud,
  UsersRound,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { api } from '@/lib/client-api';
import { toast } from '@/components/toast';
import { JaminoAvatar } from '@/components/jamino-avatar';
import { useAppStore } from '@/store/app-store';
import { WorkspaceTopbar } from '@/components/hub-gateway';
import { CreatorApplyModal } from '@/components/creator-apply-modal';
import { CreatorProfileModal } from '@/components/creator-profile-modal';
import { CreatorCollabStudio } from '@/components/creator-collab-studio';

type VideoView = 'feed' | 'following' | 'shorts' | 'long' | 'watch' | 'watchlist' | 'creators' | 'studio' | 'playlists';
type SavedPost = { postId: number; playlistId: number };
type FeedKind = 'ALL' | 'SHORT' | 'LONG';
type MediaType = 'TEXT' | 'IMAGE' | 'VIDEO';

interface VideoAuthor {
  id: number;
  username: string;
  avatarId: number;
  avatarPhoto: string | null;
}

export interface VideoPost {
  id: number;
  title: string;
  description: string;
  kind: 'POST' | 'SHORT' | 'LONG';
  mediaType: MediaType;
  assetId: string | null;
  assetUrl: string | null;
  externalUrl: string | null;
  thumbnailUrl: string | null;
  thumbnailAssetId: string | null;
  subtitlesUrl: string | null;
  durationSec: number;
  createdAt: string;
  author: VideoAuthor;
  likes: number;
  saves: number;
  comments: number;
  liked: boolean;
  saved: boolean;
}

interface VideoComment {
  id: number;
  text: string;
  createdAt: string;
  user: VideoAuthor;
}

export interface VideoPlaylist {
  id: number;
  name: string;
  desc: string;
  isPublic: boolean;
  createdAt: string;
  items: { id: number; pos: number; post: VideoPost }[];
}

const NAV: { id: VideoView; label: string; icon: typeof Film }[] = [
  { id: 'feed', label: 'For you', icon: Film },
  { id: 'following', label: 'Following', icon: UsersRound },
  { id: 'shorts', label: 'Shorts', icon: Play },
  { id: 'long', label: 'Long videos', icon: Tv2 },
  { id: 'watch', label: 'Watch', icon: Link2 },
  { id: 'watchlist', label: 'Watchlist', icon: Bookmark },
  { id: 'creators', label: 'Creators', icon: Camera },
  { id: 'studio', label: 'Studio', icon: LayoutDashboard },
  { id: 'playlists', label: 'Playlists', icon: ListVideo },
];

function durationLabel(seconds: number) {
  if (!seconds) return '';
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remaining = Math.floor(safeSeconds % 60);
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}` : `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function timeAgo(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function VideoMedia({ post }: { post: VideoPost }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(post.kind !== 'SHORT');
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    if (post.mediaType !== 'VIDEO' || !videoRef.current) return;
    const video = videoRef.current;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        video.pause();
        return;
      }
      video.muted = post.kind === 'SHORT' ? false : muted;
      video.play().then(() => setAudioBlocked(false)).catch(() => {
        if (post.kind === 'SHORT') {
          video.muted = true;
          setMuted(true);
          setAudioBlocked(true);
        }
        video.play().catch(() => {});
      });
    }, { threshold: 0.55 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [muted, post.id, post.kind, post.mediaType]);

  if (post.mediaType === 'IMAGE' && (post.assetUrl || post.externalUrl)) {
    return <div className="video-card-media video-card-image"><Image src={post.assetUrl || post.externalUrl || ''} alt={post.title || 'Video post'} fill unoptimized loading="lazy" /></div>;
  }
  if (post.mediaType === 'VIDEO' && (post.assetUrl || post.externalUrl)) {
    return <div className="video-card-media video-card-video-wrap"><video ref={videoRef} src={post.assetUrl || post.externalUrl || ''} poster={post.thumbnailUrl || undefined} muted={muted} playsInline loop preload="metadata" controls={post.kind === 'LONG'}><track kind="subtitles" src={post.subtitlesUrl || undefined} srcLang="en" label="English" default={!!post.subtitlesUrl} /></video>{post.kind === 'SHORT' && <><button type="button" className="video-sound-button" onClick={(event) => { event.stopPropagation(); const next = !muted; setMuted(next); setAudioBlocked(false); if (videoRef.current) { videoRef.current.muted = next; videoRef.current.play().catch(() => {}); } }} title={muted ? 'Turn sound on' : 'Mute sound'}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>{audioBlocked && muted && <span className="video-sound-hint">Tap for sound</span>}</>}</div>;
  }
  return <div className="video-card-media video-card-text"><Sparkles size={25} /><p>{post.description || post.title || 'A new thought from Jamino.'}</p></div>;
}

function VideoCard({ post, compact = false, onOpen, onOpenPost, onOpenCreator, onLike, onSave, onComment, onShare, onReport, onAddToPlaylist }: { post: VideoPost; compact?: boolean; onOpen?: () => void; onOpenPost?: () => void; onOpenCreator?: () => void; onLike: () => void; onSave: () => void; onComment: () => void; onShare: () => void; onReport?: () => void; onAddToPlaylist?: () => void }) {
  const openPost = onOpenPost ?? onOpen ?? (() => {});
  const openCreator = onOpenCreator ?? onOpen ?? openPost;
  return (
    <article className={`video-post-card video-post-${post.kind.toLowerCase()} ${compact ? 'compact' : ''}`}>
      <div className="video-post-topline">
        <button type="button" className="video-post-author" onClick={openCreator}>
          <JaminoAvatar avatarId={post.author.avatarId} size={34} photo={post.author.avatarPhoto} name={post.author.username} />
          <span><b>@{post.author.username}</b><small>{timeAgo(post.createdAt)}</small></span>
        </button>
        <div className="video-post-type"><span>{post.kind === 'SHORT' ? 'SHORT' : post.kind === 'LONG' ? 'LONG' : 'POST'}</span>{post.durationSec > 0 && <small>{durationLabel(post.durationSec)}</small>}<MoreHorizontal size={16} /></div>
      </div>
      <button type="button" className="video-post-heading" onClick={openPost}>
        <strong>{post.title || 'Untitled post'}</strong>
        {post.description && <span>{post.description}</span>}
      </button>
      <VideoMedia post={post} />
      <div className="video-post-actions">
        <button type="button" className={post.liked ? 'active' : ''} onClick={onLike} title="Like"><Heart size={17} fill={post.liked ? 'currentColor' : 'none'} /><span>{post.likes}</span></button>
        <button type="button" onClick={onComment} title="Comments"><MessageCircle size={17} /><span>{post.comments}</span></button>
        <button type="button" className={post.saved ? 'active' : ''} onClick={onSave} title="Save"><Bookmark size={17} fill={post.saved ? 'currentColor' : 'none'} /><span>{post.saves}</span></button>
        {onAddToPlaylist && <button type="button" onClick={onAddToPlaylist} title="Add to playlist"><BookmarkPlus size={17} /></button>}
        <button type="button" onClick={onShare} title="Share"><Share2 size={17} /></button>
        {onReport && <button type="button" onClick={onReport} title="Report"><Flag size={16} /></button>}
      </div>
    </article>
  );
}

function PlaylistPickerModal({ post, open, onClose, playlists, loading, onDone }: { post: VideoPost | null; open: boolean; onClose: () => void; playlists: VideoPlaylist[]; loading: boolean; onDone: () => void }) {
  const [name, setName] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  if (!open || !post) return null;

  const addTo = async (playlist: VideoPlaylist) => {
    setBusyId(playlist.id);
    try {
      await api(`/api/video/playlists/${playlist.id}`, { method: 'POST', body: JSON.stringify({ postId: post.id }) });
      toast(`Added to “${playlist.name}”.`, 'ok');
      onDone();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not add to playlist.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const createAndAdd = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusyId(-1);
    try {
      const data = await api<{ playlist: VideoPlaylist }>('/api/video/playlists', { method: 'POST', body: JSON.stringify({ name: trimmed }) });
      await api(`/api/video/playlists/${data.playlist.id}`, { method: 'POST', body: JSON.stringify({ postId: post.id }) });
      toast(`Added to “${data.playlist.name}”.`, 'ok');
      onDone();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not create playlist.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="video-modal-backdrop" style={{ backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)' }} onMouseDown={onClose}>
      <section className="video-comments-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="video-modal-head"><div><div className="hub-kicker">SAVE TO PLAYLIST</div><h2>{post.title || 'Pick a playlist'}</h2></div><button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="video-playlist-picker">
          {loading && <div className="video-modal-loading"><span className="admin-loader" /> Loading playlists…</div>}
          {!loading && playlists.length === 0 && <div className="video-modal-empty"><ListVideo size={20} /><span>Name your first playlist below.</span></div>}
          {playlists.map((playlist) => (
            <button type="button" className="video-playlist-option" key={playlist.id} disabled={busyId !== null} onClick={() => void addTo(playlist)}>
              <ListVideo size={17} />
              <span><b>{playlist.name}</b><small>{playlist.items.length} video{playlist.items.length === 1 ? '' : 's'}</small></span>
              <Plus size={15} />
            </button>
          ))}
        </div>
        <form className="video-comment-form" onSubmit={createAndAdd}>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="New playlist name…" />
          <button type="submit" className="btn-icon violet" disabled={busyId !== null || !name.trim()} aria-label="Create playlist and add"><Plus size={17} /></button>
        </form>
      </section>
    </div>
  );
}

function CreatePostModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (post: VideoPost) => void }) {
  const [kind, setKind] = useState<'POST' | 'SHORT' | 'LONG'>('POST');
  const [mediaType, setMediaType] = useState<MediaType>('TEXT');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [subtitlesUrl, setSubtitlesUrl] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [durationSec, setDurationSec] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind('POST');
    setMediaType('TEXT');
    setTitle('');
    setDescription('');
    setThumbnailUrl('');
    setSubtitlesUrl('');
    setExternalUrl('');
    setDurationSec('');
    setFile(null);
    setThumbnailFile(null);
  }, [open]);

  const inspectVideo = async (nextFile: File) => {
    const objectUrl = URL.createObjectURL(nextFile);
    const element = document.createElement('video');
    element.preload = 'metadata';
    element.muted = true;
    element.src = objectUrl;
    try {
      await new Promise<void>((resolve, reject) => {
        element.onloadedmetadata = () => resolve();
        element.onerror = () => reject(new Error('Could not inspect this video'));
      });
      if (!durationSec && Number.isFinite(element.duration)) setDurationSec(String(Math.round(element.duration)));
      const frameTime = Math.min(.2, Math.max(0, element.duration - .05));
      await new Promise<void>((resolve) => {
        element.onseeked = () => resolve();
        element.currentTime = frameTime;
      });
      const canvas = document.createElement('canvas');
      canvas.width = element.videoWidth || 640;
      canvas.height = element.videoHeight || 360;
      canvas.getContext('2d')?.drawImage(element, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .86));
      if (blob) setThumbnailFile(new File([blob], `${nextFile.name.replace(/\.[^.]+$/, '')}-thumbnail.jpg`, { type: 'image/jpeg' }));
    } catch {
      setThumbnailFile(null);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      let assetId = '';
      if (file) {
        const form = new FormData();
        form.append('file', file);
        const uploaded = await api<{ asset: { id: string } }>('/api/video/assets', { method: 'POST', body: form });
        assetId = uploaded.asset.id;
      }
      let thumbnailAssetId = '';
      if (thumbnailFile) {
        const form = new FormData();
        form.append('file', thumbnailFile);
        const uploaded = await api<{ asset: { id: string } }>('/api/video/assets', { method: 'POST', body: form });
        thumbnailAssetId = uploaded.asset.id;
      }
      const data = await api<{ post: VideoPost }>('/api/video/posts', {
        method: 'POST',
        body: JSON.stringify({ kind, mediaType, title, description, thumbnailUrl, subtitlesUrl, externalUrl, durationSec: Number(durationSec || 0), assetId, thumbnailAssetId }),
      });
      toast('Published to Video Hub.', 'ok');
      onCreated(data.post);
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not publish this post.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  const needsVideo = kind !== 'POST';
  return (
    <div className="video-modal-backdrop" style={{ backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)' }} onMouseDown={onClose}>
      <section className="video-create-modal" role="dialog" aria-modal="true" aria-labelledby="video-create-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="video-modal-head"><div><div className="hub-kicker">CREATE IN VIDEO HUB</div><h2 id="video-create-title">Share something worth watching</h2></div><button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <form className="video-create-form" onSubmit={submit}>
          <div className="video-create-tabs"><button type="button" className={kind === 'POST' ? 'active' : ''} onClick={() => { setKind('POST'); setMediaType('TEXT'); setFile(null); }}>Post</button><button type="button" className={kind === 'SHORT' ? 'active' : ''} onClick={() => { setKind('SHORT'); setMediaType('VIDEO'); setFile(null); }}>Short video</button><button type="button" className={kind === 'LONG' ? 'active' : ''} onClick={() => { setKind('LONG'); setMediaType('VIDEO'); setFile(null); }}>Long video</button></div>
          {kind === 'POST' && <label><span>Post format</span><select value={mediaType} onChange={(event) => { setMediaType(event.target.value as MediaType); setFile(null); }}><option value="TEXT">Text post</option><option value="IMAGE">Photo</option><option value="VIDEO">Video</option></select></label>}
          <label><span>Title</span><input required={!description} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder={needsVideo ? 'Give your video a clear title' : 'What is this about?'} /></label>
          <label><span>Description</span><textarea required={!title} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={4} placeholder="Add context, a caption or a story…" /></label>
          {mediaType !== 'TEXT' && <div className="video-upload-box"><UploadCloud size={22} /><div><b>{file ? file.name : 'Choose a photo or video'}</b><span>{mediaType === 'IMAGE' ? 'PNG, JPG or WEBP · up to 15 MB' : 'MP4, MOV or WEBM · up to 100 MB · thumbnail is generated automatically'}</span></div><label className="btn btn-ghost pill-sm"><ImageIcon size={14} /> Browse<input type="file" hidden accept={mediaType === 'IMAGE' ? 'image/png,image/jpeg,image/webp' : 'video/mp4,video/webm,video/quicktime'} onChange={(event) => { const nextFile = event.target.files?.[0] ?? null; setFile(nextFile); setThumbnailFile(null); if (nextFile?.type.startsWith('video/')) void inspectVideo(nextFile); }} /></label></div>}
          {mediaType !== 'TEXT' && <label><span>Or paste a direct media URL</span><input type="url" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://…/video.mp4" /></label>}
          {needsVideo && <div className="video-create-grid"><label><span>Duration in seconds</span><input type="number" min={0} max={86400} value={durationSec} onChange={(event) => setDurationSec(event.target.value)} placeholder="Auto detected from upload" /></label><label><span>Thumbnail URL</span><input type="url" value={thumbnailUrl} onChange={(event) => setThumbnailUrl(event.target.value)} placeholder={thumbnailFile ? 'Auto thumbnail ready' : 'Optional cover image'} /></label><label><span>Subtitles URL</span><input type="url" value={subtitlesUrl} onChange={(event) => setSubtitlesUrl(event.target.value)} placeholder="Optional .vtt file" /></label></div>}
          <footer className="video-modal-actions"><span><Sparkles size={13} /> Your post appears in the infinite feed after publishing.</span><button type="submit" className="btn btn-violet" disabled={saving}>{saving ? 'Publishing…' : <><Send size={14} /> Publish</>}</button></footer>
        </form>
      </section>
    </div>
  );
}

function CommentsModal({ post, open, onClose, onAdded }: { post: VideoPost | null; open: boolean; onClose: () => void; onAdded: (comment: VideoComment) => void }) {
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !post) return;
    setLoading(true);
    api<{ comments: VideoComment[] }>(`/api/video/posts/${post.id}/comments`).then((data) => setComments(data.comments)).catch(() => setComments([])).finally(() => setLoading(false));
  }, [open, post]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!post || !text.trim()) return;
    setSending(true);
    try {
      const data = await api<{ comment: VideoComment }>(`/api/video/posts/${post.id}/comments`, { method: 'POST', body: JSON.stringify({ text }) });
      setComments((items) => [...items, data.comment]);
      onAdded(data.comment);
      setText('');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not add comment.', 'error');
    } finally {
      setSending(false);
    }
  };

  if (!open || !post) return null;
  return (
    <div className="video-modal-backdrop" style={{ backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)' }} onMouseDown={onClose}>
      <section className="video-comments-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="video-modal-head"><div><div className="hub-kicker">COMMENTS</div><h2>{post.title || 'Post comments'}</h2></div><button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button></header>
        <div className="video-comments-list">{loading && <div className="video-modal-loading"><span className="admin-loader" /> Loading comments…</div>}{!loading && comments.length === 0 && <div className="video-modal-empty"><MessageCircle size={20} /><span>Be the first to say something.</span></div>}{comments.map((comment) => <div className="video-comment-row" key={comment.id}><JaminoAvatar avatarId={comment.user.avatarId} size={32} photo={comment.user.avatarPhoto} name={comment.user.username} /><div><b>@{comment.user.username}</b><p>{comment.text}</p><small>{timeAgo(comment.createdAt)}</small></div></div>)}</div>
        <form className="video-comment-form" onSubmit={submit}><input value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} placeholder="Write a comment…" /><button type="submit" className="btn-icon violet" disabled={sending || !text.trim()} aria-label="Send comment"><Send size={17} /></button></form>
      </section>
    </div>
  );
}

function LegacyCreatorStudio({ posts, loading, onDelete }: { posts: VideoPost[]; loading: boolean; onDelete: (post: VideoPost) => void }) {
  return <section className="creator-studio-view"><div className="creator-studio-hero"><div><div className="hub-kicker">CREATOR STUDIO</div><h2>Your publishing desk.</h2><p>Review your published work, remove a post, or create the next short and long video.</p></div><LayoutDashboard size={32} /></div>{loading ? <div className="creator-profile-loading"><span className="admin-loader" /> Loading your posts…</div> : posts.length === 0 ? <div className="video-hub-empty large"><Film size={24} /><b>No published work yet.</b><span>Open Create to publish your first post.</span></div> : <div className="creator-studio-grid">{posts.map((post) => <article className="creator-studio-card" key={post.id}><div className="creator-studio-card-media">{post.mediaType === 'VIDEO' ? <video controls playsInline poster={post.thumbnailUrl || undefined} src={post.assetUrl || post.externalUrl || undefined} /> : post.mediaType === 'IMAGE' ? <Image src={post.assetUrl || post.externalUrl || ''} alt="" fill unoptimized /> : <div><Sparkles size={18} /><span>{post.description || post.title}</span></div>}</div><div className="creator-studio-card-copy"><div><b>{post.title || 'Untitled post'}</b><small>{post.kind} · {new Date(post.createdAt).toLocaleDateString()}</small></div><button type="button" className="btn-icon danger" onClick={() => onDelete(post)} title="Delete post"><Flag size={15} /></button></div></article>)}</div>}</section>;
}

function CreatorStudio({ posts, loading, onDelete, onEditProfile }: { posts: VideoPost[]; loading: boolean; onDelete: (post: VideoPost) => void; onEditProfile: () => void }) {
  const likes = posts.reduce((sum, post) => sum + post.likes, 0);
  const saves = posts.reduce((sum, post) => sum + post.saves, 0);
  const comments = posts.reduce((sum, post) => sum + post.comments, 0);
  const interactions = likes + saves + comments;

  return (
    <section className="creator-studio-view">
      <div className="creator-studio-hero">
        <div><div className="hub-kicker">CREATOR STUDIO</div><h2>Your publishing desk.</h2><p>Review every post, understand the response and update your public channel profile without leaving the hub.</p></div>
        <div className="creator-studio-hero-actions"><button type="button" className="btn btn-ghost pill-sm" onClick={onEditProfile}><Pencil size={14} /> Edit channel</button><LayoutDashboard size={32} /></div>
      </div>
      <div className="creator-studio-metrics">
        <div className="creator-studio-metric"><BarChart3 size={17} /><b>{posts.length}</b><span>Published posts</span></div>
        <div className="creator-studio-metric"><Heart size={17} /><b>{likes}</b><span>Total likes</span></div>
        <div className="creator-studio-metric"><Bookmark size={17} /><b>{saves}</b><span>Total saves</span></div>
        <div className="creator-studio-metric"><MessageCircle size={17} /><b>{interactions}</b><span>Audience actions</span></div>
      </div>
      {loading ? <div className="creator-profile-loading"><span className="admin-loader" /> Loading your posts…</div> : posts.length === 0 ? <div className="video-hub-empty large"><Film size={24} /><b>No published work yet.</b><span>Open Create to publish your first post.</span></div> : <>
        <div className="creator-studio-toolbar"><p>Per-post analytics from likes, saves and comments.</p><span className="creator-studio-edit"><TrendingUp size={14} /> {interactions} tracked interactions</span></div>
        <div className="creator-studio-table">
          <div className="creator-studio-row creator-studio-row-head"><span>Post</span><span>Likes</span><span>Saves</span><span>Comments</span><span>Type</span><span /></div>
          {posts.map((post) => <div className="creator-studio-row" key={post.id}><div className="creator-studio-row-title"><div><b>{post.title || 'Untitled post'}</b><small>{new Date(post.createdAt).toLocaleDateString()}</small></div></div><span className="creator-studio-row-stat"><strong>{post.likes}</strong>likes</span><span className="creator-studio-row-stat"><strong>{post.saves}</strong>saves</span><span className="creator-studio-row-stat"><strong>{post.comments}</strong>comments</span><span className="creator-studio-row-stat"><strong>{post.kind}</strong>format</span><button type="button" className="btn-icon danger" onClick={() => onDelete(post)} title="Delete post"><Flag size={15} /></button></div>)}
        </div>
        <CreatorCollabStudio posts={posts.map((post) => ({ id: post.id, title: post.title, kind: post.kind }))} />
      </>}
    </section>
  );
}

export function VideoHub() {
  const setProduct = useAppStore((state) => state.setProduct);
  const setTab = useAppStore((state) => state.setTab);
  const [view, setView] = useState<VideoView>('feed');
  const [posts, setPosts] = useState<VideoPost[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [creatorStatus, setCreatorStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [commentsPost, setCommentsPost] = useState<VideoPost | null>(null);
  const [activePost, setActivePost] = useState<VideoPost | null>(null);
  const [creatorProfileId, setCreatorProfileId] = useState<number | null>(null);
  const [studioPosts, setStudioPosts] = useState<VideoPost[]>([]);
  const [studioLoading, setStudioLoading] = useState(false);
  const [watchUrl, setWatchUrl] = useState('');
  const [activeUrl, setActiveUrl] = useState('');
  const [playlistName, setPlaylistName] = useState('');
  const [playlists, setPlaylists] = useState<VideoPlaylist[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(false);
  const [pickerPost, setPickerPost] = useState<VideoPost | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activePlaylistId, setActivePlaylistId] = useState<number | null>(null);
  const [activePlaylist, setActivePlaylist] = useState<VideoPlaylist | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const nextCursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);

  const feedKind = useMemo<FeedKind>(() => view === 'shorts' ? 'SHORT' : view === 'long' ? 'LONG' : 'ALL', [view]);
  const feedView = view === 'feed' || view === 'following' || view === 'shorts' || view === 'long' || view === 'watchlist';

  const loadPosts = useCallback(async (kind: FeedKind, reset = false, savedOnly = false, followingOnly = false) => {
    if (loadingRef.current || (!reset && !hasMoreRef.current)) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({ kind });
      if (!reset && nextCursorRef.current) params.set('cursor', nextCursorRef.current);
      if (savedOnly) params.set('saved', '1');
      if (followingOnly) params.set('following', '1');
      const data = await api<{ posts: VideoPost[]; nextCursor: string | null; hasMore: boolean }>(`/api/video/posts?${params}`);
      setPosts((current) => {
        if (reset) return data.posts;
        const seen = new Set(current.map((post) => post.id));
        return [...current, ...data.posts.filter((post) => !seen.has(post.id))];
      });
      nextCursorRef.current = data.nextCursor;
      hasMoreRef.current = data.hasMore;
      setHasMore(data.hasMore);
    } catch (error) {
      if (reset) setPosts([]);
      toast(error instanceof Error ? error.message : 'Could not load the video feed.', 'error');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  const refreshCurrentFeed = useCallback(() => {
    nextCursorRef.current = null;
    hasMoreRef.current = true;
    setHasMore(true);
    setPosts([]);
    if (view === 'watchlist') void loadPosts('ALL', true, true, false);
    else void loadPosts(view === 'shorts' ? 'SHORT' : view === 'long' ? 'LONG' : 'ALL', true, false, view === 'following');
  }, [loadPosts, view]);

  const loadPlaylists = useCallback(() => {
    setPlaylistsLoading(true);
    api<{ playlists: VideoPlaylist[] }>('/api/video/playlists').then((data) => setPlaylists(data.playlists)).catch(() => setPlaylists([])).finally(() => setPlaylistsLoading(false));
  }, []);

  useEffect(() => {
    api<{ applications: { status: 'PENDING' | 'APPROVED' | 'REJECTED' }[] }>('/api/creator/apply?hub=VIDEO').then((data) => setCreatorStatus(data.applications[0]?.status ?? null)).catch(() => {});
    loadPlaylists();
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get('videoView') as VideoView | null;
    if (requestedView && NAV.some((item) => item.id === requestedView)) setView(requestedView);
    const url = params.get('watch');
    if (url) { setActiveUrl(url); setView('watch'); }
    const postId = Number(params.get('post') || 0);
    if (postId > 0) api<{ post: VideoPost }>(`/api/video/posts/${postId}`).then((data) => setActivePost(data.post)).catch(() => {});
  }, [loadPlaylists]);

  useEffect(() => {
    if (!feedView) return;
    nextCursorRef.current = null;
    hasMoreRef.current = true;
    setHasMore(true);
    setPosts([]);
    void loadPosts(feedKind, true, view === 'watchlist', view === 'following');
  }, [feedKind, feedView, loadPosts, view]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !feedView) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void loadPosts(feedKind, false, view === 'watchlist', view === 'following');
    }, { rootMargin: '900px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [feedKind, feedView, loadPosts, view]);

  useEffect(() => {
    if (view !== 'studio') return;
    setStudioLoading(true);
    api<{ posts: VideoPost[] }>('/api/video/posts?authorId=me&kind=ALL').then((data) => setStudioPosts(data.posts)).catch(() => setStudioPosts([])).finally(() => setStudioLoading(false));
  }, [view]);

  const changeView = (nextView: VideoView) => {
    setView(nextView);
    const suffix = nextView === 'feed' ? '' : `&videoView=${nextView}`;
    window.history.replaceState({}, '', `/?hub=video${suffix}`);
  };

  const openCreate = () => {
    if (creatorStatus === 'APPROVED') setCreateOpen(true);
    else setCreatorOpen(true);
  };

  const updatePost = (postId: number, update: Partial<VideoPost>) => {
    setPosts((current) => current.map((post) => post.id === postId ? { ...post, ...update } : post));
    setActivePost((current) => current?.id === postId ? { ...current, ...update } : current);
    setCommentsPost((current) => current?.id === postId ? { ...current, ...update } : current);
  };

  const toggleLike = async (post: VideoPost) => {
    try {
      const data = await api<{ liked: boolean; likes: number }>(`/api/video/posts/${post.id}/like`, { method: 'POST' });
      updatePost(post.id, { liked: data.liked, likes: data.likes });
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not update like.', 'error'); }
  };

  const toggleSave = async (post: VideoPost) => {
    try {
      const data = await api<{ saved: boolean; saves: number }>(`/api/video/posts/${post.id}/save`, { method: 'POST' });
      updatePost(post.id, { saved: data.saved, saves: data.saves });
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not update watchlist.', 'error'); }
  };

  const openPlaylistPicker = (post: VideoPost) => {
    setPickerPost(post);
    setPickerOpen(true);
    loadPlaylists();
  };

  const sharePost = async (post: VideoPost) => {
    const url = `${window.location.origin}/?hub=video&post=${post.id}`;
    try { await navigator.clipboard.writeText(url); toast('Post link copied.', 'ok'); } catch { toast(url); }
  };

  const openPost = (post: VideoPost) => {
    setActivePost(post);
    window.history.replaceState({}, '', `/?hub=video&post=${post.id}`);
  };

  const createPlaylist = async (event: FormEvent) => {
    event.preventDefault();
    const name = playlistName.trim();
    if (!name) return;
    try {
      const data = await api<{ playlist: VideoPlaylist }>('/api/video/playlists', { method: 'POST', body: JSON.stringify({ name }) });
      setPlaylists((current) => [data.playlist, ...current]);
      setPlaylistName('');
      toast('Playlist created.', 'ok');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not create the playlist.', 'error');
    }
  };

  const renamePlaylist = async (playlist: VideoPlaylist) => {
    const nextName = window.prompt('New playlist name', playlist.name)?.trim();
    if (!nextName || nextName === playlist.name) return;
    try {
      await api(`/api/video/playlists/${playlist.id}`, { method: 'PATCH', body: JSON.stringify({ name: nextName }) });
      setPlaylists((current) => current.map((item) => item.id === playlist.id ? { ...item, name: nextName } : item));
      if (activePlaylist?.id === playlist.id) setActivePlaylist((current) => current ? { ...current, name: nextName } : current);
      toast('Playlist renamed.', 'ok');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not rename the playlist.', 'error');
    }
  };

  const togglePlaylistPublic = async (playlist: VideoPlaylist) => {
    const isPublic = !playlist.isPublic;
    try {
      await api(`/api/video/playlists/${playlist.id}`, { method: 'PATCH', body: JSON.stringify({ isPublic }) });
      setPlaylists((current) => current.map((item) => item.id === playlist.id ? { ...item, isPublic } : item));
      if (activePlaylist?.id === playlist.id) setActivePlaylist((current) => current ? { ...current, isPublic } : current);
      toast(isPublic ? 'Playlist is public.' : 'Playlist is private.', 'ok');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update the playlist.', 'error');
    }
  };

  const removePlaylistPost = async (playlistId: number, postId: number) => {
    try {
      await api(`/api/video/playlists/${playlistId}`, { method: 'DELETE', body: JSON.stringify({ postId }) });
      setPlaylists((current) => current.map((item) => item.id === playlistId ? { ...item, items: item.items.filter((entry) => entry.post.id !== postId) } : item));
      setActivePlaylist((current) => current && current.id === playlistId ? { ...current, items: current.items.filter((entry) => entry.post.id !== postId) } : current);
      toast('Removed from playlist.', 'ok');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not remove this video.', 'error');
    }
  };

  const deletePlaylist = async (playlist: VideoPlaylist) => {
    if (!window.confirm(`Delete “${playlist.name}”?`)) return;
    try {
      await api(`/api/video/playlists/${playlist.id}`, { method: 'DELETE' });
      setPlaylists((current) => current.filter((item) => item.id !== playlist.id));
      if (activePlaylist?.id === playlist.id) { setActivePlaylist(null); setActivePlaylistId(null); }
      toast('Playlist deleted.', 'ok');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not delete the playlist.', 'error');
    }
  };

  const openPlaylist = (playlist: VideoPlaylist) => {
    setActivePlaylist(playlist);
    setActivePlaylistId(playlist.id);
    if (playlist.items.length === 0) {
      api<{ playlist: VideoPlaylist }>(`/api/video/playlists?id=${playlist.id}`).then((data) => {
        setActivePlaylist(data.playlist);
        setPlaylists((current) => current.map((item) => item.id === playlist.id ? data.playlist : item));
      }).catch(() => {});
    }
  };

  const openWatch = (event: FormEvent) => {
    event.preventDefault();
    const nextUrl = watchUrl.trim();
    if (!nextUrl) return;
    setActiveUrl(nextUrl);
    setWatchUrl('');
    window.history.replaceState({}, '', `/?hub=video&watch=${encodeURIComponent(nextUrl)}`);
  };

  const reportPost = async (post: VideoPost) => {
    try { await api(`/api/video/posts/${post.id}/report`, { method: 'POST', body: JSON.stringify({ reason: 'Reported from Video Hub' }) }); toast('Post reported for review.', 'ok'); } catch (error) { toast(error instanceof Error ? error.message : 'Could not report this post.', 'error'); }
  };

  const deleteStudioPost = async (post: VideoPost) => {
    try { await api(`/api/video/posts/${post.id}`, { method: 'DELETE' }); setStudioPosts((current) => current.filter((item) => item.id !== post.id)); setPosts((current) => current.filter((item) => item.id !== post.id)); toast('Post deleted.', 'ok'); } catch (error) { toast(error instanceof Error ? error.message : 'Could not delete this post.', 'error'); }
  };

  const pageTitle = view === 'feed' ? 'A living video feed.' : NAV.find((item) => item.id === view)?.label || 'Video Hub';

  return (
    <div className="hub-shell hub-shell-video video-hub-root">
      <WorkspaceTopbar onHome={() => setProduct('home')} product="Video Hub" />
      <div className="video-hub-layout">
        <aside className="video-hub-sidebar">
          <div className="video-hub-brand"><span className="hub-empty-icon"><Clapperboard size={22} /></span><div><b>Video Hub</b><small>Post, watch, discover.</small></div></div>
          <nav>{NAV.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={view === id ? 'active' : ''} onClick={() => changeView(id)}><Icon size={16} /><span>{label}</span></button>)}</nav>
          <button type="button" className="video-hub-jam-link" onClick={() => { setProduct('community'); setTab('jams'); }}><UsersRound size={15} /> Open Community</button>
        </aside>

        <main className="video-hub-main">
          <header className="video-hub-heading">
            <div><div className="hub-kicker">VIDEO HUB · CONNECTED TO JAMINO</div><h1>{pageTitle}</h1><p>Photos, posts, shorts and long videos — all from one account.</p></div>
            <div className="hub-heading-actions"><button type="button" className="btn btn-ghost pill-sm" onClick={() => setCreatorOpen(true)}><BadgeCheck size={14} /> {creatorStatus === 'APPROVED' ? 'Creator profile' : 'Become a creator'}</button><button type="button" className="btn btn-violet" onClick={openCreate}><Plus size={15} /> Create</button></div>
          </header>

          {view === 'creators' && <section className="creator-hub-panel"><div className="creator-hub-art"><BadgeCheck size={34} /><span /><span /><span /></div><div><div className="hub-kicker">CREATOR SPACE</div><h2>Make a channel people remember.</h2><p>Apply once, publish after approval, and keep your creator identity connected across Jamino hubs.</p><button type="button" className="btn btn-violet" onClick={() => setCreatorOpen(true)}><Sparkles size={15} /> Open creator application</button></div><div className="creator-perks"><div><UploadCloud size={18} /><b>Publish</b><span>Photos, posts and video uploads.</span></div><div><Heart size={18} /><b>Connect</b><span>Likes, saves and comments.</span></div><div><Film size={18} /><b>Grow</b><span>Shorts and long-form in one feed.</span></div></div></section>}

          {view === 'studio' && <CreatorStudio posts={studioPosts} loading={studioLoading} onDelete={(post) => void deleteStudioPost(post)} onEditProfile={() => setCreatorOpen(true)} />}
          {view === 'playlists' && <section className="video-playlists-view"><div className="video-playlist-hero"><ListVideo size={26} /><div><div className="hub-kicker">YOUR LIBRARY</div><h2>Keep a queue for later.</h2><p>Named playlists live in your account — fill them from any post with the bookmark-plus button.</p></div></div>{activePlaylist ? <section className="video-playlist-open"><header className="video-playlist-open-head"><button type="button" className="btn-icon" onClick={() => { setActivePlaylist(null); setActivePlaylistId(null); }} aria-label="Back to playlists"><ArrowLeft size={17} /></button><div><div className="hub-kicker">PLAYLIST</div><h2>{activePlaylist.name}</h2><small>{activePlaylist.items.length} video{activePlaylist.items.length === 1 ? '' : 's'} · {activePlaylist.isPublic ? 'Public' : 'Private'}</small></div><button type="button" className="btn-icon danger" onClick={() => void deletePlaylist(activePlaylist)} title="Delete playlist"><Trash2 size={15} /></button></header>{activePlaylist.items.length === 0 ? <div className="video-hub-empty large"><ListVideo size={22} /><b>This playlist is empty.</b><span>Open any post and use “Add to playlist”.</span></div> : <div className="video-long-grid">{activePlaylist.items.map((item) => <div className="video-playlist-entry" key={item.id}><VideoCard compact post={item.post} onOpenPost={() => openPost(item.post)} onOpenCreator={() => setCreatorProfileId(item.post.author.id)} onLike={() => void toggleLike(item.post)} onSave={() => void toggleSave(item.post)} onComment={() => setCommentsPost(item.post)} onShare={() => void sharePost(item.post)} onReport={() => void reportPost(item.post)} /><button type="button" className="btn-icon danger video-playlist-entry-remove" onClick={() => void removePlaylistPost(activePlaylist.id, item.post.id)} title="Remove from playlist"><X size={14} /></button></div>)}</div>}</section> : <><form className="video-create-playlist" onSubmit={createPlaylist}><input value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} placeholder="New video playlist" maxLength={80} /><button type="submit" className="btn btn-violet pill-sm" disabled={!playlistName.trim()}><Plus size={14} /> Create</button></form>{playlistsLoading && playlists.length === 0 && <div className="video-modal-loading"><span className="admin-loader" /> Loading playlists…</div>}{!playlistsLoading && playlists.length === 0 && <div className="video-hub-empty"><ListVideo size={22} /><b>No playlists yet.</b><span>Create a place for your next watch session.</span></div>}{playlists.length > 0 && <div className="video-playlist-grid">{playlists.map((playlist) => <div className="video-playlist-card" key={playlist.id}><button type="button" className="video-playlist-card-open" onClick={() => openPlaylist(playlist)}><ListVideo size={20} /><b>{playlist.name}</b><span>{playlist.items.length} video{playlist.items.length === 1 ? '' : 's'} · {playlist.isPublic ? 'Public' : 'Private'}</span></button><div className="video-playlist-card-actions"><button type="button" className="btn-icon" onClick={() => void togglePlaylistPublic(playlist)} title={playlist.isPublic ? 'Make private' : 'Make public'}>{playlist.isPublic ? <Globe size={14} /> : <Lock size={14} />}</button><button type="button" className="btn-icon" onClick={() => void renamePlaylist(playlist)} title="Rename"><Pencil size={14} /></button><button type="button" className="btn-icon danger" onClick={() => void deletePlaylist(playlist)} title="Delete"><Trash2 size={14} /></button></div></div>)}</div>}</>}</section>}

          {view === 'watch' && <section className="video-watch-panel"><form className="video-watch-form" onSubmit={openWatch}><Search size={16} /><input value={watchUrl} onChange={(event) => setWatchUrl(event.target.value)} placeholder="Paste a direct video URL" /><button type="submit" className="btn btn-violet pill-sm">Open</button></form>{activeUrl ? <div className="video-watch-player"><video controls playsInline src={activeUrl} /><div className="video-watch-meta"><div><b>Shared video</b><span>{activeUrl}</span></div><button type="button" className="btn btn-ghost pill-sm" onClick={() => { navigator.clipboard.writeText(window.location.href).then(() => toast('Watch link copied.', 'ok')).catch(() => {}); }}><Share2 size={14} /> Share</button></div></div> : <div className="video-hub-empty large"><Link2 size={26} /><b>No video selected.</b><span>Paste a direct MP4, MOV or WEBM URL to open it.</span></div>}</section>}

          {feedView && <section className={`video-feed-section ${view === 'shorts' ? 'is-shorts' : ''} ${view === 'long' ? 'is-long' : ''}`}><div className="video-feed-toolbar"><div><span className="video-feed-dot" /> {view === 'watchlist' ? 'Saved for later' : view === 'following' ? 'From creators you follow' : view === 'shorts' ? 'Swipeable shorts' : view === 'long' ? 'Long-form stories' : 'Fresh from the community'}</div><button type="button" className="btn btn-ghost pill-sm" onClick={refreshCurrentFeed}><Sparkles size={14} /> Refresh</button></div>{loading && posts.length === 0 && <div className="video-loading-grid">{[1, 2, 3].map((item) => <div className="video-skeleton" key={item} />)}</div>}{!loading && posts.length === 0 && <div className="video-hub-empty large"><Film size={26} /><b>{view === 'watchlist' ? 'Your watchlist is empty.' : view === 'following' ? 'Follow a creator to shape this feed.' : 'The feed is waiting for its first post.'}</b><span>{view === 'watchlist' ? 'Tap the bookmark on anything you want to keep.' : creatorStatus === 'APPROVED' ? 'Publish the first photo, post or video from Create.' : 'Become a creator to start the first channel.'}</span><button type="button" className="btn btn-violet pill-sm" onClick={openCreate}><Plus size={14} /> {creatorStatus === 'APPROVED' ? 'Create a post' : 'Become a creator'}</button></div>}{posts.length > 0 && <div className={view === 'shorts' ? 'video-shorts-feed' : view === 'long' ? 'video-long-grid' : 'video-feed-grid'}>{posts.map((post) => <VideoCard key={post.id} post={post} compact={view === 'shorts'} onOpenPost={() => openPost(post)} onOpenCreator={() => setCreatorProfileId(post.author.id)} onLike={() => toggleLike(post)} onSave={() => toggleSave(post)} onComment={() => setCommentsPost(post)} onShare={() => sharePost(post)} onReport={() => void reportPost(post)} onAddToPlaylist={() => openPlaylistPicker(post)} />)}</div>}<div ref={sentinelRef} className="video-feed-sentinel">{loading && posts.length > 0 && <span className="admin-loader" />}{!hasMore && posts.length > 0 && <span>You are all caught up.</span>}</div></section>}
        </main>
      </div>

      <nav className="hub-mobile-nav video-mobile-nav"><button type="button" onClick={() => setProduct('home')} aria-label="Hub home"><House size={17} /><span>Home</span></button>{NAV.slice(0, 5).map(({ id, label, icon: Icon }) => <button type="button" key={id} className={view === id ? 'active' : ''} onClick={() => changeView(id)}><Icon size={17} /><span>{label}</span></button>)}</nav>
      <CreatorApplyModal hub="VIDEO" open={creatorOpen} onClose={() => setCreatorOpen(false)} onSubmitted={(application) => setCreatorStatus(application.status)} />
      <CreatePostModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(post) => { setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]); setView('feed'); }} />
      <CommentsModal post={commentsPost} open={!!commentsPost} onClose={() => setCommentsPost(null)} onAdded={() => { if (commentsPost) updatePost(commentsPost.id, { comments: commentsPost.comments + 1 }); }} />
      <PlaylistPickerModal post={pickerPost} open={pickerOpen} onClose={() => setPickerOpen(false)} playlists={playlists} loading={playlistsLoading} onDone={loadPlaylists} />
      <CreatorProfileModal creatorId={creatorProfileId} open={creatorProfileId !== null} onClose={() => setCreatorProfileId(null)} />
      {activePost && <div className="video-modal-backdrop" style={{ backdropFilter: 'blur(24px) saturate(1.2)', WebkitBackdropFilter: 'blur(24px) saturate(1.2)' }} onMouseDown={() => { setActivePost(null); window.history.replaceState({}, '', '/?hub=video'); }}><section className="video-post-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><header className="video-modal-head"><div><div className="hub-kicker">{activePost.kind} · VIDEO HUB</div><h2>{activePost.title || 'Post'}</h2></div><button type="button" className="btn-icon" onClick={() => { setActivePost(null); window.history.replaceState({}, '', '/?hub=video'); }} aria-label="Close"><X size={18} /></button></header><div className="video-post-modal-body"><VideoCard post={activePost} onOpen={() => {}} onLike={() => toggleLike(activePost)} onSave={() => toggleSave(activePost)} onComment={() => setCommentsPost(activePost)} onShare={() => sharePost(activePost)} onAddToPlaylist={() => openPlaylistPicker(activePost)} /></div></section></div>}
    </div>
  );
}
