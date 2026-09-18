const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config();

function getCookie(raw, name) {
  const m = (raw || '').split(';').map((s) => s.trim()).find((p) => p.startsWith(name + '='));
  return m ? m.slice(name.length + 1) : null;
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const selfOrigin = `${proto}://${req.headers.host}`;
  if (origin === selfOrigin) return true;
  const pub = process.env.NEXT_PUBLIC_BASE_URL;
  if (pub) {
    try {
      return origin === new URL(pub).origin;
    } catch {
      return false;
    }
  }
  return false;
}

const dev = process.env.NODE_ENV === 'development';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev });
const handle = app.getRequestHandler();
const prisma = new PrismaClient();

// Map of userId -> Set<socketId> for online presence.
const online = new Map();

// Cache of userId -> { at, set } of friend ids (used to scope presence broadcasts).
const friendCache = new Map();

// Map of jamId -> Map<socketId, { userId, muted }> for WebRTC voice signaling roster.
const voicePeers = new Map();

async function friendsOf(userId) {
  const cached = friendCache.get(userId);
  if (cached && Date.now() - cached.at < 30000) return cached.set;
  const rows = await prisma.friendRequest.findMany({
    where: { status: 'FRIENDS', OR: [{ fromId: userId }, { toId: userId }] },
    select: { fromId: true, toId: true },
  });
  const set = new Set();
  for (const r of rows) set.add(r.fromId === userId ? r.toId : r.fromId);
  friendCache.set(userId, { at: Date.now(), set });
  return set;
}

async function pushPresence() {
  const all = [...online.keys()];
  for (const userId of all) {
    const sockets = online.get(userId);
    if (!sockets || sockets.size === 0) continue;
    let list;
    let statusMap = {};
    try {
      const friends = await friendsOf(userId);
      const filtered = all.filter((id) => friends.has(id));
      list = filtered;
      const users = await prisma.user.findMany({ where: { id: { in: filtered } }, select: { id: true, status: true, statusText: true } });
      for (const u of users) statusMap[u.id] = { status: u.status, statusText: u.statusText };
    } catch (e) {
      console.error('presence friends error:', e && e.message);
      list = [userId];
    }
    io.to(`user:${userId}`).emit('presence:update', { online: list, presence: statusMap });
  }
}

