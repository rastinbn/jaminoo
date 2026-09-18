'use client';

import { useAppStore, type HubProduct } from '@/store/app-store';
import { useTranslations } from '@/providers/use-translations';
import { JaminoAvatar } from '@/components/jamino-avatar';
import { TopRightControls } from '@/components/top-controls';
import { ArrowLeft, ArrowRight, Bird, House, Music2, PlaySquare, UsersRound, Clapperboard } from 'lucide-react';
import type { ReactNode } from 'react';
import { GlobalSearch } from '@/components/global-search';
import { NowFeed } from '@/components/now-feed';

const HUBS: { id: Exclude<HubProduct, 'home'>; icon: typeof Music2; title: string; description: string; tone: string }[] = [
  { id: 'community', icon: UsersRound, title: 'Community Hub', description: 'Friends, Jams, chat and your account workspace.', tone: 'community' },
  { id: 'music', icon: Music2, title: 'Music Hub', description: 'A dedicated home for music, playlists and listening.', tone: 'music' },
  { id: 'video', icon: PlaySquare, title: 'Video Hub', description: 'A separate space for video discovery and watching.', tone: 'video' },
  { id: 'cinema', icon: Clapperboard, title: 'Cinema Hub', description: 'Movies, series and watch-together sessions.', tone: 'cinema' },
  { id: 'tweet', icon: Bird, title: 'Tweet Hub', description: 'Share short thoughts, follow people and ride the trends.', tone: 'tweet' },
];

export function WorkspaceTopbar({ onHome, product, children }: { onHome?: () => void; product?: string; children?: ReactNode }) {
  const me = useAppStore((state) => state.me);
  const t = useTranslations();
  return (
    <div className="topbar hub-topbar">
      <button className="wordmark" onClick={onHome} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="wordmark-mark"><House size={16} /></span>
        {t('brand.name')}
      </button>
      <div className="hub-topbar-center">{product ?? 'Choose a workspace'}</div>
      <div className="tb-right">
        <GlobalSearch />
        {children}
        <TopRightControls inline />
        <div className="user-chip">
          {me && <JaminoAvatar avatarId={me.avatarId} size={32} photo={me.avatarPhoto} name={me.username} />}
          {me && <span className="friend-name" style={{ fontSize: 14 }}>{me.username}</span>}
        </div>
      </div>
    </div>
  );
}

export function HubGateway() {
  const setProduct = useAppStore((state) => state.setProduct);
  const me = useAppStore((state) => state.me);
  return (
    <div className="hub-shell">
      <WorkspaceTopbar product="Choose a workspace" />
      <main className="hub-gateway-content">
        <div className="hub-kicker">JAMINO WORKSPACE</div>
        <h1>Where do you want to go?</h1>
        <p className="hub-lead">One account, connected services, purpose-built experiences.</p>
        <div className="hub-card-grid">
          {HUBS.map(({ id, icon: Icon, title, description, tone }) => (
            <button type="button" className={`hub-card hub-card-${tone}`} key={id} onClick={() => setProduct(id)}>
              <span className="hub-card-icon"><Icon size={26} /></span>
              <span className="hub-card-copy"><strong>{title}</strong><span>{description}</span></span>
              <ArrowRight className="hub-card-arrow" size={18} />
            </button>
          ))}
        </div>
        {me && <div className="hub-account-note">Signed in as <b>@{me.username}</b>. Your identity and friends stay shared across every hub.</div>}
        {me && <NowFeed />}
      </main>
    </div>
  );
}

export function EmptyHub({ kind }: { kind: 'music' | 'video' }) {
  const setProduct = useAppStore((state) => state.setProduct);
  const music = kind === 'music';
  return (
    <div className={`hub-shell hub-shell-${kind}`}>
      <WorkspaceTopbar onHome={() => setProduct('home')} product={music ? 'Music Hub' : 'Video Hub'} />
      <main className="hub-empty-content">
        <button type="button" className="hub-back" onClick={() => setProduct('home')}><ArrowLeft size={15} /> All hubs</button>
        <div className="hub-empty-icon">{music ? <Music2 size={34} /> : <PlaySquare size={34} />}</div>
        <div className="hub-kicker">{music ? 'MUSIC HUB' : 'VIDEO HUB'}</div>
        <h1>{music ? 'Your music space is ready.' : 'Your video space is ready.'}</h1>
        <p>{music ? 'This service will have its own player, library, discovery and social features.' : 'This service will have its own feed, player, playlists and creator features.'}</p>
        <span className="hub-empty-badge">Workspace created · Features coming next</span>
      </main>
    </div>
  );
}
