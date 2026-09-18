'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Bell,
  Bird,
  Bookmark,
  Calendar,
  Check,
  Flag,
  Globe,
  Hash,
  Heart,
  ImagePlus,
  Link2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Repeat2,
  Search,
  Send,
  ShieldAlert,
  Smile,
  Sparkles,
  Trash2,
  TrendingUp,
  User as UserIcon,
  UsersRound,
  VolumeX,
  X,
} from 'lucide-react';
import { api } from '@/lib/client-api';
import { uploadWithProgress } from '@/lib/client-api';
import { toast } from '@/components/toast';
import { JaminoAvatar } from '@/components/jamino-avatar';
import { useAppStore } from '@/store/app-store';
import { WorkspaceTopbar } from '@/components/hub-gateway';

type TweetView = 'home' | 'explore' | 'following' | 'bookmarks' | 'notifications' | 'profile' | 'search';
type ProfileTab = 'posts' | 'replies' | 'media' | 'likes';
type TweetEventType = 'like' | 'retweet' | 'reply' | 'follow' | 'quote' | 'mention';

interface TweetAuthor {
  id: number;
  username: string;
  name: string;
  avatarId: number;
  avatarPhoto: string | null;
  bannerPhoto: string | null;
  bio: string;
  website: string;
  location: string;
}

interface TweetMedia {
  id: string;
  url: string;
  mime: string;
}

interface Tweet {
  id: number;
  text: string;
  media: TweetMedia[];
  replyToId: number | null;
  retweetOfId: number | null;
  quotedTweetId: number | null;
  quoted: Tweet | null;
  createdAt: string;
  updatedAt: string;
  author: TweetAuthor;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  liked: boolean;
  saved: boolean;
  retweeted: boolean;
}

interface TweetProfile {
  user: TweetAuthor & { joinedAt: string };
  stats: { tweets: number; replies: number; media: number; likes: number; following: number; followers: number; likedCount: number };
  following: boolean;
  blocked: boolean;
  blockedBy: boolean;
  muted: boolean;
  isMe: boolean;
}

interface Trend {
  tag: string;
  count: number;
}

interface SugUser {
  id: number;
  username: string;
  name?: string;
  avatarId: number;
  avatarPhoto: string | null;
  bio: string;
  tweets: number;
  followers: number;
}

interface TweetEvent {
  id: number;
  type: TweetEventType;
  readAt: string | null;
  tweetId: number | null;
  tweetText: string;
  createdAt: string;
  actor: {
    id: number;
    username: string;
    name: string;
    avatarId: number;
    avatarPhoto: string | null;
    bio: string;
  } | null;
}

interface ListUser {
  id: number;
  username: string;
  name?: string;
  avatarId: number;
  avatarPhoto: string | null;
  bio: string;
  tweets: number;
  followersCount: number;
  following: boolean;
  isMe: boolean;
  isTarget: boolean;
}

const FEED_VIEWS: TweetView[] = ['home', 'explore', 'following', 'bookmarks', 'profile', 'search'];
const MAX_MEDIA = 4;
const MAX_TEXT = 280;
const RECENTS_KEY = 'tweet-recent-searches';

const EMOJIS = ['😀','😂','🤣','😊','😍','🥰','😎','🤩','🙃','😜','🤔','😴','🥳','😭','😅','😉','👍','👎','👏','🙏','💪','🫡','🔥','✨','⭐','💯','🎉','🎊','❤️','💔','💚','💙','🫶','🎂','🎁','🌍','🚀','⚡','🌟'];
const REPORT_REASONS = [
  { id: 'SPAM', label: 'Spam' },
  { id: 'HARASSMENT', label: 'Harassment' },
  { id: 'HATE', label: 'Hateful content' },
  { id: 'VIOLENCE', label: 'Violence' },
  { id: 'SEXUAL', label: 'Sexual content' },
  { id: 'FRAUD', label: 'Scam or fraud' },
  { id: 'OTHER', label: 'Something else' },
];

function timeAgo(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString();
}

function apiViewFor(view: TweetView) {
  return view === 'explore' ? 'trending' : view;
}

function renderText(text: string, onTag?: (tag: string) => void, onMention?: (username: string) => void) {
  return text.split(/(\s+)/).map((part, index) => {
    if (part.startsWith('#') && part.length > 1) {
      return (
        <button type="button" key={index} className="tweet-inline-link" onClick={(event) => { event.stopPropagation(); onTag?.(part); }}>
          {part}
        </button>
      );
    }
    if (part.startsWith('@') && part.length > 1) {
      return (
        <button type="button" key={index} className="tweet-inline-mention" onClick={(event) => { event.stopPropagation(); onMention?.(part.slice(1)); }}>
          {part}
        </button>
      );
    }
    return part;
  });
}

function isVideo(tweet: Tweet, item?: TweetMedia) {
  return (item ?? tweet.media[0])?.mime.startsWith('video/');
}

function TweetMediaGrid({ tweet, onOpen }: { tweet: Tweet; onOpen: (index: number) => void }) {
  const media = tweet.media;
  if (media.length === 0) return null;
  if (media.length === 1) {
    const item = media[0];
    if (item.mime.startsWith('video/')) {
      return <div className="tweet-media tweet-media-video"><video src={item.url} controls playsInline preload="metadata" /></div>;
    }
    return <button type="button" className="tweet-media tweet-media-image" onClick={() => onOpen(0)}><img src={item.url} alt="" loading="lazy" /></button>;
  }
  return (
    <div className={`tweet-grid ${media.length === 3 ? 'tweet-grid-3' : media.length === 2 ? 'tweet-grid-2' : 'tweet-grid-4'}`}>
      {media.map((item, index) => (
        <button type="button" key={item.id} className={`tweet-grid-item ${media.length === 3 && index === 0 ? 'tweet-grid-span' : ''}`} onClick={() => onOpen(index)}>
          {item.mime.startsWith('video/') ? (
            <span className="tweet-grid-video"><video src={item.url} muted playsInline preload="metadata" /></span>
          ) : (
            <img src={item.url} alt="" loading="lazy" />
          )}
        </button>
      ))}
    </div>
  );
}

function QuotedCard({ tweet, onOpen, onAuthor, onTag, onMention }: {
  tweet: Tweet;
  onOpen: () => void;
  onAuthor: () => void;
  onTag: (tag: string) => void;
  onMention: (username: string) => void;
}) {
  return (
    <button type="button" className="tweet-quote-card" onClick={onOpen}>
      <span className="tweet-quote-head">
        <JaminoAvatar avatarId={tweet.author.avatarId} size={20} photo={tweet.author.avatarPhoto} name={tweet.author.username} />
        <b>{tweet.author.name || `@${tweet.author.username}`}</b>
        <span>@{tweet.author.username} · {timeAgo(tweet.createdAt)}</span>
      </span>
      {tweet.text && <span className="tweet-quote-text">{renderText(tweet.text, onTag, onMention)}</span>}
      {tweet.media[0] && (
        <span className="tweet-quote-media">
          {isVideo(tweet) ? <video src={tweet.media[0].url} muted playsInline preload="metadata" /> : <img src={tweet.media[0].url} alt="" loading="lazy" />}
        </span>
      )}
    </button>
  );
}

