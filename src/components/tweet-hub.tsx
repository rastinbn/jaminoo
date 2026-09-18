'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  Bird,
  Bookmark,
  Hash,
  Heart,
  ImagePlus,
  MessageCircle,
  Repeat2,
  Search,
  Send,
  Sparkles,
  Trash2,
  TrendingUp,
  User as UserIcon,
  UsersRound,
  X,
} from 'lucide-react';
import { api } from '@/lib/client-api';
import { toast } from '@/components/toast';
import { JaminoAvatar } from '@/components/jamino-avatar';
import { useAppStore } from '@/store/app-store';
import { WorkspaceTopbar } from '@/components/hub-gateway';

type TweetView = 'home' | 'explore' | 'following' | 'bookmarks' | 'notifications' | 'profile' | 'search';

interface TweetAuthor {
  id: number;
  username: string;
  avatarId: number;
  avatarPhoto: string | null;
  bio: string;
}

interface Tweet {
  id: number;
  text: string;
  mediaAssetId: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  replyToId: number | null;
  retweetOfId: number | null;
  createdAt: string;
  author: TweetAuthor;
  likes: number;
  retweets: number;
  replies: number;
  liked: boolean;
  saved: boolean;
  retweeted: boolean;
}

interface TweetProfile {
  user: TweetAuthor & { joinedAt: string };
  stats: { tweets: number; following: number; followers: number; likedCount: number };
  following: boolean;
  isMe: boolean;
}

interface Trend {
  tag: string;
  count: number;
}

interface SuggestedUser {
  id: number;
  username: string;
  avatarId: number;
  avatarPhoto: string | null;
  bio: string;
  tweets: number;
  followers: number;
}

interface TweetEvent {
  type: 'like' | 'retweet' | 'reply' | 'follow';
  actor: TweetAuthor;
  tweetId: number | null;
  tweetText: string;
  createdAt: string;
}

const FEED_VIEWS: TweetView[] = ['home', 'explore', 'following', 'bookmarks', 'profile', 'search'];

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

function renderText(text: string, onTag?: (tag: string) => void) {
  return text.split(/(\s+)/).map((part, index) => {
    if (part.startsWith('#') && part.length > 1) {
      return (
        <button type="button" key={index} className="tweet-inline-link" onClick={(event) => { event.stopPropagation(); onTag?.(part); }}>
          {part}
        </button>
      );
    }
    if (part.startsWith('@') && part.length > 1) {
      return <span key={index} className="tweet-inline-mention">{part}</span>;
    }
    return part;
  });
}

function TweetMedia({ tweet, onOpen }: { tweet: Tweet; onOpen?: () => void }) {
  if (!tweet.mediaUrl) return null;
  if (tweet.mediaMime?.startsWith('video/')) {
    return <div className="tweet-media tweet-media-video"><video src={tweet.mediaUrl} controls playsInline preload="metadata" /></div>;
  }
  return <button type="button" className="tweet-media tweet-media-image" onClick={onOpen}><img src={tweet.mediaUrl} alt="" loading="lazy" /></button>;
}

