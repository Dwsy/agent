import { create } from 'zustand';

type UIState = {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
}));
