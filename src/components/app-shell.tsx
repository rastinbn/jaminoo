'use client';

import { useEffect } from 'react';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/store/app-store';
import { PanelShell } from '@/components/panel-shell';
import { TopRightControls } from '@/components/top-controls';
import { ToastHost } from '@/components/toast-host';
import { motion, AnimatePresence } from 'framer-motion';
import { HubGateway } from '@/components/hub-gateway';
import { MusicHub } from '@/components/music-hub';
import { VideoHub } from '@/components/video-hub';
import { CinemaHub } from '@/components/cinema-hub';
import { TweetHub } from '@/components/tweet-hub';
import { LandingPage } from '@/components/landing-page';
import { useSyncRouting } from '@/lib/sync-routing';

export function AppShell() {
  const { me, booted, setMe, setBooted, product } = useAppStore();
  useSyncRouting();

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ user: import('@/store/app-store').Me }>('/api/auth');
        setMe(res.user);
      } catch {
        setMe(null);
      } finally {
        setBooted(true);
      }
    })();
  }, [setMe, setBooted]);

  if (!booted) {
    return (
      <div className="screen screen-auth" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <div className="wordmark" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="wordmark-mark">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 3 5 21" />
              <path d="M22 17a2 2 0 1 0-4-1.5L16 21a2 2 0 1 0 4 0Z" />
            </svg>
          </span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>Jamino</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {!me && <TopRightControls />}
      <ToastHost />
      <AnimatePresence mode="wait">
        {me ? (
          <motion.div key="panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {product === 'home' ? <HubGateway /> : product === 'music' ? <MusicHub /> : product === 'video' ? <VideoHub /> : product === 'cinema' ? <CinemaHub /> : product === 'tweet' ? <TweetHub /> : <PanelShell />}
          </motion.div>
        ) : (
          <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <LandingPage />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