let io;

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));

  io = new Server(server, {
    path: '/socket.io',
    serveClient: false,
    cors: { origin: false, credentials: false },
    allowRequest(req, callback) {
      if (!originAllowed(req)) return callback(null, false);
      callback(null, true);
    },
  });

  io.use(async (socket, nextcb) => {
    try {
      const token = getCookie(socket.handshake.headers.cookie, 'jam_session');
      if (!token) return nextcb(new Error('unauthorized'));
      const session = await prisma.session.findUnique({ where: { token } });
      if (!session || session.expiresAt < new Date()) return nextcb(new Error('unauthorized'));
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      if (!user) return nextcb(new Error('unauthorized'));
      if (user.bannedUntil && user.bannedUntil > new Date()) return nextcb(new Error('banned'));
      socket.data.userId = session.userId;
      socket.data.isAdmin = !!user.isAdmin;
      socket.data.token = token;
      nextcb();
    } catch (e) {
      console.error('WS auth error:', e && e.message);
      nextcb(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const typingAt = new Map();

    const allowTyping = (key) => {
      const now = Date.now();
      const previous = typingAt.get(key) || 0;
      if (now - previous < 700) return false;
      typingAt.set(key, now);
      return true;
    };

    const livePositionMs = (jam) => {
      if (jam.currentPlaying && jam.currentStartedAt) {
        return jam.currentPosition + (Date.now() - jam.currentStartedAt.getTime());
      }
      return jam.currentPosition;
    };

    const songPayloadJS = (s) => {
      const album = s.album
        ? { id: s.album.id, title: s.album.title, coverUrl: s.album.coverFile ? `/api/music/cover/album/${s.album.id}` : null }
        : null;
      return {
        id: s.id,
        title: s.title,
        artist: s.artist ? { id: s.artist.id, name: s.artist.name, coverFile: s.artist.coverFile || '' } : null,
        feat: JSON.parse(s.featArtistIds || '[]'),
        album,
        trackNo: s.trackNo,
        durationSec: s.durationSec,
        genres: JSON.parse(s.genres || '[]'),
        producer: s.producer,
        label: s.label,
        year: s.year,
        explicit: !!s.explicit,
        featured: !!s.featured,
        lyrics: s.lyrics || '',
        lrc: s.lrc || '',
        hasAudio: !!s.audioFile,
        audioUrl: s.audioFile ? `/api/music/stream/${s.id}` : null,
        audioLink: s.audioLink || null,
        hasCover: !!s.coverFile,
        coverUrl: s.coverFile ? `/api/music/cover/song/${s.id}` : (album ? album.coverUrl : null),
        plays: s.plays,
        createdAt: s.createdAt ? s.createdAt.toISOString() : null,
      };
    };

    const MUSIC_INCLUDE = () => ({
      currentSong: {
        include: {
          artist: true,
          album: { include: { artist: true } },
        },
      },
      queueItems: {
        include: {
          song: { include: { artist: true, album: true } },
          addedByRef: { select: { id: true, username: true } },
          votes: { select: { userId: true } },
        },
        orderBy: [{ pos: 'asc' }, { createdAt: 'asc' }],
      },
      members: true,
    });

    const refreshJam = async (jamId) => {
      return prisma.jam.findUnique({ where: { id: jamId }, include: MUSIC_INCLUDE() });
    };

    const broadcastState = (jam) => {
      io.to(`jam:${jam.id}`).emit('music:state', {
        jamId: jam.id,
        now: jam.currentSongId ? songPayloadJS(jam.currentSong) : null,
        playing: jam.currentPlaying,
        positionMs: livePositionMs(jam),
        atMs: Date.now(),
        durationSec: jam.currentSong ? jam.currentSong.durationSec : 0,
      });
    };

    const broadcastQueue = (jam) => {
      io.to(`jam:${jam.id}`).emit('music:queue', {
        jamId: jam.id,
        queue: jam.queueItems.map((qi) => ({
          id: qi.id,
          pos: qi.pos ?? 0,
          song: songPayloadJS(qi.song),
          addedBy: { id: qi.addedBy, username: qi.addedByRef ? qi.addedByRef.username : '' },
          createdAt: qi.createdAt.toISOString(),
          votes: qi.votes ? qi.votes.length : 0,
        })),
      });
    };

    const renumberQueue = async (jamId) => {
      const all = await prisma.jamQueueItem.findMany({ where: { jamId }, orderBy: [{ pos: 'asc' }, { createdAt: 'asc' }] });
      const tx = [];
      for (let i = 0; i < all.length; i++) {
        if (all[i].pos === i + 1) continue;
        tx.push(prisma.jamQueueItem.update({ where: { id: all[i].id }, data: { pos: i + 1 } }));
      }
      if (tx.length) await prisma.$transaction(tx);
    };

    const advanceQueue = async (jamId) => {
      const jam = await refreshJam(jamId);
      if (!jam || !jam.currentSongId) return;
      const next = jam.queueItems.length ? jam.queueItems[0] : null;
      if (next) {
        await prisma.jam.update({
          where: { id: jamId },
          data: { currentSongId: next.songId, currentStartedAt: new Date(), currentPlaying: true, currentPosition: 0 },
        });
        await prisma.jamQueueItem.delete({ where: { id: next.id } });
      } else {
        await prisma.jam.update({ where: { id: jamId }, data: { currentPlaying: false, currentPosition: 0 } });
      }
      const fresh = await refreshJam(jamId);
      if (fresh) {
        broadcastState(fresh);
        broadcastQueue(fresh);
      }
    };

    socket.join(`user:${userId}`);
    if (socket.data.isAdmin) socket.join('admin');

    const set = online.get(userId) || new Set();
    set.add(socket.id);
    online.set(userId, set);
    pushPresence();

    socket.on('music:sync', async (jamId) => {
      if (typeof jamId !== 'string' || !jamId) return;
      try {
        const jam = await refreshJam(jamId);
        if (!jam || jam.kind !== 'MUSIC') return;
        const member = await prisma.jamMember.findUnique({ where: { jamId_userId: { jamId, userId } } });
        if (!member) return;
        broadcastState(jam);
        broadcastQueue(jam);
      } catch (e) {
        console.error('music:sync error:', e && e.message);
      }
    });

    socket.on('music:control', async (d) => {
      if (!d || typeof d !== 'object' || typeof d.jamId !== 'string') return;
      const jamId = d.jamId;
      const action = String(d.action || '');
      try {
        const jam = await prisma.jam.findUnique({ where: { id: jamId }, select: { id: true, ownerId: true, kind: true, members: true } });
        if (!jam || jam.kind !== 'MUSIC') return;
        const isMember = jam.members.some((m) => m.userId === userId);
        if (!isMember) return;
        const meMember = jam.members.find((m) => m.userId === userId);
        const canControl = jam.ownerId === userId || !!socket.data.isAdmin || meMember?.role === 'MINI_HOST';
        const controlActions = ['play', 'pause', 'resume', 'seek', 'skip', 'queue-add', 'queue-remove', 'queue-move'];
        if (controlActions.includes(action) && !canControl) return;

        if (action === 'queue-add') {
          const songId = Number(d.songId);
          if (!Number.isInteger(songId) || songId <= 0) return;
          const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
          if (!song) return;
          const maxPos = await prisma.jamQueueItem.aggregate({ where: { jamId }, _max: { pos: true } });
          await prisma.jamQueueItem.create({ data: { jamId, songId, addedBy: userId, pos: (maxPos._max.pos ?? 0) + 1 } });
          const fresh = await refreshJam(jamId);
          if (fresh) {
            broadcastQueue(fresh);
            broadcastState(fresh);
          }
          return;
        }

        if (action === 'queue-remove') {
          const qi = Number(d.qi);
          if (!Number.isInteger(qi) || qi <= 0) return;
          const removed = await prisma.jamQueueItem.deleteMany({ where: { id: qi, jamId } });
          if (removed.count > 0) {
            await renumberQueue(jamId);
          }
          const fresh = await refreshJam(jamId);
          if (fresh) broadcastQueue(fresh);
          return;
        }

        if (action === 'queue-move') {
          const qi = Number(d.qi);
          const dir = String(d.dir || '');
          const toIndex = Number.isFinite(Number(d.toIndex)) ? Number(d.toIndex) : null;
          if (!Number.isInteger(qi) || qi <= 0) return;
          const items = await prisma.jamQueueItem.findMany({ where: { jamId }, orderBy: [{ pos: 'asc' }, { createdAt: 'asc' }] });
          const idx = items.findIndex((x) => x.id === qi);
          if (idx === -1) return;
          let newIdx = idx;
          if (toIndex !== null) newIdx = Math.max(0, Math.min(items.length - 1, toIndex));
          else if (dir === 'up') newIdx = Math.max(0, idx - 1);
          else if (dir === 'down') newIdx = Math.min(items.length - 1, idx + 1);
          if (newIdx === idx) return;
          const [moved] = items.splice(idx, 1);
          items.splice(newIdx, 0, moved);
          const tx = [];
          items.forEach((x, i) => {
            if (x.pos !== i + 1) tx.push(prisma.jamQueueItem.update({ where: { id: x.id }, data: { pos: i + 1 } }));
          });
          if (tx.length) await prisma.$transaction(tx);
          const fresh = await refreshJam(jamId);
          if (fresh) broadcastQueue(fresh);
          return;
        }

        const cur = await refreshJam(jamId);
        if (!cur) return;

        if (action === 'play') {
          let songId = Number(d.songId);
          if (songId && Number.isInteger(songId) && songId > 0) {
            const song = await prisma.song.findUnique({ where: { id: songId }, select: { durationSec: true } });
            if (!song) return;
            const position = Math.max(0, Math.min((song.durationSec || 0) * 1000, Number(d.position) || 0));
            await prisma.jam.update({
              where: { id: jamId },
              data: { currentSongId: songId, currentStartedAt: new Date(), currentPlaying: true, currentPosition: position },
            });
          } else if (!cur.currentSongId) {
            const first = cur.queueItems[0];
            if (first) {
              await prisma.jam.update({
                where: { id: jamId },
                data: { currentSongId: first.songId, currentStartedAt: new Date(), currentPlaying: true, currentPosition: 0 },
              });
              await prisma.jamQueueItem.delete({ where: { id: first.id } });
            }
          } else if (!cur.currentPlaying) {
            await prisma.jam.update({
              where: { id: jamId },
              data: { currentPlaying: true, currentStartedAt: new Date() },
            });
          }
        } else if (action === 'pause') {
          if (cur.currentPlaying) {
            await prisma.jam.update({
              where: { id: jamId },
              data: { currentPlaying: false, currentPosition: livePositionMs(cur) },
            });
          }
        } else if (action === 'resume') {
          if (cur.currentSongId && !cur.currentPlaying) {
            await prisma.jam.update({
              where: { id: jamId },
              data: { currentPlaying: true, currentStartedAt: new Date() },
            });
          }
        } else if (action === 'seek') {
          if (cur.currentSongId) {
            const requested = Math.max(0, Number(d.position) || 0);
            const durationMs = Math.max(0, (cur.currentSong.durationSec || 0) * 1000);
            const pos = durationMs > 0 ? Math.min(durationMs, requested) : requested;
            await prisma.jam.update({
              where: { id: jamId },
              data: { currentPlaying: cur.currentPlaying, currentPosition: pos, currentStartedAt: cur.currentPlaying ? new Date() : cur.currentStartedAt },
            });
          }
        } else if (action === 'skip') {
          await advanceQueue(jamId);
          return;
        } else if (action === 'ended') {
          await advanceQueue(jamId);
          return;
        }

        const fresh = await refreshJam(jamId);
        if (fresh) broadcastState(fresh);
      } catch (e) {
        console.error('music:control error:', e && e.message);
      }
    });

    socket.on('music:ended', async (jamId) => {
      if (typeof jamId !== 'string' || !jamId) return;
      try {
        const member = await prisma.jamMember.findUnique({ where: { jamId_userId: { jamId, userId } } });
        if (!member) return;
        await advanceQueue(jamId);
      } catch (e) {
        console.error('music:ended error:', e && e.message);
      }
    });

    const cinemaPositionMs = (jam) => {
      if (jam.currentCinemaPlaying && jam.currentCinemaStartedAt) {
        return jam.currentCinemaPosition + (Date.now() - jam.currentCinemaStartedAt.getTime());
      }
      return jam.currentCinemaPosition;
    };

    const cinemaPayloadJS = (video) => video ? {
      id: video.id,
      title: video.title,
      description: video.description,
      kind: video.kind,
      externalUrl: video.externalUrl || null,
      thumbnailUrl: video.thumbnailUrl || null,
      subtitlesUrl: video.subtitlesUrl || null,
      durationSec: video.durationSec,
    } : null;

    const refreshCinemaJam = async (jamId) => prisma.jam.findUnique({
      where: { id: jamId },
      include: { currentCinemaVideo: true, members: true },
    });

    const broadcastCinemaState = (jam) => {
      io.to(`jam:${jam.id}`).emit('cinema:state', {
        jamId: jam.id,
        now: cinemaPayloadJS(jam.currentCinemaVideo),
        playing: jam.currentCinemaPlaying,
        positionMs: cinemaPositionMs(jam),
        atMs: Date.now(),
        durationSec: jam.currentCinemaVideo ? jam.currentCinemaVideo.durationSec : 0,
      });
    };

    socket.on('cinema:sync', async (jamId) => {
      if (typeof jamId !== 'string' || !jamId) return;
      try {
        const jam = await refreshCinemaJam(jamId);
        if (!jam || jam.kind !== 'MOVIE' || !jam.members.some((member) => member.userId === userId)) return;
        broadcastCinemaState(jam);
      } catch (e) {
        console.error('cinema:sync error:', e && e.message);
      }
    });

    socket.on('cinema:control', async (d) => {
      if (!d || typeof d !== 'object' || typeof d.jamId !== 'string') return;
      const jamId = d.jamId;
      const action = String(d.action || '').toLowerCase();
      try {
        const jam = await refreshCinemaJam(jamId);
        if (!jam || jam.kind !== 'MOVIE') return;
        const member = jam.members.find((item) => item.userId === userId);
        if (!member) return;
        const canControl = jam.ownerId === userId || !!socket.data.isAdmin || member.role === 'MINI_HOST';
        if (!canControl) return;
        const videoId = Number(d.videoId);
        const position = Number(d.position);
        const update = {};

        if (action === 'load' || (action === 'play' && Number.isInteger(videoId) && videoId > 0)) {
          const video = await prisma.cinemaVideo.findFirst({ where: { id: videoId, visibility: 'PUBLIC' } });
          if (!video) return;
          update.currentCinemaVideoId = video.id;
          update.currentCinemaPosition = Math.max(0, Math.min(video.durationSec * 1000, Number.isFinite(position) ? position : 0));
          update.currentCinemaPlaying = action === 'play';
          update.currentCinemaStartedAt = action === 'play' ? new Date() : null;
        } else if (action === 'play' || action === 'resume') {
          if (!jam.currentCinemaVideoId) return;
          update.currentCinemaPlaying = true;
          update.currentCinemaStartedAt = new Date();
        } else if (action === 'pause') {
          update.currentCinemaPlaying = false;
          update.currentCinemaPosition = cinemaPositionMs(jam);
          update.currentCinemaStartedAt = null;
        } else if (action === 'seek') {
          if (!jam.currentCinemaVideoId) return;
          const durationMs = Math.max(0, (jam.currentCinemaVideo?.durationSec || 0) * 1000);
          const requested = Math.max(0, Number.isFinite(position) ? position : 0);
          update.currentCinemaPosition = durationMs > 0 ? Math.min(durationMs, requested) : requested;
          update.currentCinemaStartedAt = jam.currentCinemaPlaying ? new Date() : null;
        } else if (action === 'ended') {
          update.currentCinemaPlaying = false;
          update.currentCinemaPosition = Math.max(0, (jam.currentCinemaVideo?.durationSec || 0) * 1000);
          update.currentCinemaStartedAt = null;
        } else {
          return;
        }

        await prisma.jam.update({ where: { id: jamId }, data: update });
        const fresh = await refreshCinemaJam(jamId);
        if (fresh) broadcastCinemaState(fresh);
      } catch (e) {
        console.error('cinema:control error:', e && e.message);
      }
    });

    socket.on('jam:role', async (d) => {
      if (!d || typeof d !== 'object' || typeof d.jamId !== 'string' || !Number.isInteger(d.userId)) return;
      const jamId = d.jamId;
      const targetUserId = d.userId;
      const role = String(d.role || '');
      if (role !== 'MINI_HOST' && role !== 'MEMBER') return;
      try {
        const jam = await prisma.jam.findUnique({ where: { id: jamId }, select: { id: true, ownerId: true, members: true } });
        if (!jam || jam.ownerId !== userId) return;
        const target = jam.members.find((m) => m.userId === targetUserId);
        if (!target || targetUserId === userId) return;
        await prisma.jamMember.update({ where: { jamId_userId: { jamId, userId: targetUserId } }, data: { role } });
        io.to(`jam:${jamId}`).emit('jam:update', jamId);
      } catch (e) {
        console.error('jam:role error:', e && e.message);
      }
    });

    socket.on('jam:join', async (jamId) => {
      if (typeof jamId !== 'string' || !jamId) return;
      try {
        const member = await prisma.jamMember.findUnique({ where: { jamId_userId: { jamId, userId } } });
        if (member) socket.join(`jam:${jamId}`);
        else socket.leave(`jam:${jamId}`);
      } catch (e) {
        console.error('jam:join error:', e && e.message);
      }
    });

    socket.on('jam:leave', (jamId) => {
      if (typeof jamId === 'string' && jamId) {
        leaveVoice(jamId);
        socket.leave(`jam:${jamId}`);
      }
    });

    const voiceRoster = (jamId) => {
      const peers = voicePeers.get(jamId);
      if (!peers) return [];
      return [...peers.entries()].map(([sid, m]) => ({ socketId: sid, userId: m.userId, muted: m.muted }));
    };

    const leaveVoice = (jamId) => {
      const peers = voicePeers.get(jamId);
      if (!peers || !peers.has(socket.id)) return;
      peers.delete(socket.id);
      if (peers.size === 0) voicePeers.delete(jamId);
      if (socket.data.voiceJams) socket.data.voiceJams.delete(jamId);
      const roster = voiceRoster(jamId);
      for (const socketId of peers?.keys() ?? []) {
        io.to(socketId).emit('voice:update', { jamId, members: roster });
      }
    };

    socket.on('voice:join', async (jamId) => {
      if (typeof jamId !== 'string' || !jamId) return;
      try {
        const member = await prisma.jamMember.findUnique({ where: { jamId_userId: { jamId, userId } } });
        if (!member) {
          socket.emit('voice:error', { jamId, message: 'You are not in this jam' });
          return;
        }
        socket.join(`jam:${jamId}`);
        let peers = voicePeers.get(jamId);
        if (!peers) {
          peers = new Map();
          voicePeers.set(jamId, peers);
        }
        peers.set(socket.id, { userId, muted: socket.data.voiceMuted === true });
        if (!socket.data.voiceJams) socket.data.voiceJams = new Set();
        socket.data.voiceJams.add(jamId);
        const roster = voiceRoster(jamId);
        socket.emit('voice:members', { jamId, members: roster });
        for (const socketId of peers.keys()) {
          if (socketId !== socket.id) io.to(socketId).emit('voice:update', { jamId, members: roster });
        }
      } catch (e) {
        console.error('voice:join error:', e && e.message);
      }
    });

    socket.on('voice:signal', (d) => {
      if (!d || typeof d.jamId !== 'string' || typeof d.to !== 'string' || !d.payload || typeof d.payload !== 'object') return;
      const peers = voicePeers.get(d.jamId);
      if (!peers || !peers.has(socket.id) || !peers.has(d.to)) return;
      io.to(d.to).emit('voice:signal', { jamId: d.jamId, from: socket.id, payload: d.payload });
    });

    socket.on('voice:mute', (d) => {
      if (!d || typeof d.jamId !== 'string' || typeof d.muted !== 'boolean') return;
      const peers = voicePeers.get(d.jamId);
      if (!peers || !peers.has(socket.id)) return;
      const m = peers.get(socket.id);
      m.muted = d.muted;
      socket.data.voiceMuted = d.muted;
      const roster = voiceRoster(d.jamId);
      for (const socketId of peers.keys()) {
        if (socketId !== socket.id) io.to(socketId).emit('voice:update', { jamId: d.jamId, members: roster });
      }
    });

    socket.on('voice:leave', (jamId) => {
      if (typeof jamId === 'string' && jamId) leaveVoice(jamId);
    });

    socket.on('typing', async (d) => {
      if (!d || typeof d !== 'object') return;
      if (d.jam && typeof d.jam === 'string') {
        if (!allowTyping(`jam:${d.jam}`)) return;
        try {
          const member = await prisma.jamMember.findUnique({ where: { jamId_userId: { jamId: d.jam, userId } } });
          if (!member) return;
          io.to(`jam:${d.jam}`).emit('typing:update', { jam: d.jam, user: userId, from: socket.id });
        } catch (e) {
          console.error('typing jam error:', e && e.message);
        }
      }
      if (d.dm && typeof d.dm !== 'object' && Number.isFinite(Number(d.dm))) {
        const otherId = Number(d.dm);
        if (!Number.isInteger(otherId) || otherId === userId) return;
        if (!allowTyping(`dm:${otherId}`)) return;
        try {
          const rel = await prisma.friendRequest.findFirst({
            where: { status: 'FRIENDS', OR: [{ fromId: userId, toId: otherId }, { fromId: otherId, toId: userId }] },
          });
          if (!rel) return;
          io.to(`user:${otherId}`).emit('typing:update', { dm: otherId, user: userId, from: socket.id });
        } catch (e) {
          console.error('typing dm error:', e && e.message);
        }
      }
    });

    socket.on('disconnect', () => {
      const s = online.get(userId);
      if (s) {
        s.delete(socket.id);
        if (s.size === 0) online.delete(userId);
      }
      pushPresence();
      if (socket.data.voiceJams && socket.data.voiceJams.size) {
        for (const jamId of [...socket.data.voiceJams]) leaveVoice(jamId);
      }
      typingAt.clear();
    });
  });

  globalThis.__jaminoLive = { io, prisma, online, pushPresence, invalidateFriendCache: (a, b) => { friendCache.delete(a); friendCache.delete(b); } };

 server.listen(port, '0.0.0.0', () => {
  console.log(`> Jamino live server ready on http://0.0.0.0:${port}`);
});
  
});
