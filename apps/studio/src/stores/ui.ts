import { create } from "zustand";

// Ephemeral UI state ONLY — nothing server-derived belongs here (that's
// TanStack Query's job). Selection and playhead are the whole remit.
interface UIState {
  selectedSceneId: string | null;
  setSelectedSceneId: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedSceneId: null,
  setSelectedSceneId: (id) => set({ selectedSceneId: id }),
}));
