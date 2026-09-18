'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from '@/providers/use-translations';
import { useAppStore } from '@/store/app-store';
import { JaminoAvatar } from '@/components/jamino-avatar';
import { EmojiText } from '@/components/emoji-text';
import { VoicePlayer } from '@/components/voice-player';
import { MessageComposer } from '@/components/message-composer';
import { MessageReactions, aggReactions, type ReactionAgg } from '@/components/message-reactions';
import { useContextMenu, ContextMenu, type CmItem } from '@/components/context-menu';
import { api } from '@/lib/client-api';
import { connectLive, emitLive, onLive, liveSocketId, liveConnected } from '@/lib/live';
import { toast } from '@/components/toast';
import { loadUnread } from '@/lib/unread';
import { ReportMessageModal } from '@/components/report-message-modal';
import { ArrowLeft, Copy, User, Check, CheckCheck, Flag } from 'lucide-react';

interface ChatUser {
  id: number;
  username: string;
  uid?: string;
  avatarId: number;
  github: boolean;
  status?: string;
  statusText?: string;
  avatarPhoto?: string | null;
}

interface ChatMsg {
  id: number;
  userId: number;
  kind?: string;
  text: string;
  media: { id: string; url: string } | null;
  createdAt: string;
  user?: ChatUser;
  reactions?: ReactionAgg[];
  seenAt?: string | null;
}

interface ConvoData {
  convo: { id: string; otherId: number; other: ChatUser };
  messages: ChatMsg[];
}

