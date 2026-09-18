'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { connectLive, emitLive, emitWhenConnected, liveConnected, liveSocketId, onLive } from '@/lib/live';
import { useAppStore } from '@/store/app-store';
import { JaminoAvatar } from '@/components/jamino-avatar';
import { useTranslations } from '@/providers/use-translations';

interface VoiceMember {
  socketId: string;
  userId: number;
  muted: boolean;
}

interface RoomVoiceMember {
  id: number;
  username: string;
  avatarId: number;
  avatarPhoto?: string | null;
}

interface RoomVoiceChatProps {
  jamId: string;
  members: RoomVoiceMember[];
}

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

export function RoomVoiceChat({ jamId, members }: RoomVoiceChatProps) {
  const t = useTranslations();
  const me = useAppStore((s) => s.me);
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [roster, setRoster] = useState<VoiceMember[]>([]);
  const [streams, setStreams] = useState<Record<string, { userId: number; stream: MediaStream }>>({});
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const rosterRef = useRef<VoiceMember[]>([]);
  const joinedRef = useRef(false);
  const connectedOnceRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const pendingRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  useEffect(() => {
    joinedRef.current = joined;
  }, [joined]);

  const teardown = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    Object.values(peersRef.current).forEach((pc) => {
      try {
        pc.close();
      } catch (e) {
        console.error('voice pc close', e);
      }
    });
    peersRef.current = {};
    pendingRef.current = {};
    analysersRef.current.forEach((an, sid) => {
      try {
        an.disconnect();
      } catch (e) {
        /* noop */
      }
      analysersRef.current.delete(sid);
    });
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const detachAnalyser = useCallback((sid: string) => {
    const an = analysersRef.current.get(sid);
    if (an) {
      try {
        an.disconnect();
      } catch (e) {
        /* noop */
      }
      analysersRef.current.delete(sid);
    }
  }, []);

  const startAnalyserLoop = useCallback(() => {
    if (rafRef.current) return;
    const buf = new Float32Array(512);
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (analysersRef.current.size === 0) return;
      const next: Record<string, boolean> = {};
      analysersRef.current.forEach((an, sid) => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        next[sid] = Math.sqrt(sum / buf.length) > 0.025;
      });
      setSpeaking((prev) => {
        const keys = Object.keys(next);
        if (keys.length !== Object.keys(prev).length) return next;
        for (const k of keys) if (next[k] !== prev[k]) return next;
        return prev;
      });
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const attachAnalyser = useCallback(
    (sid: string, stream: MediaStream) => {
      if (typeof AudioContext === 'undefined') return;
      detachAnalyser(sid);
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      analysersRef.current.set(sid, an);
      startAnalyserLoop();
    },
    [detachAnalyser, startAnalyserLoop]
  );

  const closePeer = useCallback(
    (sid: string) => {
      const pc = peersRef.current[sid];
      if (pc) {
        try {
          pc.close();
        } catch (e) {
          console.error('voice pc close', e);
        }
        delete peersRef.current[sid];
      }
      detachAnalyser(sid);
      setStreams((prev) => {
        if (!(sid in prev)) return prev;
        const next = { ...prev };
        delete next[sid];
        return next;
      });
      setSpeaking((prev) => {
        if (!(sid in prev)) return prev;
        const next = { ...prev };
        delete next[sid];
        return next;
      });
    },
    [detachAnalyser]
  );

  const resetPeers = useCallback(() => {
    Object.entries(peersRef.current).forEach(([sid, pc]) => {
      try {
        pc.close();
      } catch (e) {
        console.error('voice pc close', e);
      }
      detachAnalyser(sid);
    });
    peersRef.current = {};
    pendingRef.current = {};
    setStreams({});
    setSpeaking({});
  }, [detachAnalyser]);

  const ensurePeer = useCallback(
    (target: VoiceMember, wait = false) => {
      const myId = liveSocketId();
      if (!myId || myId === target.socketId) return;
      if (!joinedRef.current || !localStreamRef.current) return;
      if (peersRef.current[target.socketId]) return;

      const pc = new RTCPeerConnection({ iceServers: ICE });
      peersRef.current[target.socketId] = pc;

      const local = localStreamRef.current;
      if (local) local.getTracks().forEach((track) => pc.addTrack(track, local));

      pc.onicecandidate = (ev) => {
        if (ev.candidate && ev.candidate.candidate) {
          emitWhenConnected('voice:signal', {
            jamId,
            to: target.socketId,
            payload: { type: 'candidate', candidate: ev.candidate.toJSON() },
          });
        }
      };

      pc.ontrack = (ev) => {
        if (ev.track.kind !== 'audio') return;
        const stream = ev.streams[0] ?? new MediaStream([ev.track]);
        setStreams((prev) => ({ ...prev, [target.socketId]: { userId: target.userId, stream } }));
        attachAnalyser(target.socketId, stream);
        ev.track.onended = () => closePeer(target.socketId);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          closePeer(target.socketId);
        }
      };

      const caller = myId < target.socketId;
      if (caller && !wait) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (pc.localDescription) {
              emitWhenConnected('voice:signal', { jamId, to: target.socketId, payload: { type: 'offer', sdp: pc.localDescription } });
            }
          })
          .catch((e) => console.error('voice offer error', e));
      }
    },
    [jamId, attachAnalyser, closePeer]
  );

  const flushPending = useCallback((sid: string) => {
    const pc = peersRef.current[sid];
    const pending = pendingRef.current[sid];
    if (!pc || !pending) return;
    delete pendingRef.current[sid];
    pending.forEach((candidate) => pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {}));
  }, []);

  useEffect(() => {
    const socket = connectLive();
    connectedOnceRef.current = liveConnected();
    const onConnect = () => {
      const reconnecting = connectedOnceRef.current;
      connectedOnceRef.current = true;
      if (reconnecting && joinedRef.current) {
        resetPeers();
        setRoster([]);
        rosterRef.current = [];
        emitLive('voice:join', jamId);
      }
    };
    const onDisconnect = () => {
      if (!joinedRef.current) return;
      resetPeers();
      setRoster([]);
      rosterRef.current = [];
    };
    const onConnectError = () => setError(t('room.voiceConnection'));
    socket?.on('connect', onConnect);
    socket?.on('disconnect', onDisconnect);
    socket?.on('connect_error', onConnectError);
    const offUpdate = onLive('voice:update', (data: any) => {
      if (data?.jamId !== jamId) return;
      const list: VoiceMember[] = data.members ?? [];
      setRoster(list);
      rosterRef.current = list;
      list.forEach((mb) => {
        if (joinedRef.current && mb.socketId !== liveSocketId()) ensurePeer(mb);
      });
      const alive = new Set(list.map((x) => x.socketId));
      Object.keys(peersRef.current).forEach((sid) => {
        if (!alive.has(sid)) closePeer(sid);
      });
    });
    const offMembers = onLive('voice:members', (data: any) => {
      if (data?.jamId !== jamId) return;
      const list: VoiceMember[] = data.members ?? [];
      setRoster(list);
      rosterRef.current = list;
      list.forEach((mb) => {
        if (joinedRef.current && mb.socketId !== liveSocketId()) ensurePeer(mb);
      });
    });
    const offError = onLive('voice:error', (data: any) => {
      if (data?.jamId === jamId && data.message) setError(String(data.message));
    });
    const offSignal = onLive('voice:signal', (data: any) => {
      if (!joinedRef.current || data?.jamId !== jamId || !data.from) return;
      const payload = data.payload;
      if (!payload) return;
      if (!peersRef.current[data.from]) {
        const known = rosterRef.current.find((x) => x.socketId === data.from);
        ensurePeer(known || { socketId: data.from, userId: -1, muted: false }, true);
      }
      const pc = peersRef.current[data.from];
      if (!pc) return;
      if (payload.type === 'offer') {
        pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          .then(() => {
            flushPending(data.from);
            return pc.createAnswer();
          })
          .then((answer) => pc.setLocalDescription(answer))
          .then(() => {
            if (pc.localDescription) {
              emitWhenConnected('voice:signal', { jamId, to: data.from, payload: { type: 'answer', sdp: pc.localDescription } });
            }
          })
          .catch((e) => console.error('voice answer error', e));
      } else if (payload.type === 'answer') {
        pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          .then(() => flushPending(data.from))
          .catch((e) => console.error('voice setRemote error', e));
      } else if (payload.type === 'candidate') {
        if (pc.remoteDescription) {
          pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
        } else {
          pendingRef.current[data.from] = pendingRef.current[data.from] || [];
          pendingRef.current[data.from].push(payload.candidate);
        }
      }
    });
    return () => {
      if (joinedRef.current) emitLive('voice:leave', jamId);
      socket?.off('connect', onConnect);
      socket?.off('disconnect', onDisconnect);
      socket?.off('connect_error', onConnectError);
      offUpdate();
      offMembers();
      offError();
      offSignal();
      resetPeers();
    };
  }, [jamId, ensurePeer, closePeer, flushPending, resetPeers]);

  const joinVoice = async () => {
    if (joinedRef.current) return;
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t('room.voiceUnavailable'));
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      joinedRef.current = true;
      setJoined(true);
      setMuted(false);
      emitWhenConnected('voice:join', jamId);
    } catch (e) {
      console.error('voice getUserMedia error', e);
      setError(t('room.voiceDenied'));
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    emitWhenConnected('voice:mute', { jamId, muted: next });
  };

  const leaveVoice = () => {
    joinedRef.current = false;
    emitLive('voice:leave', jamId);
    teardown();
    setJoined(false);
    setRoster([]);
    rosterRef.current = [];
    setStreams({});
    setSpeaking({});
    setError(null);
  };

  const myId = me?.id;
  const infoFor = (userId: number) => members.find((m) => m.id === userId);

  return (
    <div className="room-voice">
      <div className="room-voice-head">
        <Volume2 size={13} />
        <span>{t('room.voice')}</span>
        <span className="room-voice-count">{roster.length}</span>
      </div>
      <div className="room-voice-grid">
        {roster.map((member) => {
          const self = member.socketId === liveSocketId();
          const info = infoFor(member.userId);
          return (
            <div key={member.socketId} className={`room-voice-chip ${speaking[member.socketId] ? 'speaking' : ''} ${self ? 'self' : ''}`}>
              <JaminoAvatar avatarId={info?.avatarId ?? 0} size={28} photo={info?.avatarPhoto} name={info?.username ?? ''} />
              <span className="room-voice-name">{self ? t('room.voiceYou') : info?.username ?? t('room.voiceUnknown')}</span>
              {member.muted && <MicOff size={12} className="room-voice-muted" aria-label={t('room.voiceMuted')} />}
            </div>
          );
        })}
        {roster.length === 0 && joined && <div className="room-voice-empty">{t('room.voiceEmpty')}</div>}
      </div>
      {joined ? (
        <div className="room-voice-controls">
          <button type="button" className={`btn btn-ghost pill-sm ${muted ? 'danger' : ''}`} onClick={toggleMute}>
            {muted ? <MicOff size={14} /> : <Mic size={14} />} {muted ? t('room.voiceUnmute') : t('room.voiceMute')}
          </button>
          <button type="button" className="btn btn-danger pill-sm" onClick={leaveVoice}>
            <PhoneOff size={14} /> {t('room.voiceLeave')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost pill-sm room-voice-join" onClick={() => joinVoice().catch(() => {})}>
          <Mic size={14} /> {t('room.voiceJoin')}
        </button>
      )}
      {error && <div className="room-voice-error">{error}</div>}
      {Object.entries(streams).map(([sid, entry]) => (
        <audio
          key={sid}
          ref={(el) => {
            if (el && el.srcObject !== entry.stream) el.srcObject = entry.stream;
          }}
          autoPlay
          playsInline
        />
      ))}
    </div>
  );
}
