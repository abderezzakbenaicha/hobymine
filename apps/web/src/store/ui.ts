import { create } from 'zustand';
import type { MatchSummary } from '../types';

export interface PaywallState {
  reason: 'like_limit' | 'rewind' | 'video_limit';
  limit?: number;
  used?: number;
  resetsAt?: string;
}

interface UiState {
  newMatch: MatchSummary | null;
  showMatch: (match: MatchSummary) => void;
  dismissMatch: () => void;
  filterOpen: boolean;
  setFilterOpen: (open: boolean) => void;
  reportTarget: { id: string; name: string; matchId?: string } | null;
  openReport: (target: { id: string; name: string; matchId?: string }) => void;
  closeReport: () => void;
  blockTarget: { id: string; name: string; matchId?: string } | null;
  openBlock: (target: { id: string; name: string; matchId?: string }) => void;
  closeBlock: () => void;
  paywall: PaywallState | null;
  openPaywall: (state: PaywallState) => void;
  closePaywall: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  newMatch: null,
  showMatch: (match) => set({ newMatch: match }),
  dismissMatch: () => set({ newMatch: null }),
  filterOpen: false,
  setFilterOpen: (filterOpen) => set({ filterOpen }),
  reportTarget: null,
  openReport: (reportTarget) => set({ reportTarget }),
  closeReport: () => set({ reportTarget: null }),
  blockTarget: null,
  openBlock: (blockTarget) => set({ blockTarget }),
  closeBlock: () => set({ blockTarget: null }),
  paywall: null,
  openPaywall: (paywall) => set({ paywall }),
  closePaywall: () => set({ paywall: null }),
}));