export function DmPanel({ otherId, onBack }: { otherId: number; onBack: () => void }) {
  const t = useTranslations();
  const me = useAppStore((s) => s.me);
  const setProfileUserId = useAppStore((s) => s.setProfileUserId);
  const [convo, setConvo] = useState<ConvoData | null>(null);
  const [live, setLive] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [sendingText, setSendingText] = useState(false);
  const [reportMessageId, setReportMessageId] = useState<number | null>(null);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const typingTimer = useRef<number | null>(null);
  const otherNameRef = useRef('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const { menu, closeCm, onContextMenu } = useContextMenu();

  const load = () => api<ConvoData>(`/api/dm/${otherId}`).then(setConvo).catch(() => {});

  useEffect(() => {
    load();
    loadUnread();
    const socket = connectLive();
    const offNew = onLive('dm:new', (d: { userA: number; userB: number; message: ChatMsg }) => {
      const mine = me?.id ?? -1;
      const match = (d.userA === mine && d.userB === otherId) || (d.userA === otherId && d.userB === mine);
      if (!match) return;
      setConvo((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((x) => x.id === d.message.id)) return prev;
        return { ...prev, messages: [...prev.messages, d.message] };
      });
    });
    const offSeen = onLive('dm:seen', (d: { by: number }) => {
      if (d.by !== otherId) return;
      setConvo((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) => (m.userId === me?.id ? { ...m, seenAt: m.seenAt ?? new Date().toISOString() } : m)),
        };
      });
    });
    const offReact = onLive('reaction:update', (d: { messageId: number; reactions: { emoji: string; userId: number }[] }) => {
      setConvo((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) => (m.id === d.messageId ? { ...m, reactions: aggReactions(d.reactions, me?.id ?? null) } : m)),
        };
      });
    });
    const offTyping = onLive('typing:update', (d: { dm?: number; user: number; from?: string }) => {
      if (d.dm !== otherId) return;
      if (d.from && d.from === liveSocketId()) return;
      if (d.user === me?.id) return;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      setTypingUser(otherNameRef.current);
      typingTimer.current = window.setTimeout(() => setTypingUser(null), 2000);
    });
    const onConn = () => setLive(true);
    const onDisc = () => setLive(false);
    socket?.on('connect', onConn);
    socket?.on('disconnect', onDisc);
    setLive(liveConnected());
    const poll = setInterval(() => {
      if (liveConnected()) return;
      load();
    }, 6000);
    return () => {
      offNew();
      offSeen();
      offReact();
      offTyping();
      socket?.off('connect', onConn);
      socket?.off('disconnect', onDisc);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherId]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [convo?.messages.length]);

  useEffect(() => {
    otherNameRef.current = convo?.convo.other.username ?? '';
  }, [convo]);

  const sendText = async (text: string) => {
    if (sendingText) return;
    setSendingText(true);
    try {
      await api(`/api/dm/${otherId}/send`, { method: 'POST', body: JSON.stringify({ text }) });
      loadUnread();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.unknownError'), 'error');
    } finally {
      setSendingText(false);
    }
  };

  const sendVoice = async (blob: Blob) => {
    const fd = new FormData();
    fd.append('voice', blob, 'voice.webm');
    setSendingVoice(true);
    try {
      await api(`/api/dm/${otherId}/voice`, { method: 'POST', body: fd });
      loadUnread();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.unknownError'), 'error');
    } finally {
      setSendingVoice(false);
    }
  };

  const onTyping = () => emitLive('typing', { dm: otherId });

  const react = async (msgId: number, emoji: string) => {
    try {
      await api(`/api/dm/${otherId}/${msgId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) });
      setConvo((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: prev.messages.map((m) => {
            if (m.id !== msgId) return m;
            const had = m.reactions ?? [];
            const meRest = had.filter((r) => (r.me ? r.emoji !== emoji : true));
            const myCount = had.filter((r) => r.me && r.emoji === emoji)[0]?.count ?? 0;
            const newMe = myCount > 0;
            const selfEmoji = meRest.find((r) => r.emoji === emoji);
            let next = meRest;
            if (!newMe && selfEmoji) next = next.map((r) => (r.emoji === emoji ? { ...r, count: r.count + 1, me: true } : r));
            else if (!newMe) next = [...next, { emoji, count: 1, me: true }];
            else if (selfEmoji) next = next.map((r) => (r.emoji === emoji ? { ...r, count: r.count - 1, me: false } : r));
            return { ...m, reactions: next.filter((r) => r.count > 0) };
          }),
        };
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.unknownError'), 'error');
    }
  };

  const msgMenu = (m: ChatMsg): CmItem[] => {
    const items: CmItem[] = [];
    if (m.text) {
      items.push({
        icon: <Copy size={14} />,
        label: t('dm.copy'),
        onClick: () => navigator.clipboard?.writeText(m.text).catch(() => {}),
      });
    }
    if (m.userId !== me?.id) {
      items.push({
        icon: <User size={14} />,
        label: t('dm.profile'),
        onClick: () => setProfileUserId(m.userId),
      });
      items.push({
        icon: <Flag size={14} />,
        label: 'Report message',
        onClick: () => {
          setReportMessageId(m.id);
        },
      });
    }
    return items;
  };

  if (!convo) return <div className="empty-state" style={{ padding: 48 }}>…</div>;

  return (
    <div className="room" style={{ marginTop: 24 }}>
      <div className="room-head">
        <button type="button" className="btn-icon" onClick={onBack} title={t('modal.close')}>
          <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          className="room-title-wrap"
          style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'start' }}
          onClick={() => setProfileUserId(convo.convo.other.id)}
        >
          <div className="jam-icon" style={{ width: 36, height: 36, marginInlineEnd: 4 }}>
            <JaminoAvatar avatarId={convo.convo.other.avatarId} size={34} photo={convo.convo.other.avatarPhoto} name={convo.convo.other.username} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="room-title">{convo.convo.other.username}</div>
            <div className="room-members">
              {convo.convo.other.statusText || t('dm.privateChat')}
              {live && <span className="live-tag"><span className="live-dot" /> Live</span>}
            </div>
          </div>
        </button>
      </div>

      <div className="room-body" ref={bodyRef}>
        {convo.messages.length === 0 && <div className="empty-state" style={{ padding: 40 }}>{t('dm.noMessages')}</div>}
        {convo.messages.map((m) => (
          <div key={m.id} className={`msg ${m.userId === me?.id ? 'me' : ''}`} onContextMenu={(e) => onContextMenu(e, msgMenu(m), 'dm')}>
            <button type="button" className="msg-avatar-btn" onClick={() => m.userId !== me?.id && setProfileUserId(m.userId)}>
              <JaminoAvatar avatarId={m.user?.avatarId ?? 0} size={32} photo={m.user?.avatarPhoto} name={m.user?.username} />
            </button>
            <div>
              <div className="msg-bubble">
                <div className="msg-name">{m.user?.username}</div>
                {m.kind === 'VOICE' && m.media ? (
                  <VoicePlayer src={m.media.url} />
                ) : (
                  <div className="msg-text">
                    <EmojiText text={m.text} />
                  </div>
                )}
              </div>
              <div className="msg-time">
                {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {m.userId === me?.id && (m.seenAt ? <CheckCheck className="tick-seen" size={13} /> : <Check className="tick-sent" size={13} />)}
              </div>
              {m.reactions && m.reactions.length > 0 && (
                <MessageReactions reactions={m.reactions} onReact={(em) => react(m.id, em)} myReaction={m.reactions?.find((r) => r.me)?.emoji ?? null} />
              )}
            </div>
          </div>
        ))}
      </div>

      {typingUser && <div className="typing-hint">{t('dm.typing', { name: typingUser })}</div>}

      <MessageComposer
        placeholder={t('dm.placeholder')}
        onSendText={sendText}
        onSendVoice={sendVoice}
        onTyping={onTyping}
        busy={sendingVoice || sendingText}
      />

      {menu && <ContextMenu menu={menu} onClose={closeCm} />}
      {reportMessageId != null && <ReportMessageModal target={{ dmMessageId: reportMessageId }} onClose={() => setReportMessageId(null)} />}
    </div>
  );
}
