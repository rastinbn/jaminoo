'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from '@/providers/use-translations';
import { EMOJI_CATEGORIES } from '@/lib/emoji';
import { MAX_VOICE_SECONDS } from '@/lib/constants';
import { Send, Mic, X, Square, Check, Smile } from 'lucide-react';

interface Props {
  placeholder: string;
  onSendText: (text: string) => void | Promise<void>;
  onSendVoice: (blob: Blob) => void | Promise<void>;
  onTyping?: () => void;
  disabled?: boolean;
  busy?: boolean;
}

export function MessageComposer({ placeholder, onSendText, onSendVoice, onTyping, disabled, busy }: Props) {
  const t = useTranslations();
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiCat, setEmojiCat] = useState(0);
  const [rec, setRec] = useState<'idle' | 'rec' | 'busy'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [sendingText, setSendingText] = useState(false);
  const recRef = useRef<{ chunks: Blob[]; mr: MediaRecorder | null; stream: MediaStream | null; timer: number; start: number } | null>(null);

  useEffect(() => {
    return () => stopTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled || busy || sendingText) return;
    const clean = text.trim();
    setText('');
    setEmojiOpen(false);
    setSendingText(true);
    try {
      await onSendText(clean);
    } finally {
      setSendingText(false);
    }
  };

  const stopTracks = () => {
    const r = recRef.current;
    if (r?.stream) r.stream.getTracks().forEach((tr) => tr.stop());
  };

  const startRec = async () => {
    if (rec !== 'idle' || busy || sendingText) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const started = Date.now();
      recRef.current = { chunks, mr, stream, timer: 0, start: started };
      mr.start();
      setRec('rec');
      setSeconds(0);
      recRef.current.timer = window.setInterval(() => {
        const el = Math.floor((Date.now() - started) / 1000);
        setSeconds(el);
        if (el >= MAX_VOICE_SECONDS) finishRec();
      }, 200);
    } catch {
      setRec('idle');
    }
  };

  const finishRec = useCallback(() => {
    const r = recRef.current;
    if (!r || !r.mr) return;
    if (r.mr.state === 'inactive') return;
    clearInterval(r.timer);
    r.mr.onstop = () => {
      stopTracks();
      recRef.current = null;
      setRec('idle');
      setSeconds(0);
      const blob = new Blob(r.chunks, { type: r.mr?.mimeType || 'audio/webm' });
      const secs = Math.floor((Date.now() - r.start) / 1000);
      if (secs >= 1 && blob.size > 0) onSendVoice(blob);
    };
    if (r.mr.state === 'recording') r.mr.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSendVoice]);

  const cancelRec = () => {
    const r = recRef.current;
    if (!r || !r.mr) return;
    clearInterval(r.timer);
    r.mr.onstop = () => {
      stopTracks();
      recRef.current = null;
    };
    if (r.mr.state === 'recording') r.mr.stop();
    setRec('idle');
    setSeconds(0);
  };

  const insertEmoji = (em: string) => {
    setText((p) => p + em);
    onTyping?.();
  };

  if (disabled) return null;

  return (
    <form className="composer-row" onSubmit={submit}>
      <div className="composer-inner">
        <input
          className="auth-input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping?.();
          }}
          placeholder={placeholder}
        />
        <button type="button" className="btn-icon composer-ico" onClick={() => setEmojiOpen((v) => !v)} title="Emoji">
          <Smile size={16} />
        </button>
        {rec === 'rec' ? (
          <div className="rec-bar">
            <span className="rec-dot" />
            <span className="rec-time">{String(Math.floor(seconds / 60)).padStart(1, '0')}:{String(seconds % 60).padStart(2, '0')} / 1:00</span>
          </div>
        ) : (
          <button type="button" className="btn-icon violet composer-ico" onClick={startRec} title="Voice">
            <Mic size={16} />
          </button>
        )}
      </div>

      {emojiOpen ? (
        <button type="button" className="btn-icon composer-ico" onClick={() => setEmojiOpen(false)} title="Close">
          <X size={16} />
        </button>
      ) : null}

      {emojiOpen && (
        <div className="emoji-pop">
          <div className="emoji-pop-tabs">
            {EMOJI_CATEGORIES.map((c, i) => (
              <button
                key={c.key}
                type="button"
                className={i === emojiCat ? 'active' : ''}
                onClick={() => setEmojiCat(i)}
                title={c.label}
              >
                {c.emojis[0]}
              </button>
            ))}
          </div>
          <div className="emoji-pop-grid">
            {EMOJI_CATEGORIES[emojiCat]?.emojis.map((em) => (
              <button key={em} type="button" className="emoji-cell" onClick={() => insertEmoji(em)}>
                <span className="emoji-lit">{em}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {rec === 'rec' ? (
        <>
          <button type="button" className="btn btn-danger send-btn" onClick={cancelRec} title={t('voice.cancel')}>
            <X size={15} />
          </button>
          <button type="button" className="btn btn-violet send-btn" onClick={finishRec} title={t('voice.send')}>
            <Check size={15} />
          </button>
        </>
      ) : busy || sendingText ? (
        <button type="button" disabled className="btn btn-violet send-btn" title={t('voice.sending')}>
          <Square size={13} fill="currentColor" />
        </button>
      ) : (
        <button type="submit" className="btn btn-violet send-btn" disabled={!text.trim()}>
          <Send size={15} />
        </button>
      )}
    </form>
  );
}
