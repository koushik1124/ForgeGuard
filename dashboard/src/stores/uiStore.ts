/**
 * UI Store
 * Manages client-side visual state: sidebar collapsing, mobile drawer, toasts.
 */

import { create } from 'zustand';

export interface ToastNotification {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'warning' | 'info';
}

interface UIStore {
  sidebarCollapsed: boolean;
  isSidebarCollapsed: boolean;
  mobileDrawerOpen: boolean;
  isMobileDrawerOpen: boolean;
  toast: ToastNotification;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleMobileDrawer: () => void;
  setMobileDrawerOpen: (open: boolean) => void;
  showToast: (message: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;
  addToast: (options: { type: 'success' | 'error' | 'warning' | 'info'; message: string }) => void;
  hideToast: () => void;
}

const getStoredSidebarState = (): boolean => {
  try {
    return localStorage.getItem('forgeguard_sidebar_collapsed') === 'true';
  } catch {
    return false;
  }
};

const initialSidebar = getStoredSidebarState();

export const useUIStore = create<UIStore>((set, get) => ({
  sidebarCollapsed: initialSidebar,
  isSidebarCollapsed: initialSidebar,
  mobileDrawerOpen: false,
  isMobileDrawerOpen: false,
  toast: {
    open: false,
    message: '',
    severity: 'info',
  },

  toggleSidebar: () => {
    set((state) => {
      const next = !state.sidebarCollapsed;
      try {
        localStorage.setItem('forgeguard_sidebar_collapsed', String(next));
      } catch {
        // Ignored
      }
      return { sidebarCollapsed: next, isSidebarCollapsed: next };
    });
  },

  setSidebarCollapsed: (collapsed: boolean) => {
    try {
      localStorage.setItem('forgeguard_sidebar_collapsed', String(collapsed));
    } catch {
      // Ignored
    }
    set({ sidebarCollapsed: collapsed, isSidebarCollapsed: collapsed });
  },

  toggleMobileDrawer: () => {
    set((state) => ({
      mobileDrawerOpen: !state.mobileDrawerOpen,
      isMobileDrawerOpen: !state.mobileDrawerOpen,
    }));
  },

  setMobileDrawerOpen: (open: boolean) => {
    set({ mobileDrawerOpen: open, isMobileDrawerOpen: open });
  },

  showToast: (message: string, severity: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    set({
      toast: {
        open: true,
        message,
        severity,
      },
    });
  },

  addToast: ({ type, message }) => {
    get().showToast(message, type);
  },

  hideToast: () => {
    set((state) => ({
      toast: {
        ...state.toast,
        open: false,
      },
    }));
  },
}));
