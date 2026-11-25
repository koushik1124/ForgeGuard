/**
 * Connection Store
 * Manages API configuration and live connection status.
 *
 * Security Principle:
 * By default, credentials are strictly IN-MEMORY and are never written to disk or localStorage.
 * An optional explicit opt-in persistence switch exists with clear security warnings.
 */

import { create } from 'zustand';
import { ConnectionState, ConnectionTestResult } from '../api/types';
import { apiClient } from '../api/client';

export const DEFAULT_BASE_URL = 'http://127.0.0.1:8000';

interface ConnectionStore {
  baseUrl: string;
  apiKey: string;
  persistToLocalStorage: boolean;
  persistCredentials: boolean;
  connectionState: ConnectionState;
  latencyMs: number | null;
  lastSynchronizedAt: string | null;
  lastTestResult: ConnectionTestResult | null;
  testResult: ConnectionTestResult | null;

  setBaseUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setPersistToLocalStorage: (persist: boolean) => void;
  setPersistCredentials: (persist: boolean) => void;
  setConnectionState: (state: ConnectionState) => void;
  setLastTestResult: (result: ConnectionTestResult) => void;
  setTestResult: (result: ConnectionTestResult) => void;
  updateSyncStatus: (state: ConnectionState, latencyMs?: number | null) => void;
  saveConfiguration: (baseUrl: string, apiKey: string, persist: boolean) => void;
  resetConfiguration: () => void;
  resetDefaults: () => void;
}

const loadInitialState = () => {
  try {
    const isPersistAllowed = localStorage.getItem('forgeguard_persist_config') === 'true';
    if (isPersistAllowed) {
      const savedBaseUrl = localStorage.getItem('forgeguard_base_url');
      const savedApiKey = localStorage.getItem('forgeguard_api_key');
      return {
        baseUrl: savedBaseUrl || DEFAULT_BASE_URL,
        apiKey: savedApiKey || '',
        persistToLocalStorage: true,
      };
    }
  } catch {
    // LocalStorage unavailable in certain environments
  }
  return {
    baseUrl: DEFAULT_BASE_URL,
    apiKey: '',
    persistToLocalStorage: false,
  };
};

const initial = loadInitialState();

apiClient.updateConfig({
  baseUrl: initial.baseUrl,
  apiKey: initial.apiKey || undefined,
});

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  baseUrl: initial.baseUrl,
  apiKey: initial.apiKey,
  persistToLocalStorage: initial.persistToLocalStorage,
  persistCredentials: initial.persistToLocalStorage,
  connectionState: 'disconnected', // Initial state must always be Disconnected
  latencyMs: null,
  lastSynchronizedAt: null,
  lastTestResult: null,
  testResult: null,

  setBaseUrl: (url: string) => {
    set({ baseUrl: url });
    apiClient.updateConfig({ baseUrl: url });
    if (get().persistToLocalStorage) {
      try {
        localStorage.setItem('forgeguard_base_url', url);
      } catch {
        // Ignored
      }
    }
  },

  setApiKey: (key: string) => {
    set({ apiKey: key });
    apiClient.updateConfig({ apiKey: key || undefined });
    if (get().persistToLocalStorage) {
      try {
        localStorage.setItem('forgeguard_api_key', key);
      } catch {
        // Ignored
      }
    }
  },

  setPersistToLocalStorage: (persist: boolean) => {
    set({ persistToLocalStorage: persist, persistCredentials: persist });
    try {
      if (!persist) {
        localStorage.removeItem('forgeguard_persist_config');
        localStorage.removeItem('forgeguard_base_url');
        localStorage.removeItem('forgeguard_api_key');
      } else {
        localStorage.setItem('forgeguard_persist_config', 'true');
        localStorage.setItem('forgeguard_base_url', get().baseUrl);
        if (get().apiKey) {
          localStorage.setItem('forgeguard_api_key', get().apiKey);
        }
      }
    } catch {
      // Ignored
    }
  },

  setPersistCredentials: (persist: boolean) => {
    get().setPersistToLocalStorage(persist);
  },

  setConnectionState: (connectionState: ConnectionState) => set({ connectionState }),

  setLastTestResult: (lastTestResult: ConnectionTestResult) => {
    set({
      lastTestResult,
      testResult: lastTestResult,
      connectionState: lastTestResult.state,
      latencyMs: lastTestResult.latencyMs,
      lastSynchronizedAt: lastTestResult.testedAt,
    });
  },

  setTestResult: (result: ConnectionTestResult) => {
    get().setLastTestResult(result);
  },

  updateSyncStatus: (state: ConnectionState, latencyMs?: number | null) => {
    set({
      connectionState: state,
      lastSynchronizedAt: new Date().toISOString(),
      ...(latencyMs !== undefined ? { latencyMs } : {}),
    });
  },

  saveConfiguration: (baseUrl: string, apiKey: string, persist: boolean) => {
    set({
      baseUrl,
      apiKey,
      persistToLocalStorage: persist,
      persistCredentials: persist,
    });

    apiClient.updateConfig({
      baseUrl,
      apiKey: apiKey || undefined,
    });

    try {
      if (persist) {
        localStorage.setItem('forgeguard_persist_config', 'true');
        localStorage.setItem('forgeguard_base_url', baseUrl);
        if (apiKey) {
          localStorage.setItem('forgeguard_api_key', apiKey);
        } else {
          localStorage.removeItem('forgeguard_api_key');
        }
      } else {
        localStorage.removeItem('forgeguard_persist_config');
        localStorage.removeItem('forgeguard_base_url');
        localStorage.removeItem('forgeguard_api_key');
      }
    } catch {
      // Ignored
    }
  },

  resetConfiguration: () => {
    try {
      localStorage.removeItem('forgeguard_persist_config');
      localStorage.removeItem('forgeguard_base_url');
      localStorage.removeItem('forgeguard_api_key');
    } catch {
      // Ignored
    }

    set({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: '',
      persistToLocalStorage: false,
      persistCredentials: false,
      connectionState: 'disconnected',
      latencyMs: null,
      lastSynchronizedAt: null,
      lastTestResult: null,
      testResult: null,
    });

    apiClient.updateConfig({
      baseUrl: DEFAULT_BASE_URL,
      apiKey: undefined,
    });
  },

  resetDefaults: () => {
    get().resetConfiguration();
  },
}));
