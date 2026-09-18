'use client';

import { create } from 'zustand';

export interface PubUser {
  id: number;
  username: string;
  uid: string;
  avatarId: number;
  bio: string;
  github: boolean;
  status: string;
  statusText: string;
  createdAt: string;
  avatarPhoto: string | null;
}

export interface Me {
  id: number;
  username: string;
  email: string;
  avatarId: number;
  bio: string;
  github: boolean;
  status: string;
  statusText: string;
  createdAt: string;
  avatarPhoto: string | null;
}

export type Tab = 'profile' | 'security' | 'friends' | 'jams' | 'dms';
export type AuthView = 'login' | 'signup' | 'forgot';
export type HubProduct = 'home' | 'community' | 'music' | 'video' | 'cinema' | 'tweet';

export interface Unread {
  friends: number;
  invites: number;
  dms: number;
  notifications: number;
}

interface AppState {
  me: Me | null;
  booted: boolean;
  tab: Tab;
  product: HubProduct;
  authView: AuthView;
  roomId: string | null;
  dmWith: number | null;
  profileUserId: number | null;
  online: number[];
  presenceMap: Record<number, { status: string; statusText: string }>;
  unread: Unread;
  setMe: (me: Me | null) => void;
  setBooted: (b: boolean) => void;
  setTab: (t: Tab) => void;
  setProduct: (product: HubProduct) => void;
  setAuthView: (v: AuthView) => void;
  setRoomId: (id: string | null) => void;
  setDmWith: (id: number | null) => void;
  setProfileUserId: (id: number | null) => void;
  setUnread: (u: Partial<Unread>) => void;
  setOnline: (ids: number[]) => void;
  setPresenceMap: (map: Record<number, { status: string; statusText: string }>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  me: null,
  booted: false,
  tab: 'profile',
  product: 'home',
  authView: 'login',
  roomId: null,
  dmWith: null,
  profileUserId: null,
online: [],
  presenceMap: {},
  unread: { friends: 0, invites: 0, dms: 0, notifications: 0 },
  setMe: (me) => set({ me }),
  setBooted: (booted) => set({ booted }),
  setTab: (tab) => set({ tab, roomId: null, dmWith: null, profileUserId: null }),
  setProduct: (product) => set({ product, tab: 'profile', roomId: null, dmWith: null, profileUserId: null }),
  setAuthView: (authView) => set({ authView }),
  setRoomId: (roomId) => set({ roomId, dmWith: null, profileUserId: null }),
  setDmWith: (dmWith) => set({ dmWith, roomId: null, profileUserId: null }),
  setProfileUserId: (profileUserId) => set({ profileUserId, roomId: null, dmWith: null }),
  setUnread: (u) => set((s) => ({ unread: { ...s.unread, ...u } })),
  setOnline: (online) => set({ online }),
  setPresenceMap: (presenceMap) => set({ presenceMap }),
}));

export function uidDisplay(id: number) {
  return `JM-${String(id).padStart(4, '0')}`;
}
