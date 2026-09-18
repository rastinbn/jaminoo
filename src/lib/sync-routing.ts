'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAppStore, type HubProduct, type Tab } from '@/store/app-store';

const TABS: Tab[] = ['profile', 'security', 'friends', 'jams', 'dms'];

function serialize(): string {
  const s = useAppStore.getState();
  const p = new URLSearchParams();
  if (s.product === 'music' || s.product === 'video' || s.product === 'cinema' || s.product === 'tweet') p.set('hub', s.product);
  else if (s.product === 'community' && s.profileUserId != null) p.set('hub', 'community'), p.set('user', String(s.profileUserId));
  else if (s.product === 'community' && s.roomId) p.set('hub', 'community'), p.set('room', s.roomId);
  else if (s.product === 'community' && s.dmWith != null) p.set('hub', 'community'), p.set('dm', String(s.dmWith));
  else if (s.product === 'community' && s.tab !== 'profile') p.set('hub', 'community'), p.set('tab', s.tab);
  else if (s.product === 'community') p.set('hub', 'community');
  else if (s.profileUserId != null) p.set('user', String(s.profileUserId));
  else if (s.roomId) p.set('room', s.roomId);
  else if (s.dmWith != null) p.set('dm', String(s.dmWith));
  else if (s.tab !== 'profile') p.set('tab', s.tab);
  const q = p.toString();
  return q ? `?${q}` : '';
}

function hydrateFromURL() {
  const sp = new URLSearchParams(window.location.search);
  const s = useAppStore.getState();
  const user = sp.get('user');
  const room = sp.get('room');
  const dm = sp.get('dm');
  const tab = sp.get('tab');
  const hub = sp.get('hub');
  const hasCommunityRoute = Boolean(user || room || dm || tab);
  const validHub: HubProduct = hub === 'community' || hub === 'music' || hub === 'video' || hub === 'cinema' || hub === 'tweet' ? hub : hasCommunityRoute ? 'community' : 'home';
  s.setProduct(validHub);
  if (validHub === 'music' || validHub === 'video' || validHub === 'cinema' || validHub === 'tweet') return;
  if (user && /^\d+$/.test(user)) {
    s.setProfileUserId(Number(user));
  } else if (room) {
    s.setRoomId(room);
  } else if (dm && /^\d+$/.test(dm)) {
    s.setDmWith(Number(dm));
  } else {
    s.setProfileUserId(null);
    s.setRoomId(null);
    s.setDmWith(null);
    s.setTab((TABS as string[]).includes(tab ?? '') ? (tab as Tab) : 'profile');
  }
}

export function useSyncRouting() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (window.location.search) hydrateFromURL();
  }, []);

  useEffect(() => {
    const unsub = useAppStore.subscribe(() => {
      const cur = window.location.pathname + window.location.search;
      const want = pathname + serialize();
      if (want !== cur) router.push(want, { scroll: false });
    });
    return unsub;
  }, [router, pathname]);

  useEffect(() => {
    const onPop = () => hydrateFromURL();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