function TweetActions({
  tweet,
  onLike,
  onRetweet,
  onQuote,
  onBookmark,
  onReply,
  onShare,
}: {
  tweet: Tweet;
  onLike: () => void;
  onRetweet: () => void;
  onQuote: () => void;
  onBookmark: () => void;
  onReply: () => void;
  onShare: () => void;
}) {
  const [quoteOpen, setQuoteOpen] = useState(false);
  return (
    <div className="tweet-actions">
      <button type="button" className="tweet-action tweet-action-reply" onClick={(event) => { event.stopPropagation(); onReply(); }} title="Reply" aria-label="Reply">
        <MessageCircle size={17} /><span>{tweet.replies}</span>
      </button>
      <span className="tweet-action-retweet-group" onMouseLeave={() => setQuoteOpen(false)}>
        <button type="button" className={`tweet-action tweet-action-retweet ${tweet.retweeted ? 'active' : ''}`} onClick={(event) => { event.stopPropagation(); onRetweet(); }} title="Repost" aria-label="Repost">
          <Repeat2 size={17} /><span>{tweet.retweets}</span>
        </button>
        <button type="button" className="tweet-action-chev" onClick={(event) => { event.stopPropagation(); setQuoteOpen((o) => !o); }} title="Repost menu" aria-label="Repost menu">
          <span className="tweet-chev">▾</span>
        </button>
        {quoteOpen && (
          <div className="tweet-quote-menu">
            <button type="button" onClick={(event) => { event.stopPropagation(); onRetweet(); setQuoteOpen(false); }}><Repeat2 size={15} />Repost</button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onQuote(); setQuoteOpen(false); }}><Pencil size={15} />Quote post</button>
          </div>
        )}
      </span>
      <button type="button" className={`tweet-action tweet-action-like ${tweet.liked ? 'active' : ''}`} onClick={(event) => { event.stopPropagation(); onLike(); }} title="Like" aria-label="Like">
        <Heart size={17} fill={tweet.liked ? 'currentColor' : 'none'} /><span>{tweet.likes}</span>
      </button>
      <span className="tweet-action-sep" />
      <button type="button" className={`tweet-action tweet-action-bookmark ${tweet.saved ? 'active' : ''}`} onClick={(event) => { event.stopPropagation(); onBookmark(); }} title="Bookmark" aria-label="Bookmark">
        <Bookmark size={17} fill={tweet.saved ? 'currentColor' : 'none'} />
      </button>
      <button type="button" className="tweet-action tweet-action-share" onClick={(event) => { event.stopPropagation(); onShare(); }} title="Copy link" aria-label="Copy link">
        <Link2 size={16} />
      </button>
    </div>
  );
}

function TweetOptionsMenu({ tweet, isOwner, onCopy, onEdit, onDelete, onMute, onBlock, onReport }: {
  tweet: Tweet;
  isOwner: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMute: () => void;
  onBlock: () => void;
  onReport: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="tweet-menu-wrap" onMouseLeave={() => setOpen(false)}>
      <button type="button" className={`tweet-menu-btn ${open ? 'open' : ''}`} title="More" aria-label="More options"
        onClick={(event) => { event.stopPropagation(); setOpen((o) => !o); }}>
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="tweet-menu">
          {isOwner ? (
            <>
              <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(false); onEdit(); }}><Pencil size={14} />Edit tweet</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(false); onCopy(); }}><Link2 size={14} />Copy link</button>
              <button type="button" className="danger" onClick={(event) => { event.stopPropagation(); setOpen(false); onDelete(); }}><Trash2 size={14} />Delete</button>
            </>
          ) : (
            <>
              <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(false); onCopy(); }}><Link2 size={14} />Copy link</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(false); onMute(); }}><VolumeX size={14} />Mute @{tweet.author.username}</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(false); onBlock(); }}><Ban size={14} />Block @{tweet.author.username}</button>
              <button type="button" className="danger" onClick={(event) => { event.stopPropagation(); setOpen(false); onReport(); }}><Flag size={14} />Report tweet</button>
            </>
          )}
        </div>
      )}
    </span>
  );
}