function TweetActions({
  tweet,
  onLike,
  onRetweet,
  onBookmark,
  onReply,
}: {
  tweet: Tweet;
  onLike: () => void;
  onRetweet: () => void;
  onBookmark: () => void;
  onReply: () => void;
}) {
  return (
    <div className="tweet-actions">
      <button type="button" className="tweet-action tweet-action-reply" onClick={(event) => { event.stopPropagation(); onReply(); }} title="Reply">
        <MessageCircle size={17} /><span>{tweet.replies}</span>
      </button>
      <button type="button" className={`tweet-action tweet-action-retweet ${tweet.retweeted ? 'active' : ''}`} onClick={(event) => { event.stopPropagation(); onRetweet(); }} title="Retweet">
        <Repeat2 size={17} /><span>{tweet.retweets}</span>
      </button>
      <button type="button" className={`tweet-action tweet-action-like ${tweet.liked ? 'active' : ''}`} onClick={(event) => { event.stopPropagation(); onLike(); }} title="Like">
        <Heart size={17} fill={tweet.liked ? 'currentColor' : 'none'} /><span>{tweet.likes}</span>
      </button>
      <button type="button" className={`tweet-action tweet-action-bookmark ${tweet.saved ? 'active' : ''}`} onClick={(event) => { event.stopPropagation(); onBookmark(); }} title="Bookmark">
        <Bookmark size={17} fill={tweet.saved ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

function TweetCard({
  tweet,
  onOpen,
  onLike,
  onRetweet,
  onBookmark,
  onDelete,
  onAuthor,
  onTag,
  onReply,
}: {
  tweet: Tweet;
  onOpen: () => void;
  onLike: () => void;
  onRetweet: () => void;
  onBookmark: () => void;
  onDelete: () => void;
  onAuthor: () => void;
  onTag: (tag: string) => void;
  onReply: () => void;
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
            <button type="button" className="tweet-identity" onClick={onAuthor}>
              <b>@{tweet.author.username}</b>
            </button>
            <span className="tweet-time">· {timeAgo(tweet.createdAt)}</span>
            {isOwner && <button type="button" className="tweet-delete" onClick={(event) => { event.stopPropagation(); onDelete(); }} title="Delete tweet"><Trash2 size={15} /></button>}
          </div>
          <button type="button" className="tweet-text-btn" onClick={onOpen}>
            {tweet.text && <p className="tweet-text">{renderText(tweet.text, onTag)}</p>}
          </button>
          <TweetMedia tweet={tweet} onOpen={onOpen} />
          <TweetActions tweet={tweet} onLike={onLike} onRetweet={onRetweet} onBookmark={onBookmark} onReply={onReply} />
        </div>
      </div>
    </article>
  );
}

function Composer({
  onPosted,
  replyToId,
  placeholder = 'What is happening?',
  compact = false,
  autoFocus = false,
}: {
  onPosted: (tweet: Tweet) => void;
  replyToId?: number;
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const me = useAppStore((state) => state.me);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const remaining = 280 - text.length;

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = (next: File | null) => {
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || (!text.trim() && !file)) return;
    setBusy(true);
    try {
      let mediaAssetId = '';
      if (file) {
        const form = new FormData();
        form.append('file', file);
        const uploaded = await api<{ asset: { id: string } }>('/api/tweets/assets', { method: 'POST', body: form });
        mediaAssetId = uploaded.asset.id;
      }
      const payload: Record<string, unknown> = { text, mediaAssetId };
      if (replyToId) payload.replyToId = replyToId;
      const data = await api<{ tweet: Tweet }>('/api/tweets', { method: 'POST', body: JSON.stringify(payload) });
      onPosted(data.tweet);
      setText('');
      pick(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not post your tweet.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={`tweet-composer ${compact ? 'compact' : ''}`} onSubmit={submit}>
      <div className="tweet-composer-avatar">
        {me && <JaminoAvatar avatarId={me.avatarId} size={compact ? 38 : 46} photo={me.avatarPhoto} name={me.username} />}
      </div>
      <div className="tweet-composer-body">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, 280))}
          placeholder={placeholder}
          rows={compact ? 2 : 3}
          autoFocus={autoFocus}
          maxLength={280}
        />
        {preview && (
          <div className="tweet-composer-preview">
            {file?.type.startsWith('video/') ? <video src={preview} controls playsInline /> : <img src={preview} alt="" />}
            <button type="button" className="tweet-preview-remove" onClick={() => pick(null)} aria-label="Remove media"><X size={15} /></button>
          </div>
        )}
        <div className="tweet-composer-foot">
          <div className="tweet-composer-tools">
            <button type="button" className="tweet-tool" onClick={() => inputRef.current?.click()} title="Add photo or video"><ImagePlus size={18} /></button>
            <input
              ref={inputRef}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
              onChange={(event) => pick(event.target.files?.[0] ?? null)}
            />
            <span className={`tweet-counter ${remaining < 0 ? 'danger' : remaining <= 20 ? 'warn' : ''}`}>{remaining}</span>
          </div>
          <button type="submit" className="btn btn-tweet" disabled={busy || (!text.trim() && !file)}>
            {busy ? 'Posting…' : <><Send size={14} /> {replyToId ? 'Reply' : 'Post'}</>}
          </button>
        </div>
      </div>
    </form>
  );
}

function NotificationsView() {
  const [events, setEvents] = useState<TweetEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<{ events: TweetEvent[] }>('/api/tweets/notifications')
      .then((data) => setEvents(data.events))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  const label: Record<TweetEvent['type'], string> = {
    like: 'liked your tweet',
    retweet: 'reposted your tweet',
    reply: 'replied to your tweet',
    follow: 'started following you',
  };
  const icon: Record<TweetEvent['type'], typeof Heart> = { like: Heart, retweet: Repeat2, reply: MessageCircle, follow: UserIcon };

  if (loading) return <div className="tweet-empty"><span className="admin-loader" /> Loading activity…</div>;
  if (events.length === 0) {
    return (
      <div className="tweet-empty large">
        <Bell size={26} />
        <b>No activity yet.</b>
        <span>Likes, reposts, replies and new followers will show up here.</span>
      </div>
    );
  }
  return (
    <section className="tweet-notifications">
      {events.map((event, index) => {
        const Icon = icon[event.type];
        return (
          <div className="tweet-notification" key={`${event.type}-${event.createdAt}-${index}`}>
            <span className={`tweet-notification-icon ${event.type}`}><Icon size={16} /></span>
            <JaminoAvatar avatarId={event.actor.avatarId} size={38} photo={event.actor.avatarPhoto} name={event.actor.username} />
            <div>
              <p><b>@{event.actor.username}</b> {label[event.type]}</p>
              {event.tweetText && <span className="tweet-notification-quote">{event.tweetText}</span>}
              <small>{timeAgo(event.createdAt)}</small>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function TweetHub() {
  const setProduct = useAppStore((state) => state.setProduct);
  const setTab = useAppStore((state) => state.setTab);
  const me = useAppStore((state) => state.me);

  const [view, setView] = useState<TweetView>('home');
  const [feed, setFeed] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profile, setProfile] = useState<TweetProfile | null>(null);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedUser[]>([]);
  const [activeTweet, setActiveTweet] = useState<Tweet | null>(null);
  const [replyParent, setReplyParent] = useState<Tweet | null>(null);
  const [replies, setReplies] = useState<Tweet[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(true);

  const loadFeed = useCallback(async (reset: boolean) => {
    if (loadingRef.current) return;
    if (!reset && !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const params = new URLSearchParams({ view: apiViewFor(view) });
      if (searchQuery) params.set('q', searchQuery);
      if (view === 'profile' && profileName) params.set('profile', profileName);
      if (!reset && cursorRef.current) params.set('cursor', cursorRef.current);
      const data = await api<{ tweets: Tweet[]; nextCursor: string | null; hasMore: boolean }>(`/api/tweets?${params}`);
      setFeed((current) => {
        if (reset) return data.tweets;
        const seen = new Set(current.map((tweet) => tweet.id));
        return [...current, ...data.tweets.filter((tweet) => !seen.has(tweet.id))];
      });
      cursorRef.current = data.nextCursor;
      hasMoreRef.current = data.hasMore;
      setHasMore(data.hasMore);
    } catch (error) {
      if (reset) setFeed([]);
      toast(error instanceof Error ? error.message : 'Could not load the feed.', 'error');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [profileName, searchQuery, view]);

  const reload = useCallback(() => {
    cursorRef.current = null;
    hasMoreRef.current = true;
    setHasMore(true);
    setFeed([]);
    void loadFeed(true);
  }, [loadFeed]);

  const loadSidebar = useCallback(() => {
    api<{ trends: Trend[] }>('/api/tweets/trends').then((data) => setTrends(data.trends)).catch(() => {});
    api<{ users: SuggestedUser[] }>('/api/tweets/suggestions').then((data) => setSuggestions(data.users)).catch(() => {});
  }, []);

  useEffect(() => {
    loadSidebar();
    try {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get('tweetView') as TweetView | null;
      const username = params.get('tweetUser');
      if (username) { setView('profile'); setProfileName(username); }
      else if (requested && (FEED_VIEWS.includes(requested) || requested === 'notifications')) setView(requested);
    } catch {}
  }, [loadSidebar]);

  useEffect(() => {
    if (!FEED_VIEWS.includes(view)) return;
    cursorRef.current = null;
    hasMoreRef.current = true;
    setHasMore(true);
    setFeed([]);
    void loadFeed(true);
  }, [loadFeed, view]);

  useEffect(() => {
    if (view !== 'profile') { setProfile(null); return; }
    if (!profileName) return;
    api<{ user: TweetProfile['user']; stats: TweetProfile['stats']; following: boolean; isMe: boolean }>(`/api/tweets/profile?username=${encodeURIComponent(profileName)}`)
      .then((data) => setProfile({ user: data.user, stats: data.stats, following: data.following, isMe: data.isMe }))
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
    setView(next);
    setSearchQuery('');
    setSearchInput('');
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

  const runSearch = (event?: FormEvent) => {
    event?.preventDefault();
    const query = searchInput.trim();
    if (!query) return;
    setSearchQuery(query);
    setView('search');
    window.history.replaceState({}, '', `/?hub=tweet&tweetView=search&q=${encodeURIComponent(query)}`);
  };

  const searchTag = (tag: string) => {
    setSearchInput(tag);
    setSearchQuery(tag);
    setView('search');
    window.history.replaceState({}, '', `/?hub=tweet&tweetView=search&q=${encodeURIComponent(tag)}`);
  };

  const toggleLike = async (tweet: Tweet) => {
    try {
      const data = await api<{ liked: boolean; likes: number }>(`/api/tweets/${tweet.id}/like`, { method: 'POST' });
      patchTweet(tweet.id, { liked: data.liked, likes: data.likes });
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not update like.', 'error'); }
  };

  const toggleRetweet = async (tweet: Tweet) => {
    try {
      const data = await api<{ retweeted: boolean; retweets: number }>(`/api/tweets/${tweet.id}/retweet`, { method: 'POST' });
      patchTweet(tweet.id, { retweeted: data.retweeted, retweets: data.retweets });
      toast(data.retweeted ? 'Reposted.' : 'Repost removed.', 'ok');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not repost.', 'error'); }
  };

  const toggleBookmark = async (tweet: Tweet) => {
    try {
      const data = await api<{ saved: boolean }>(`/api/tweets/${tweet.id}/bookmark`, { method: 'POST' });
      patchTweet(tweet.id, { saved: data.saved });
      toast(data.saved ? 'Added to your bookmarks.' : 'Removed from bookmarks.', 'ok');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not update bookmark.', 'error'); }
  };

  const deleteTweet = async (tweet: Tweet) => {
    try {
      await api(`/api/tweets/${tweet.id}`, { method: 'DELETE' });
      setFeed((current) => current.filter((item) => item.id !== tweet.id));
      setReplies((current) => current.filter((item) => item.id !== tweet.id));
      setActiveTweet((current) => current?.id === tweet.id ? null : current);
      toast('Tweet deleted.', 'ok');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not delete this tweet.', 'error'); }
  };

  const toggleFollow = async (userId: number) => {
    try {
      const data = await api<{ following: boolean }>(`/api/tweets/${userId}/follow`, { method: 'POST' });
      if (profile && profile.user.id === userId) setProfile({ ...profile, following: data.following });
      setSuggestions((current) => current.filter((user) => user.id !== userId));
      toast(data.following ? 'Following.' : 'Unfollowed.', 'ok');
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not update follow.', 'error'); }
  };

  const openTweet = async (tweet: Tweet) => {
    setActiveTweet(tweet);
    setReplyParent(null);
    setReplies([]);
    setRepliesLoading(true);
    try {
      const [detail, replyData] = await Promise.all([
        api<{ tweet: Tweet; replyParent: Tweet | null }>(`/api/tweets/${tweet.id}`),
        api<{ replies: Tweet[] }>(`/api/tweets/${tweet.id}/replies`),
      ]);
      setActiveTweet(detail.tweet);
      setReplyParent(detail.replyParent);
      setReplies(replyData.replies);
    } catch {
      // keep the lightweight card data already shown
    } finally {
      setRepliesLoading(false);
    }
  };

  const onReplyPosted = (reply: Tweet) => {
    if (!activeTweet) return;
    setReplies((current) => [reply, ...current.filter((item) => item.id !== reply.id)]);
    patchTweet(activeTweet.id, { replies: activeTweet.replies + 1 });
    toast('Reply posted.', 'ok');
  };

  const onComposerPosted = (tweet: Tweet) => {
    if (view === 'home' || view === 'profile') setFeed((current) => [tweet, ...current.filter((item) => item.id !== tweet.id)]);
    toast('Your tweet is live.', 'ok');
  };

  const pageTitle = useMemo(() => {
    if (view === 'home') return 'Home';
    if (view === 'explore') return 'Explore';
    if (view === 'following') return 'Following';
    if (view === 'bookmarks') return 'Bookmarks';
    if (view === 'notifications') return 'Notifications';
    if (view === 'search') return `Results for “${searchQuery}”`;
    if (view === 'profile') return profileName ? `@${profileName}` : 'Profile';
    return 'Tweet Hub';
  }, [profileName, searchQuery, view]);

  const nav: { id: TweetView; label: string; icon: typeof Bird }[] = [
    { id: 'home', label: 'Home', icon: Bird },
    { id: 'explore', label: 'Explore', icon: Search },
    { id: 'following', label: 'Following', icon: UsersRound },
    { id: 'notifications', label: 'Notifications', icon: Bell },
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
            {nav.map(({ id, label, icon: Icon }) => (
              <button type="button" key={id} className={view === id ? 'active' : ''} onClick={() => changeView(id)}>
                <Icon size={17} /><span>{label}</span>
              </button>
            ))}
            <button type="button" className={view === 'profile' ? 'active' : ''} onClick={() => me && openProfile(me.username, me.id)}>
              <UserIcon size={17} /><span>Profile</span>
            </button>
          </nav>
          <button type="button" className="btn btn-tweet tweet-hub-post" onClick={() => changeView('home')}><Bird size={16} /> Post</button>
          <button type="button" className="tweet-hub-jam-link" onClick={() => { setProduct('community'); setTab('jams'); }}>
            <UsersRound size={15} /> Open Community
          </button>
        </aside>

        <main className="tweet-hub-main">
          <header className="tweet-hub-heading">
            <div className="tweet-hub-heading-copy">
              {view === 'profile' && <button type="button" className="tweet-back" onClick={() => changeView('home')}><ArrowLeft size={16} /> Back</button>}
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

          {view === 'home' && <Composer onPosted={onComposerPosted} />}

          {view === 'profile' && profile && (
            <section className="tweet-profile-head">
              <div className="tweet-profile-art" />
              <div className="tweet-profile-body">
                <div className="tweet-profile-avatar">
                  <JaminoAvatar avatarId={profile.user.avatarId} size={84} photo={profile.user.avatarPhoto} name={profile.user.username} />
                </div>
                <div className="tweet-profile-actions">
                  {!profile.isMe && (
                    <button type="button" className={`btn ${profile.following ? 'btn-ghost' : 'btn-tweet'} pill-sm`} onClick={() => void toggleFollow(profile.user.id)}>
                      {profile.following ? 'Following' : <><BadgeCheck size={14} /> Follow</>}
                    </button>
                  )}
                </div>
                <div className="tweet-profile-name">
                  <h2>@{profile.user.username}</h2>
                  {profile.user.bio && <p>{profile.user.bio}</p>}
                  <small>Joined {new Date(profile.user.joinedAt).toLocaleDateString()}</small>
                </div>
                <div className="tweet-profile-stats">
                  <span><b>{profile.stats.tweets}</b> Tweets</span>
                  <span><b>{profile.stats.following}</b> Following</span>
                  <span><b>{profile.stats.followers}</b> Followers</span>
                  <span><b>{profile.stats.likedCount}</b> Likes</span>
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
            <NotificationsView />
          ) : (
            <section className="tweet-feed">
              {loading && feed.length === 0 && (
                <div className="tweet-loading">
                  {[1, 2, 3, 4].map((item) => <div className="tweet-skeleton" key={item} />)}
                </div>
              )}
              {!loading && feed.length === 0 && (
                <div className="tweet-empty large">
                  <Bird size={26} />
                  <b>
                    {view === 'bookmarks' ? 'No bookmarks yet.' : view === 'following' ? 'Follow people to fill this feed.' : view === 'search' ? 'No tweets matched your search.' : view === 'profile' ? 'No tweets here yet.' : 'The timeline is quiet.'}
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
                  onOpen={() => void openTweet(tweet)}
                  onLike={() => void toggleLike(tweet)}
                  onRetweet={() => void toggleRetweet(tweet)}
                  onBookmark={() => void toggleBookmark(tweet)}
                  onDelete={() => void deleteTweet(tweet)}
                  onAuthor={() => openProfile(tweet.author.username, tweet.author.id)}
                  onTag={searchTag}
                  onReply={() => void openTweet(tweet)}
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
                  <span><b>@{user.username}</b><small>{user.followers} followers</small></span>
                </button>
                <button type="button" className="btn btn-tweet pill-sm" onClick={() => void toggleFollow(user.id)}>Follow</button>
              </div>
            ))}
          </section>
          <p className="tweet-rail-note">Tweet Hub shares your Jamino account and identity across every hub.</p>
        </aside>
      </div>

      <nav className="hub-mobile-nav tweet-mobile-nav">
        <button type="button" onClick={() => setProduct('home')} aria-label="Hub home"><Bird size={17} /><span>Hubs</span></button>
        {nav.slice(0, 4).map(({ id, label, icon: Icon }) => (
          <button type="button" key={id} className={view === id ? 'active' : ''} onClick={() => changeView(id)}><Icon size={17} /><span>{label}</span></button>
        ))}
      </nav>

      {activeTweet && (
        <div className="tweet-modal-backdrop" onMouseDown={() => { setActiveTweet(null); window.history.replaceState({}, '', '/?hub=tweet'); }}>
          <section className="tweet-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="tweet-modal-head">
              <div><div className="hub-kicker">TWEET</div><h2>Conversation</h2></div>
              <button type="button" className="btn-icon" onClick={() => { setActiveTweet(null); window.history.replaceState({}, '', '/?hub=tweet'); }} aria-label="Close"><X size={18} /></button>
            </header>
            <div className="tweet-modal-scroll">
              {replyParent && (
                <div className="tweet-reply-parent">
                  <span className="tweet-reply-line" />
                  <button type="button" className="tweet-identity" onClick={() => openProfile(replyParent.author.username, replyParent.author.id)}><b>@{replyParent.author.username}</b></button>
                  <p>{replyParent.text}</p>
                </div>
              )}
              <div className="tweet-modal-primary">
                <div className="tweet-card-head">
                  <button type="button" className="tweet-identity" onClick={() => openProfile(activeTweet.author.username, activeTweet.author.id)}><b>@{activeTweet.author.username}</b></button>
                  <span className="tweet-time">· {timeAgo(activeTweet.createdAt)}</span>
                </div>
                {activeTweet.text && <p className="tweet-modal-text">{renderText(activeTweet.text, searchTag)}</p>}
                <TweetMedia tweet={activeTweet} />
                <TweetActions tweet={activeTweet} onLike={() => void toggleLike(activeTweet)} onRetweet={() => void toggleRetweet(activeTweet)} onBookmark={() => void toggleBookmark(activeTweet)} onReply={() => {}} />
              </div>
              <Composer compact autoFocus replyToId={activeTweet.id} placeholder="Post your reply" onPosted={onReplyPosted} />
              <div className="tweet-replies">
                {repliesLoading && <div className="tweet-empty"><span className="admin-loader" /> Loading replies…</div>}
                {!repliesLoading && replies.length === 0 && <div className="tweet-empty"><MessageCircle size={20} /><span>No replies yet. Start the conversation.</span></div>}
                {replies.map((reply) => (
                  <div className="tweet-reply-row" key={reply.id}>
                    <button type="button" className="tweet-avatar-btn" onClick={() => openProfile(reply.author.username, reply.author.id)}>
                      <JaminoAvatar avatarId={reply.author.avatarId} size={38} photo={reply.author.avatarPhoto} name={reply.author.username} />
                    </button>
                    <div className="tweet-reply-copy">
                      <div className="tweet-card-head">
                        <button type="button" className="tweet-identity" onClick={() => openProfile(reply.author.username, reply.author.id)}><b>@{reply.author.username}</b></button>
                        <span className="tweet-time">· {timeAgo(reply.createdAt)}</span>
                      </div>
                      {reply.text && <p className="tweet-text">{renderText(reply.text, searchTag)}</p>}
                      <TweetMedia tweet={reply} />
                      <TweetActions tweet={reply} onLike={() => void toggleLike(reply)} onRetweet={() => void toggleRetweet(reply)} onBookmark={() => void toggleBookmark(reply)} onReply={() => {}} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}