function TweetCard({
  tweet,
  onOpen,
  onLike,
  onRetweet,
  onQuote,
  onBookmark,
  onShare,
  onDelete,
  onAuthor,
  onTag,
  onMention,
  onReply,
  onEdit,
  onMute,
  onBlock,
  onReport,
  onMedia,
}: {
  tweet: Tweet;
  onOpen: () => void;
  onLike: () => void;
  onRetweet: () => void;
  onQuote: () => void;
  onBookmark: () => void;
  onShare: () => void;
  onDelete: () => void;
  onAuthor: () => void;
  onTag: (tag: string) => void;
  onMention: (username: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onMute: () => void;
  onBlock: () => void;
  onReport: () => void;
  onMedia?: (index: number) => void;
}) {
  const me = useAppStore((state) => state.me);
  const isOwner = me?.id === tweet.author.id;
  return (
    <article className="tweet-card">
      {tweet.retweetOfId && <div className="tweet-retweet-note"><Repeat2 size={13} /> Reposted</div>}
      <div className="tweet-card-body">
        <button type="button" className="tweet-avatar-btn" onClick={onAuthor} aria-label={`Open ${tweet.author.username}`}>
          <JaminoAvatar avatarId={tweet.author.avatarId} size={44} photo={tweet.author.avatarPhoto} name={tweet.author.username} />
        </button>
        <div className="tweet-card-content">
          <div className="tweet-card-head">
            <button type="button" className="tweet-identity" onClick={onAuthor} title={`@${tweet.author.username}`}>
              <b>{tweet.author.name || `@${tweet.author.username}`}</b>
              <span className="tweet-handle">@{tweet.author.username}</span>
            </button>
            <span className="tweet-time">· {timeAgo(tweet.createdAt)}</span>
            <TweetOptionsMenu
              tweet={tweet}
              isOwner={isOwner}
              onCopy={onShare}
              onEdit={onEdit}
              onDelete={onDelete}
              onMute={onMute}
              onBlock={onBlock}
              onReport={onReport}
            />
          </div>
          <button type="button" className="tweet-text-btn" onClick={onOpen}>
            {tweet.text && <p className="tweet-text">{renderText(tweet.text, onTag, onMention)}</p>}
          </button>
          {tweet.quoted && (
            <QuotedCard tweet={tweet.quoted} onOpen={onOpen} onAuthor={onAuthor} onTag={onTag} onMention={onMention} />
          )}
          <TweetMediaGrid tweet={tweet} onOpen={onMedia ?? (() => {})} />
          <TweetActions tweet={tweet} onLike={onLike} onRetweet={onRetweet} onQuote={onQuote} onBookmark={onBookmark} onReply={onReply} onShare={onShare} />
        </div>
      </div>
    </article>
  );
}

const autofocusClass = 'tweet-composer-textarea';

function Composer({
  onPosted,
  replyToId,
  quote,
  editTweet,
  onCancel,
  placeholder = 'What is happening?',
  compact = false,
  autoFocus = false,
}: {
  onPosted: (tweet: Tweet) => void;
  replyToId?: number;
  quote?: Tweet | null;
  editTweet?: Tweet | null;
  onCancel?: () => void;
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const me = useAppStore((state) => state.me);
  const [text, setText] = useState(editTweet?.text ?? '');
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentions, setMentions] = useState<SugUser[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mentionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = MAX_TEXT - text.length;
  const isReply = !!replyToId;

  useEffect(() => {
    return () => files.forEach((f) => URL.revokeObjectURL(f.url));
  }, [files]);

  const pickFiles = (next: FileList | null) => {
    if (!next) return;
    const added = Array.from(next).slice(0, MAX_MEDIA - files.length)
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    setFiles((current) => [...current, ...added]);
  };

  const removeFile = (index: number) => {
    const removed = files[index];
    if (removed) URL.revokeObjectURL(removed.url);
    setFiles((current) => current.filter((_, i) => i !== index));
  };

  const updateMentions = useCallback((value: string) => {
    if (mentionTimer.current) clearTimeout(mentionTimer.current);
    const caret = inputRef.current?.selectionStart ?? value.length;
    const prefix = value.slice(0, caret);
    const match = /@([A-Za-z0-9_]{1,30})$/.exec(prefix);
    if (!match || match[1].length < 2) { setMentions([]); return; }
    mentionTimer.current = setTimeout(() => {
      api<{ users: SugUser[] }>(`/api/users/search?q=${encodeURIComponent(match[1])}`)
        .then((data) => setMentions(data.users.slice(0, 5)))
        .catch(() => setMentions([]));
    }, 250);
  }, []);

  const insertMention = (username: string) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? text.length;
    const prefix = text.slice(0, caret).replace(/@([A-Za-z0-9_]{1,30})$/, `@${username} `);
    const next = prefix + text.slice(caret);
    setText(next);
    setMentions([]);
    requestAnimationFrame(() => { if (el) el.setSelectionRange(prefix.length, prefix.length); });
  };

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? text.length;
    const next = text.slice(0, caret) + emoji + text.slice(caret);
    setText(next);
    requestAnimationFrame(() => { if (el) el.setSelectionRange(caret + emoji.length, caret + emoji.length); });
  };

  const uploadFiles = async (): Promise<string[]> => {
    if (files.length === 0) return [];
    const ids: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const form = new FormData();
      form.append('file', files[i].file);
      try {
        const uploaded = await uploadWithProgress<{ asset: { id: string } }>(
          '/api/tweets/assets',
          form,
          (percent) => setProgress(Math.round(((i + percent / 100) / files.length) * 100)),
        );
        ids.push(uploaded.asset.id);
      } catch {
        throw new Error('A file failed to upload');
      }
    }
    return ids;
  };

  const canPost = !busy && (text.trim().length > 0 || files.length > 0 || mediaIds.length > 0 || !!quote);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canPost) return;
    setBusy(true);
    setProgress(null);
    try {
      let ids = mediaIds;
      if (ids.length === 0) {
        ids = await uploadFiles();
        setMediaIds(ids);
        setProgress(null);
      }
      const payload: Record<string, unknown> = {
        text: text.trim(),
        mediaIds: ids.length > 0 ? ids : undefined,
      };
      if (replyToId) payload.replyToId = replyToId;
      if (quote && !editTweet) payload.quotedTweetId = quote.id;

      if (editTweet) {
        const data = await api<{ tweet: Tweet }>(`/api/tweets/${editTweet.id}`, { method: 'PATCH', body: JSON.stringify({ text: text.trim() }) });
        onPosted(data.tweet);
        toast('Tweet updated.', 'ok');
      } else {
        const target = isReply ? `/api/tweets/${replyToId}/replies` : '/api/tweets';
        const data = await api<{ tweet: Tweet }>(target, { method: 'POST', body: JSON.stringify(payload) });
        onPosted(data.tweet);
        toast(isReply ? 'Reply posted.' : 'Your tweet is live.', 'ok');
      }
      setText('');
      setFiles((current) => { current.forEach((f) => URL.revokeObjectURL(f.url)); return []; });
      setMediaIds([]);
      setMentions([]);
    } catch (error) {
      setMediaIds([]);
      toast(error instanceof Error ? error.message : 'Could not post your tweet.', 'error');
    } finally {
      setBusy(false);
      setProgress(null);
      inputRef.current?.focus();
    }
  };

  return (
    <form className={`tweet-composer ${compact ? 'compact' : ''}`} onSubmit={submit}>
      <div className="tweet-composer-avatar">
        {me && <JaminoAvatar avatarId={me.avatarId} size={compact ? 38 : 46} photo={me.avatarPhoto} name={me.username} />}
      </div>
      <div className="tweet-composer-body">
        {editTweet && <div className="tweet-composer-note"><Pencil size={13} /> Editing your tweet — changes appear instantly.</div>}
        <textarea
          ref={inputRef}
          className={autofocusClass}
          value={text}
          onChange={(event) => { setText(event.target.value.slice(0, MAX_TEXT)); updateMentions(event.target.value); }}
          placeholder={placeholder}
          rows={compact ? 2 : 3}
          autoFocus={autoFocus}
          maxLength={MAX_TEXT}
        />
        {mentions.length > 0 && (
          <div className="tweet-mention-suggest">
            {mentions.map((user) => (
              <button type="button" key={user.id} onClick={() => insertMention(user.username)}>
                <JaminoAvatar avatarId={user.avatarId} size={26} photo={user.avatarPhoto} name={user.username} />
                <span><b>{user.name || `@${user.username}`}</b><small>@{user.username}</small></span>
                <BadgeCheck size={14} />
              </button>
            ))}
          </div>
        )}
        {quote && !editTweet && (
          <div className="tweet-quote-box">
            <QuotedCard tweet={quote} onOpen={() => {}} onAuthor={() => {}} onTag={() => {}} onMention={() => {}} />
          </div>
        )}
        {files.length > 0 && (
          <div className={`tweet-composer-previews ${files.length > 1 ? 'multi' : ''}`}>
            {files.map((item, index) => (
              <div className="tweet-composer-preview" key={index}>
                {item.file.type.startsWith('video/') ? <video src={item.url} muted playsInline /> : <img src={item.url} alt="" />}
                <button type="button" className="tweet-preview-remove" onClick={() => removeFile(index)} aria-label="Remove media"><X size={15} /></button>
              </div>
            ))}
          </div>
        )}
        {busy && progress !== null && (
          <div className="tweet-upload">
            <div className="tweet-upload-bar"><span style={{ width: `${progress}%` }} /></div>
            <small>Uploading… {progress}%</small>
          </div>
        )}
        <div className="tweet-composer-foot">
          <div className="tweet-composer-tools">
            <button type="button" className="tweet-tool" onClick={() => fileRef.current?.click()} title="Add photos or video" aria-label="Add media">
              <ImagePlus size={18} />
            </button>
            <input
              ref={fileRef}
              type="file"
              hidden
              multiple
              accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
              onChange={(event) => { pickFiles(event.target.files); event.target.value = ''; }}
            />
            <button type="button" className="tweet-tool" onClick={() => setEmojiOpen((o) => !o)} title="Emoji" aria-label="Emoji">
              <Smile size={18} />
            </button>
            <span className={`tweet-counter ${remaining < 0 ? 'danger' : remaining <= 20 ? 'warn' : ''}`}>{remaining}</span>
          </div>
          <div className="tweet-composer-post">
            {onCancel && <button type="button" className="btn btn-ghost pill-sm" onClick={onCancel}><X size={13} /> Cancel</button>}
            <button type="submit" className="btn btn-tweet" disabled={!canPost}>
              {busy ? 'Posting…' : <><Send size={14} /> {isReply ? 'Reply' : editTweet ? 'Save' : 'Post'}</>}
            </button>
          </div>
        </div>
        {emojiOpen && (
          <div className="tweet-emoji-picker">
            {EMOJIS.filter((e, i) => EMOJIS.indexOf(e) === i).map((emoji) => (
              <button type="button" key={emoji} onClick={() => insertEmoji(emoji)}>{emoji}</button>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}

function RelationshipModal({ title, username, avatarId, avatarPhoto, user, onClose, onFollowChange }: {
  title: string;
  username: string;
  avatarId: number;
  avatarPhoto: string | null;
  user: ListUser | null;
  onClose: () => void;
  onFollowChange?: () => void;
}) {
  const [users, setUsers] = useState<ListUser[]>([]);
  const [loading, setLoading] = useState(false);
  const me = useAppStore((state) => state.me);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api<{ users: ListUser[] }>(`/api/tweets/${user.id}/${title === 'Followers' ? 'followers' : 'following'}`)
      .then((data) => setUsers(data.users))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [user, title]);

  const toggleFollow = async (target: ListUser) => {
    if (target.isMe || target.isTarget) return;
    try {
      const data = await api<{ following: boolean }>(`/api/tweets/${target.id}/follow`, { method: 'POST' });
      setUsers((current) => current.map((u) => u.id === target.id ? { ...u, following: data.following } : u));
      onFollowChange?.();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update follow.', 'error');
    }
  };

  return (
    <div className="tweet-modal-backdrop" onMouseDown={onClose}>
      <section className="tweet-modal tweet-list-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="tweet-modal-head">
          <div><div className="hub-kicker">PEOPLE</div><h2>{title}</h2></div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="tweet-modal-scroll">
          <div className="tweet-list-row tweet-list-target">
            <JaminoAvatar avatarId={avatarId} size={40} photo={avatarPhoto} name={username} />
            <span><b>{username}</b><small>@{username}</small></span>
          </div>
          {loading && <div className="tweet-empty"><span className="admin-loader" /> Loading {title.toLowerCase()}…</div>}
          {!loading && users.length === 0 && <div className="tweet-empty"><UsersRound size={20} /><span>{title === 'Followers' ? 'No followers yet.' : 'Not following anyone yet.'}</span></div>}
          {users.map((u) => (
            <div className="tweet-list-row" key={u.id}>
              <span className="tweet-list-id">
                <JaminoAvatar avatarId={u.avatarId} size={40} photo={u.avatarPhoto} name={u.username} />
                <span><b>{u.name || `@${u.username}`}</b><small>@{u.username}</small></span>
              </span>
              {!u.isMe && !u.isTarget && !(me && me.id === u.id) && (
                <button type="button" className={`btn ${u.following ? 'btn-ghost' : 'btn-tweet'} pill-sm`} onClick={() => void toggleFollow(u)}>
                  {u.following ? 'Following' : 'Follow'}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function EditProfileModal({ profile, onClose, onSaved }: {
  profile: TweetProfile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile.user.name);
  const [bio, setBio] = useState(profile.user.bio);
  const [website, setWebsite] = useState(profile.user.website);
  const [location, setLocation] = useState(profile.user.location);
  const [busy, setBusy] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api('/api/tweets/profile', { method: 'PATCH', body: JSON.stringify({ name, bio, website, location }) });
      toast('Profile updated.', 'ok');
      onSaved();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not update profile.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tweet-modal-backdrop" onMouseDown={onClose}>
      <section className="tweet-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="tweet-modal-head">
          <div><div className="hub-kicker">PROFILE</div><h2>Edit profile</h2></div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <form className="tweet-modal-scroll" onSubmit={save}>
          <label className="tweet-edit-field">
            <span>Display name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={50} placeholder="Your name" />
          </label>
          <label className="tweet-edit-field">
            <span>Bio</span>
            <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={160} rows={3} placeholder="Tell people about yourself" />
          </label>
          <label className="tweet-edit-field">
            <span>Website</span>
            <input value={website} onChange={(event) => setWebsite(event.target.value)} maxLength={120} placeholder="https://…" />
          </label>
          <label className="tweet-edit-field">
            <span>Location</span>
            <input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={60} placeholder="City, country" />
          </label>
          <div className="tweet-edit-actions">
            <button type="submit" className="btn btn-tweet" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ConfirmModal({ title, message, onCancel, onConfirm }: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="tweet-modal-backdrop" onMouseDown={onCancel}>
      <section className="tweet-modal tweet-confirm-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="tweet-modal-head"><div><h2>{title}</h2></div></header>
        <div className="tweet-modal-scroll">
          <p className="tweet-confirm-copy">{message}</p>
          <div className="tweet-edit-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={onConfirm}><Trash2 size={14} /> Delete</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function NotificationsView({ onUnread, onOpenTweet, onOpenProfile }: {
  onUnread: (count: number) => void;
  onOpenTweet: (id: number) => void;
  onOpenProfile: (username: string, id?: number) => void;
}) {
  const [events, setEvents] = useState<TweetEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    api<{ events: TweetEvent[]; unread: number }>('/api/tweets/notifications')
      .then((data) => { setEvents(data.events); setUnread(data.unread); onUnread(data.unread); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [onUnread]);

  useEffect(() => { load(); }, [load]);

  const markAll = async () => {
    try {
      await api('/api/tweets/notifications', { method: 'PATCH' });
      setEvents((current) => current.map((e) => ({ ...e, readAt: new Date().toISOString() })));
      setUnread(0);
      onUnread(0);
    } catch { /* ignore */ }
  };

  const openEvent = (event: TweetEvent) => {
    if (event.tweetId) onOpenTweet(event.tweetId);
    else if (event.actor) onOpenProfile(event.actor.username, event.actor.id);
  };

  const label: Record<TweetEventType, (name: string) => string> = {
    like: (name) => `${name} liked your tweet`,
    retweet: (name) => `${name} reposted your tweet`,
    reply: (name) => `${name} replied to your tweet`,
    follow: (name) => `${name} started following you`,
    quote: (name) => `${name} quoted your tweet`,
    mention: (name) => `${name} mentioned you`,
  };
  const icon: Record<TweetEventType, typeof Heart> = { like: Heart, retweet: Repeat2, reply: MessageCircle, follow: UserIcon, quote: Pencil, mention: Smile };

  if (loading && events.length === 0) return <div className="tweet-empty large"><span className="admin-loader" /> Loading activity…</div>;
  if (error && events.length === 0) {
    return (
      <div className="tweet-empty large">
        <Bell size={26} />
        <b>Could not load notifications.</b>
        <button type="button" className="btn btn-tweet pill-sm" onClick={() => void load()}><Sparkles size={13} /> Retry</button>
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="tweet-empty large">
        <Bell size={26} />
        <b>No activity yet.</b>
        <span>Likes, reposts, replies, quotes, mentions and new followers show up here.</span>
      </div>
    );
  }
  return (
    <div className="tweet-notifications-wrap">
      <div className="tweet-notifications-top">
        {unread > 0 && <span className="tweet-unread-badge">{unread} unread</span>}
        <button type="button" className="btn btn-ghost pill-sm" onClick={() => void markAll()}><Check size={13} /> Mark all read</button>
      </div>
      <section className="tweet-notifications">
        {events.map((event) => {
          const Icon = icon[event.type];
          const name = event.actor ? `@${event.actor.username}` : 'Someone';
          return (
            <button type="button" className={`tweet-notification ${!event.readAt ? 'unread' : ''}`} key={event.id} onClick={() => openEvent(event)}>
              <span className={`tweet-notification-icon ${event.type}`}><Icon size={16} /></span>
              <JaminoAvatar avatarId={event.actor?.avatarId ?? 0} size={38} photo={event.actor?.avatarPhoto ?? null} name={event.actor?.username ?? '?'} />
              <span className="tweet-notification-copy">
                <span className="tweet-notification-text">{label[event.type](name)}</span>
                {event.tweetText && <span className="tweet-notification-quote">{event.tweetText}</span>}
                <small>{timeAgo(event.createdAt)}</small>
              </span>
            </button>
          );
        })}
      </section>
    </div>
  );
}

const ALLOWED_TABS: { id: ProfileTab; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'replies', label: 'Replies' },
  { id: 'media', label: 'Media' },
  { id: 'likes', label: 'Likes' },
];

export function TweetHub() {
  const setProduct = useAppStore((state) => state.setProduct);
  const setTab = useAppStore((state) => state.setTab);
  const me = useAppStore((state) => state.me);

  const [view, setView] = useState<TweetView>('home');
  const [feed, setFeed] = useState<Tweet[]>([]);
  const [feedError, setFeedError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [users, setUsers] = useState<SugUser[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [profileName, setProfileName] = useState('');
  const [profileTab, setProfileTab] = useState<ProfileTab>('posts');
  const [profile, setProfile] = useState<TweetProfile | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [suggestions, setSuggestions] = useState<SugUser[]>([]);
  const [activeTweet, setActiveTweet] = useState<Tweet | null>(null);
  const [replyParent, setReplyParent] = useState<Tweet | null>(null);
  const [replies, setReplies] = useState<Tweet[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [quote, setQuote] = useState<Tweet | null>(null);
  const [editTarget, setEditTarget] = useState<Tweet | null>(null);
  const [lightbox, setLightbox] = useState<{ media: TweetMedia[]; index: number } | null>(null);
  const [listModal, setListModal] = useState<{ title: string; user: ListUser } | null>(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Tweet | null>(null);
  const [reportTarget, setReportTarget] = useState<Tweet | null>(null);
  const [notifBadge, setNotifBadge] = useState(0);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);

  const loadFeed = useCallback(async (reset: boolean) => {
    if (loadingRef.current) return;
    if (!reset && !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setFeedError(false);
    try {
      const params = new URLSearchParams({ view: apiViewFor(view) });
      if (searchQuery) params.set('q', searchQuery);
      if (view === 'profile' && profileName) {
        params.set('profile', profileName);
        params.set('tab', profileTab);
      }
      if (!reset && cursorRef.current) params.set('cursor', cursorRef.current);
      const data = await api<{ tweets: Tweet[]; users?: SugUser[]; nextCursor: string | null; hasMore: boolean }>(`/api/tweets?${params}`);
      setUsers(data.users ?? []);
      setFeed((current) => {
        if (reset) return data.tweets;
        const seen = new Set(current.map((tweet) => tweet.id));
        return [...current, ...data.tweets.filter((tweet) => !seen.has(tweet.id))];
      });
      cursorRef.current = data.nextCursor;
      hasMoreRef.current = data.hasMore;
      setHasMore(data.hasMore);
    } catch (error) {
      setFeedError(true);
      if (reset) setFeed([]);
      if (feed.length > 0 && !reset) toast(error instanceof Error ? error.message : 'Could not load the feed.', 'error');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [profileName, profileTab, searchQuery, view, feed.length]);

  const reload = useCallback(() => {
    cursorRef.current = null;
    hasMoreRef.current = true;
    setHasMore(true);
    setFeed([]);
    void loadFeed(true);
  }, [loadFeed]);

  const loadSidebar = useCallback(() => {
    api<{ trends: Trend[] }>('/api/tweets/trends').then((data) => setTrends(data.trends)).catch(() => {});
    api<{ users: SugUser[] }>('/api/tweets/suggestions').then((data) => setSuggestions(data.users)).catch(() => {});
  }, []);

  useEffect(() => {
    loadSidebar();
    setRecentSearches((JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as string[]).slice(0, 8));
    try {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('tweetView') as TweetView | null;
      const username = params.get('tweetUser');
      const statusId = Number(params.get('id') ?? 0);
      if (statusId > 0) {
        api<{ tweet: Tweet; replyParent: Tweet | null }>(`/api/tweets/${statusId}`)
          .then((data) => { void openTweetFromDetail(data.tweet); })
          .catch(() => toast('This tweet is no longer available.', 'error'));
      }
      if (username) { setView('profile'); setProfileName(username); }
      else if (requested && (FEED_VIEWS.includes(requested) || requested === 'notifications')) setView(requested);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSidebar]);

  useEffect(() => {
    if (!FEED_VIEWS.includes(view)) return;
    cursorRef.current = null;
    hasMoreRef.current = true;
    setHasMore(true);
    setFeed([]);
    setFeedError(false);
    void loadFeed(true);
  }, [loadFeed, view]);

  useEffect(() => {
    if (view !== 'profile') { setProfile(null); return; }
    if (!profileName) return;
    api<{ user: TweetProfile['user']; stats: TweetProfile['stats']; following: boolean; blocked: boolean; blockedBy: boolean; muted: boolean; isMe: boolean }>(`/api/tweets/profile?username=${encodeURIComponent(profileName)}`)
      .then((data) => setProfile({ user: data.user, stats: data.stats, following: data.following, blocked: data.blocked, blockedBy: data.blockedBy, muted: data.muted, isMe: data.isMe }))
      .catch(() => setProfile(null));
  }, [profileName, view]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !FEED_VIEWS.includes(view)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void loadFeed(false);
    }, { rootMargin: '800px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadFeed, view]);

  const patchTweet = useCallback((id: number, update: Partial<Tweet>) => {
    setFeed((current) => current.map((tweet) => tweet.id === id ? { ...tweet, ...update } : tweet));
    setActiveTweet((current) => current?.id === id ? { ...current, ...update } : current);
    setReplies((current) => current.map((tweet) => tweet.id === id ? { ...tweet, ...update } : tweet));
  }, []);

  const changeView = (next: TweetView) => {
    if (view === next) return;
    setView(next);
    setSearchQuery('');
    setSearchInput('');
    setProfileTab('posts');
    const suffix = next === 'home' ? '' : `&tweetView=${next}`;
    window.history.replaceState({}, '', `/?hub=tweet${suffix}`);
  };

  const openProfile = (username: string, id?: number) => {
    if (id && me?.id === id) username = me.username;
    setView('profile');
    setProfileName(username);
    setActiveTweet(null);
    window.history.replaceState({}, '', `/?hub=tweet&tweetView=profile&tweetUser=${encodeURIComponent(username)}`);
  };

  const openTweetById = useCallback((id: number) => {
    api<{ tweet: Tweet; replyParent: Tweet | null }>(`/api/tweets/${id}`)
      .then((data) => {
        setActiveTweet(data.tweet);
        setReplyParent(data.replyParent);
        return api<{ replies: Tweet[] }>(`/api/tweets/${id}/replies`);
      })
      .then((data) => setReplies(data.replies))
      .catch(() => toast('This tweet is no longer available.', 'error'))
      .finally(() => setRepliesLoading(false));
  }, []);

  const openTweetFromDetail = async (tweet: Tweet) => {
    setActiveTweet(tweet);
    setReplyParent(null);
    setReplies([]);
    setRepliesLoading(true);
    try {
      const replyData = await api<{ replies: Tweet[] }>(`/api/tweets/${tweet.id}/replies`);
      setReplies(replyData.replies);
    } catch {
      /* keep light data */
    } finally {
      setRepliesLoading(false);
    }
  };

  const openTweet = (tweet: Tweet) => {
    setActiveTweet(tweet);
    setQuote(null);
    setEditTarget(null);
    window.history.replaceState({}, '', `/?hub=tweet&tweetView=status&id=${tweet.id}`);
    void openTweetById(tweet.id);
  };

  const closeTweet = () => {
    setActiveTweet(null);
    setReplyParent(null);
    setReplies([]);
    setQuote(null);
    setEditTarget(null);
    window.history.replaceState({}, '', '/?hub=tweet');
  };

  const runSearch = (event?: FormEvent) => {
    event?.preventDefault();
    const query = searchInput.trim();
    if (!query) return;
    setSearchQuery(query);
    setView('search');
    setRecentSearches((current) => {
      const next = [query, ...current.filter((s) => s !== query)].slice(0, 8);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
    window.history.replaceState({}, '', `/?hub=tweet&tweetView=search&q=${encodeURIComponent(query)}`);
  };

  const clearRecents = () => {
    setRecentSearches([]);
    localStorage.removeItem(RECENTS_KEY);
  };

  const searchTag = (tag: string) => {
    setSearchInput(tag);
    setSearchQuery(tag);
    setView('search');
    window.history.replaceState({}, '', `/?hub=tweet&tweetView=search&q=${encodeURIComponent(tag)}`);
  };

  // -- optimistic actions ------------------------------------------------
  const toggleLike = async (tweet: Tweet) => {
    const next = !tweet.liked;
    const delta = next ? 1 : -1;
    patchTweet(tweet.id, { liked: next, likes: Math.max(0, tweet.likes + delta) });
    try {
      const data = await api<{ liked: boolean; likes: number }>(`/api/tweets/${tweet.id}/like`, { method: 'POST' });
      patchTweet(tweet.id, { liked: data.liked, likes: data.likes });
    } catch (error) {
      patchTweet(tweet.id, { liked: tweet.liked, likes: tweet.likes });
      toast(error instanceof Error ? error.message : 'Could not update like.', 'error');
    }
  };

  const toggleRetweet = async (tweet: Tweet) => {
    const next = !tweet.retweeted;
    const delta = next ? 1 : -1;
    patchTweet(tweet.id, { retweeted: next, retweets: Math.max(0, tweet.retweets + delta) });
    try {
      const data = await api<{ retweeted: boolean; retweets: number }>(`/api/tweets/${tweet.id}/retweet`, { method: 'POST' });
      patchTweet(tweet.id, { retweeted: data.retweeted, retweets: data.retweets });
      toast(data.retweeted ? 'Reposted.' : 'Repost removed.', 'ok');
    } catch (error) {
      patchTweet(tweet.id, { retweeted: tweet.retweeted, retweets: tweet.retweets });
      toast(error instanceof Error ? error.message : 'Could not repost.', 'error');
    }
  };

  const toggleBookmark = async (tweet: Tweet) => {
    const next = !tweet.saved;
    patchTweet(tweet.id, { saved: next });
    try {
      const data = await api<{ saved: boolean }>(`/api/tweets/${tweet.id}/bookmark`, { method: 'POST' });
      patchTweet(tweet.id, { saved: data.saved });
    } catch (error) {
      patchTweet(tweet.id, { saved: tweet.saved });
      toast(error instanceof Error ? error.message : 'Could not update bookmark.', 'error');
    }
  };

  const toggleFollow = async (userId: number) => {
    const prevProfile = profile;
    if (prevProfile && prevProfile.user.id === userId) {
      const next = !prevProfile.following;
      setProfile({ ...prevProfile, following: next, stats: { ...prevProfile.stats, followers: Math.max(0, prevProfile.stats.followers + (next ? 1 : -1)) } });
    }
    try {
      const data = await api<{ following: boolean }>(`/api/tweets/${userId}/follow`, { method: 'POST' });
      if (prevProfile && prevProfile.user.id === userId) {
        setProfile((current) => current
          ? { ...current, following: data.following, stats: { ...current.stats, followers: Math.max(0, prevProfile.stats.followers + (data.following ? 1 : 0)) } }
          : current);
      }
      setSuggestions((current) => data.following ? current.filter((user) => user.id !== userId) : current);
      toast(data.following ? 'Following.' : 'Unfollowed.', 'ok');
    } catch (error) {
      if (prevProfile && prevProfile.user.id === userId) setProfile(prevProfile);
      toast(error instanceof Error ? error.message : 'Could not update follow.', 'error');
    }
  };

  const deleteTweet = async (tweet: Tweet) => {
    setConfirmDelete(null);
    try {
      await api(`/api/tweets/${tweet.id}`, { method: 'DELETE' });
      setFeed((current) => current.filter((item) => item.id !== tweet.id));
      setReplies((current) => current.filter((item) => item.id !== tweet.id));
      if (activeTweet?.id === tweet.id) closeTweet();
      toast('Tweet deleted.', 'ok');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not delete this tweet.', 'error');
    }
  };

  const copyLink = async (tweet: Tweet) => {
    const url = `${window.location.origin}/?hub=tweet&tweetView=status&id=${tweet.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied to clipboard.', 'ok');
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  const muteUser = async (tweet: Tweet) => {
    try {
      await api(`/api/tweets/${tweet.author.id}/mute`, { method: 'POST' });
      setFeed((current) => current.filter((item) => item.author.id !== tweet.author.id));
      toast(`Muted @${tweet.author.username}. Their posts are hidden from your feeds.`, 'ok');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not mute this user.', 'error');
    }
  };

  const blockUser = async (tweet: Tweet) => {
    try {
      await api(`/api/tweets/${tweet.author.id}/block`, { method: 'POST' });
      if (profile && profile.user.id === tweet.author.id) setProfile({ ...profile, blocked: true, following: false });
      setFeed((current) => current.filter((item) => item.author.id !== tweet.author.id));
      setReplies((current) => current.filter((item) => item.author.id !== tweet.author.id));
      if (activeTweet?.author.id === tweet.author.id) closeTweet();
      toast(`Blocked @${tweet.author.username}.`, 'ok');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not block this user.', 'error');
    }
  };

  const submitReport = async (category: string) => {
    if (!reportTarget) return;
    try {
      await api(`/api/tweets/${reportTarget.id}/report`, { method: 'POST', body: JSON.stringify({ reason: category }) });
      toast('Thanks — our team will review this report.', 'ok');
      setReportTarget(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not submit the report.', 'error');
    }
  };

  const openQuote = (tweet: Tweet) => {
    setQuote(tweet);
    setEditTarget(null);
  };

  const startEdit = (tweet: Tweet) => {
    setEditTarget(tweet);
    setQuote(null);
  };

  const onComposerPosted = (tweet: Tweet) => {
    if (view === 'home' || view === 'profile' || view === 'following') setFeed((current) => [tweet, ...current.filter((item) => item.id !== tweet.id)]);
    if (editTarget) setEditTarget(null);
    if (quote) setQuote(null);
  };

  const onReplyPosted = (reply: Tweet) => {
    if (!activeTweet) return;
    setReplies((current) => [reply, ...current.filter((item) => item.id !== reply.id)]);
    patchTweet(activeTweet.id, { replies: activeTweet.replies + 1 });
  };

  const pageTitle = useMemo(() => {
    if (view === 'home') return 'Home';
    if (view === 'explore') return 'Explore';
    if (view === 'following') return 'Following';
    if (view === 'bookmarks') return 'Bookmarks';
    if (view === 'notifications') return 'Notifications';
    if (view === 'search') return searchQuery ? `Results for “${searchQuery}”` : 'Search';
    if (view === 'profile') return profileName ? `@${profileName}` : 'Profile';
    return 'Tweet Hub';
  }, [profileName, searchQuery, view]);

  const nav: { id: TweetView; label: string; icon: typeof Bird; badge?: number }[] = [
    { id: 'home', label: 'Home', icon: Bird },
    { id: 'explore', label: 'Explore', icon: Search },
    { id: 'following', label: 'Following', icon: UsersRound },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: notifBadge },
    { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
  ];

  return (
    <div className="hub-shell hub-shell-tweet tweet-hub-root">
      <WorkspaceTopbar onHome={() => setProduct('home')} product="Tweet Hub" />
      <div className="tweet-hub-layout">
        <aside className="tweet-hub-sidebar">
          <div className="tweet-hub-brand">
            <span className="hub-empty-icon"><Bird size={22} /></span>
            <div><b>Tweet Hub</b><small>Post · Follow · Trend</small></div>
          </div>
          <nav>
            {nav.map(({ id, label, icon: Icon, badge }) => (
              <button type="button" key={id} className={view === id ? 'active' : ''} onClick={() => id === 'notifications' ? changeView('notifications') : changeView(id)}>
                <Icon size={17} />
                <span>{label}</span>
                {badge ? badge > 0 && <em className="tweet-nav-badge">{badge > 99 ? '99+' : badge}</em> : null}
              </button>
            ))}
            <button type="button" className={view === 'profile' ? 'active' : ''} onClick={() => me && openProfile(me.username, me.id)}>
              <UserIcon size={17} /><span>Profile</span>
            </button>
          </nav>
          <button type="button" className="btn btn-tweet tweet-hub-post" onClick={() => { setQuote(null); setEditTarget(null); if (view !== 'home') changeView('home'); document.querySelector<HTMLTextAreaElement>('.tweet-composer-textarea')?.focus(); }}>
            <Bird size={16} /> Post
          </button>
          <button type="button" className="tweet-hub-jam-link" onClick={() => { setProduct('community'); setTab('jams'); }}>
            <UsersRound size={15} /> Open Community
          </button>
        </aside>

        <main className="tweet-hub-main">
          <header className="tweet-hub-heading">
            <div className="tweet-hub-heading-copy">
              {view === 'profile' && <button type="button" className="tweet-back" onClick={() => { changeView('home'); }}><ArrowLeft size={16} /> Back</button>}
              <div className="hub-kicker">TWEET HUB · CONNECTED TO JAMINO</div>
              <h1>{pageTitle}</h1>
            </div>
            <div className="hub-heading-actions">
              <button type="button" className="btn btn-ghost pill-sm" onClick={reload}><Sparkles size={14} /> Refresh</button>
            </div>
          </header>

          {(view === 'explore' || view === 'search') && (
            <form className="tweet-search" onSubmit={runSearch}>
              <Search size={17} />
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search tweets, @people and #topics" maxLength={120} />
              <button type="submit" className="btn btn-tweet pill-sm">Search</button>
            </form>
          )}

          {view === 'home' && !editTarget && !quote && (
            <Composer onPosted={onComposerPosted} placeholder={quote ? 'Add a comment…' : 'What is happening?'} />
          )}
          {view === 'home' && (editTarget || quote) && (
            <Composer
              key={`composer-${editTarget?.id ?? quote?.id ?? 'new'}`}
              onPosted={onComposerPosted}
              editTweet={editTarget}
              quote={quote}
              onCancel={() => { setEditTarget(null); setQuote(null); }}
              placeholder="What is happening?"
              autoFocus
            />
          )}

          {view === 'search' && !searchQuery && (
            <section className="tweet-rail-card tweet-recent">
              <div className="tweet-recent-head"><h3><Search size={15} /> Recent searches</h3>{recentSearches.length > 0 && <button type="button" className="btn btn-ghost pill-sm" onClick={clearRecents}><X size={12} /> Clear</button>}</div>
              {recentSearches.length === 0 ? (
                <p className="tweet-rail-empty">Search for tweets, people and hashtags.</p>
              ) : (
                recentSearches.map((term) => (
                  <button type="button" className="tweet-trend" key={term} onClick={() => { setSearchInput(term); setSearchQuery(term); setView('search'); }}>
                    <span className="tweet-trend-tag" style={{ fontWeight: 500 }}>{term.startsWith('#') || term.startsWith('@') ? term : `“${term}”`}</span>
                  </button>
                ))
              )}
            </section>
          )}

          {view === 'profile' && profile && (
            <section className="tweet-profile-head">
              {profile.user.bannerPhoto ? (
                <div className="tweet-profile-art" style={{ backgroundImage: `url(${profile.user.bannerPhoto})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              ) : (
                <div className="tweet-profile-art" />
              )}
              <div className="tweet-profile-body">
                <div className="tweet-profile-avatar">
                  <JaminoAvatar avatarId={profile.user.avatarId} size={84} photo={profile.user.avatarPhoto} name={profile.user.username} />
                </div>
                <div className="tweet-profile-actions">
                  {profile.isMe ? (
                    <button type="button" className="btn btn-ghost pill-sm" onClick={() => setEditProfileOpen(true)}><Pencil size={13} /> Edit profile</button>
                  ) : profile.blockedBy ? (
                    <span className="tweet-block-note"><Ban size={13} /> You are blocked</span>
                  ) : (
                    <button type="button" className={`btn ${profile.following ? 'btn-ghost' : 'btn-tweet'} pill-sm`} onClick={() => void toggleFollow(profile.user.id)}>
                      {profile.following ? 'Following' : <><BadgeCheck size={14} /> Follow</>}
                    </button>
                  )}
                </div>
                <div className="tweet-profile-name">
                  <h2>{profile.user.name || `@${profile.user.username}`}</h2>
                  <span className="tweet-handle-large">@{profile.user.username}</span>
                  {profile.user.bio && <p>{profile.user.bio}</p>}
                  <p className="tweet-profile-meta">
                    {profile.user.location && <span><MapPin size={13} /> {profile.user.location}</span>}
                    {profile.user.website && <span><Globe size={13} /> <a href={profile.user.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{profile.user.website.replace(/^https?:\/\//, '')}</a></span>}
                    <span><Calendar size={13} /> Joined {new Date(profile.user.joinedAt).toLocaleDateString()}</span>
                  </p>
                </div>
                <div className="tweet-profile-stats">
                  {ALLOWED_TABS.map((tab) => (
                    <button key={tab.id} className={`tweet-stat-btn ${profileTab === tab.id ? 'active' : ''}`} onClick={() => { setProfileTab(tab.id); setFeed([]); }}>
                      <b>{profile.stats[tab.id === 'posts' ? 'tweets' : tab.id === 'replies' ? 'replies' : tab.id === 'media' ? 'media' : 'likes']}</b> {tab.label}
                    </button>
                  ))}
                  <span className="tweet-stat-sep" />
                  <button type="button" className="tweet-stat-btn" onClick={() => setListModal({ title: 'Following', user: { id: profile.user.id, username: profile.user.username, avatarId: profile.user.avatarId, avatarPhoto: profile.user.avatarPhoto, bio: '', tweets: 0, followersCount: 0, following: false, isMe: false, isTarget: true } })}>
                    <b>{profile.stats.following}</b> Following
                  </button>
                  <button type="button" className="tweet-stat-btn" onClick={() => setListModal({ title: 'Followers', user: { id: profile.user.id, username: profile.user.username, avatarId: profile.user.avatarId, avatarPhoto: profile.user.avatarPhoto, bio: '', tweets: 0, followersCount: 0, following: false, isMe: false, isTarget: true } })}>
                    <b>{profile.stats.followers}</b> Followers
                  </button>
                </div>
              </div>
            </section>
          )}

          {view === 'explore' && (
            <section className="tweet-explore-banner">
              <TrendingUp size={26} />
              <div>
                <div className="hub-kicker">TRENDING NOW</div>
                <h2>See what the community is talking about.</h2>
                <p>Search by topic, tap a hashtag, or follow someone new to shape your timeline.</p>
              </div>
            </section>
          )}

          {view === 'notifications' ? (
            <NotificationsView onUnread={setNotifBadge} onOpenTweet={openTweetById} onOpenProfile={openProfile} />
          ) : (
            <section className="tweet-feed">
              {view === 'search' && searchQuery && users.length > 0 && (
                <section className="tweet-rail-card tweet-user-results">
                  <h3><UsersRound size={15} /> People</h3>
                  {users.map((user) => (
                    <div className="tweet-suggestion" key={user.id}>
                      <button type="button" className="tweet-suggestion-id" onClick={() => openProfile(user.username, user.id)}>
                        <JaminoAvatar avatarId={user.avatarId} size={38} photo={user.avatarPhoto} name={user.username} />
                        <span><b>{user.name || `@${user.username}`}</b><small>@{user.username} · {user.followers} {user.followers === 1 ? 'follower' : 'followers'}</small></span>
                      </button>
                      {me?.id !== user.id && (
                        <button type="button" className="btn btn-tweet pill-sm" onClick={() => null}>Follow</button>
                      )}
                    </div>
                  ))}
                </section>
              )}
              {loading && feed.length === 0 && (
                <div className="tweet-loading">
                  {[1, 2, 3, 4].map((item) => <div className="tweet-skeleton" key={item} />)}
                </div>
              )}
              {!loading && feedError && feed.length === 0 && (
                <div className="tweet-empty large">
                  <ShieldAlert size={26} />
                  <b>Could not load the feed.</b>
                  <span>Check your connection and try again.</span>
                  <button type="button" className="btn btn-tweet pill-sm" onClick={reload}><Sparkles size={13} /> Retry</button>
                </div>
              )}
              {!loading && !feedError && feed.length === 0 && (
                <div className="tweet-empty large">
                  <Bird size={26} />
                  <b>
                    {view === 'bookmarks' ? 'No bookmarks yet.' : view === 'following' ? 'Follow people to fill this feed.' : view === 'search' ? 'No tweets matched your search.' : view === 'profile' ? (profile && profile.blockedBy ? 'You are blocked from viewing this profile.' : 'No tweets here yet.') : 'The timeline is quiet.'}
                  </b>
                  <span>
                    {view === 'bookmarks' ? 'Tap the bookmark icon on any tweet to keep it here.' : view === 'following' ? 'Follow a few accounts and their posts will land here.' : 'Be the first to post something.'}
                  </span>
                  {view === 'home' && <span className="tweet-empty-badge"><Sparkles size={13} /> Compose your first tweet above</span>}
                </div>
              )}
              {feed.map((tweet) => (
                <TweetCard
                  key={tweet.id}
                  tweet={tweet}
                  onOpen={() => openTweet(tweet)}
                  onLike={() => void toggleLike(tweet)}
                  onRetweet={() => void toggleRetweet(tweet)}
                  onQuote={() => openQuote(tweet)}
                  onBookmark={() => void toggleBookmark(tweet)}
                  onShare={() => void copyLink(tweet)}
                  onDelete={() => setConfirmDelete(tweet)}
                  onAuthor={() => openProfile(tweet.author.username, tweet.author.id)}
                  onTag={searchTag}
                  onMention={openProfile}
                  onReply={() => openTweet(tweet)}
                  onEdit={() => startEdit(tweet)}
                  onMute={() => void muteUser(tweet)}
                  onBlock={() => void blockUser(tweet)}
                  onReport={() => setReportTarget(tweet)}
                  onMedia={(index) => setLightbox({ media: tweet.media, index })}
                />
              ))}
              <div ref={sentinelRef} className="tweet-feed-sentinel">
                {loading && feed.length > 0 && <span className="admin-loader" />}
                {!hasMore && feed.length > 0 && <span>You are all caught up</span>}
              </div>
            </section>
          )}
        </main>

        <aside className="tweet-hub-rail">
          <form className="tweet-rail-search" onSubmit={runSearch}>
            <Search size={15} />
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search Tweet Hub" maxLength={120} />
          </form>
          <section className="tweet-rail-card">
            <h3><TrendingUp size={15} /> Trends for you</h3>
            {trends.length === 0 && <p className="tweet-rail-empty">No trends yet — start one with a #hashtag.</p>}
            {trends.map((trend) => (
              <button type="button" className="tweet-trend" key={trend.tag} onClick={() => searchTag(`#${trend.tag}`)}>
                <span className="tweet-trend-tag"><Hash size={13} />{trend.tag}</span>
                <small>{trend.count} {trend.count === 1 ? 'tweet' : 'tweets'}</small>
              </button>
            ))}
          </section>
          <section className="tweet-rail-card">
            <h3><UsersRound size={15} /> Who to follow</h3>
            {suggestions.length === 0 && <p className="tweet-rail-empty">You are following everyone we could find.</p>}
            {suggestions.map((user) => (
              <div className="tweet-suggestion" key={user.id}>
                <button type="button" className="tweet-suggestion-id" onClick={() => openProfile(user.username, user.id)}>
                  <JaminoAvatar avatarId={user.avatarId} size={38} photo={user.avatarPhoto} name={user.username} />
                  <span><b>{user.name || `@${user.username}`}</b><small>{user.followers} followers</small></span>
                </button>
                {me?.id !== user.id && (
                  <button type="button" className="btn btn-tweet pill-sm" onClick={() => void toggleFollow(user.id)}>Follow</button>
                )}
              </div>
            ))}
          </section>
          <p className="tweet-rail-note">Tweet Hub shares your Jamino account and identity across every hub.</p>
        </aside>
      </div>

      <nav className="hub-mobile-nav tweet-mobile-nav">
        <button type="button" onClick={() => setProduct('home')} aria-label="Hub home"><Bird size={17} /><span>Hubs</span></button>
        {nav.slice(0, 4).map(({ id, label, icon: Icon, badge }) => (
          <button type="button" key={id} className={view === id ? 'active' : ''} onClick={() => changeView(id)}>
            <Icon size={17} /><span>{label}</span>
            {badge ? badge > 0 && <em className="tweet-nav-badge">{badge > 99 ? '99+' : badge}</em> : null}
          </button>
        ))}
      </nav>

      {lightbox && (
        <div className="tweet-lightbox" onMouseDown={() => setLightbox(null)}>
          <button type="button" className="btn-icon tweet-lightbox-close" onClick={() => setLightbox(null)} aria-label="Close"><X size={20} /></button>
          {lightbox.media.length > 1 && (
            <>
              <button type="button" className="tweet-lightbox-nav prev" onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, index: (lightbox.index - 1 + lightbox.media.length) % lightbox.media.length }); }} aria-label="Previous">‹</button>
              <button type="button" className="tweet-lightbox-nav next" onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.media.length }); }} aria-label="Next">›</button>
            </>
          )}
          <div className="tweet-lightbox-media" onMouseDown={(e) => e.stopPropagation()}>
            {lightbox.media[lightbox.index].mime.startsWith('video/') ? (
              <video src={lightbox.media[lightbox.index].url} controls autoPlay playsInline />
            ) : (
              <img src={lightbox.media[lightbox.index].url} alt="" />
            )}
          </div>
        </div>
      )}

      {activeTweet && (
        <div className="tweet-modal-backdrop" onMouseDown={closeTweet}>
          <section className="tweet-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="tweet-modal-head">
              <div><div className="hub-kicker">TWEET</div><h2>Conversation</h2></div>
              <button type="button" className="btn-icon" onClick={closeTweet} aria-label="Close"><X size={18} /></button>
            </header>
            <div className="tweet-modal-scroll">
              {replyParent && (
                <div className="tweet-reply-parent">
                  <span className="tweet-reply-line" />
                  <button type="button" className="tweet-identity" onClick={() => openProfile(replyParent.author.username, replyParent.author.id)}>
                    <b>{replyParent.author.name || `@${replyParent.author.username}`}</b>
                  </button>
                  <p>{renderText(replyParent.text, searchTag, openProfile)}</p>
                </div>
              )}
              {quote && (
                <div className="tweet-quote-box-static">
                  <QuotedCard tweet={quote} onOpen={() => {}} onAuthor={() => {}} onTag={searchTag} onMention={openProfile} />
                </div>
              )}
              <div className="tweet-modal-primary">
                <div className="tweet-card-head">
                  <button type="button" className="tweet-identity" onClick={() => openProfile(activeTweet.author.username, activeTweet.author.id)}>
                    <b>{activeTweet.author.name || `@${activeTweet.author.username}`}</b>
                    <span className="tweet-handle">@{activeTweet.author.username}</span>
                  </button>
                  <span className="tweet-time">· {timeAgo(activeTweet.createdAt)}</span>
                  <TweetOptionsMenu
                    tweet={activeTweet}
                    isOwner={me?.id === activeTweet.author.id}
                    onCopy={() => void copyLink(activeTweet)}
                    onEdit={() => { startEdit(activeTweet); closeTweet(); }}
                    onDelete={() => setConfirmDelete(activeTweet)}
                    onMute={() => void muteUser(activeTweet)}
                    onBlock={() => void blockUser(activeTweet)}
                    onReport={() => setReportTarget(activeTweet)}
                  />
                </div>
                {activeTweet.text && <p className="tweet-modal-text">{renderText(activeTweet.text, searchTag, openProfile)}</p>}
                <TweetMediaGrid tweet={activeTweet} onOpen={(index) => setLightbox({ media: activeTweet.media, index })} />
                {activeTweet.quoted && (
                  <QuotedCard tweet={activeTweet.quoted} onOpen={() => openTweet(activeTweet.quoted!)} onAuthor={() => openProfile(activeTweet.quoted!.author.username, activeTweet.quoted!.author.id)} onTag={searchTag} onMention={openProfile} />
                )}
                <TweetActions tweet={activeTweet} onLike={() => void toggleLike(activeTweet)} onRetweet={() => void toggleRetweet(activeTweet)} onQuote={() => openQuote(activeTweet)} onBookmark={() => void toggleBookmark(activeTweet)} onReply={() => {}} onShare={() => void copyLink(activeTweet)} />
                <div className="tweet-modal-meta">
                  <span>{new Date(activeTweet.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
              </div>
              {!editTarget && (
                <Composer compact autoFocus replyToId={activeTweet.id} placeholder="Post your reply" onPosted={onReplyPosted} />
              )}
              <div className="tweet-replies">
                {repliesLoading && <div className="tweet-empty"><span className="admin-loader" /> Loading replies…</div>}
                {!repliesLoading && replies.length === 0 && <div className="tweet-empty"><MessageCircle size={20} /><span>No replies yet. Start the conversation.</span></div>}
                {replies.map((reply) => (
                  <TweetCard
                    key={reply.id}
                    tweet={reply}
                    onOpen={() => openTweet(reply)}
                    onLike={() => void toggleLike(reply)}
                    onRetweet={() => void toggleRetweet(reply)}
                    onQuote={() => openQuote(reply)}
                    onBookmark={() => void toggleBookmark(reply)}
                    onShare={() => void copyLink(reply)}
                    onDelete={() => setConfirmDelete(reply)}
                    onAuthor={() => openProfile(reply.author.username, reply.author.id)}
                    onTag={searchTag}
                    onMention={openProfile}
                    onReply={() => openTweet(reply)}
                    onEdit={() => startEdit(reply)}
                    onMute={() => void muteUser(reply)}
                    onBlock={() => void blockUser(reply)}
                    onReport={() => setReportTarget(reply)}
                    onMedia={(index) => setLightbox({ media: reply.media, index })}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {listModal && (
        <RelationshipModal
          title={listModal.title}
          username={listModal.user.username}
          avatarId={listModal.user.avatarId}
          avatarPhoto={listModal.user.avatarPhoto}
          user={listModal.user}
          onClose={() => setListModal(null)}
          onFollowChange={() => { if (view === 'profile' && profileName) { /* refresh profile counts */ } }}
        />
      )}

      {editProfileOpen && profile && (
        <EditProfileModal profile={profile} onClose={() => setEditProfileOpen(false)} onSaved={() => { setEditProfileOpen(false); reload(); }} />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete this tweet?"
          message="This also removes its replies and reposts. This cannot be undone."
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void deleteTweet(confirmDelete)}
        />
      )}

      {reportTarget && (
        <div className="tweet-modal-backdrop" onMouseDown={() => setReportTarget(null)}>
          <section className="tweet-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="tweet-modal-head">
              <div><div className="hub-kicker">REPORT</div><h2>Report tweet</h2></div>
              <button type="button" className="btn-icon" onClick={() => setReportTarget(null)} aria-label="Close"><X size={18} /></button>
            </header>
            <div className="tweet-modal-scroll">
              <p className="tweet-report-copy">Why are you reporting this tweet? Our moderation team will review it.</p>
              {REPORT_REASONS.map((reason) => (
                <button type="button" className="tweet-report-reason" key={reason.id} onClick={() => void submitReport(reason.id)}>
                  <Flag size={14} /> {reason.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}