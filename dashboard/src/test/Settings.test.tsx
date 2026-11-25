import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsPage } from '../pages/SettingsPage';
import { renderWithProviders } from './test-utils';
import { useConnectionStore } from '../stores/connectionStore';

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useConnectionStore.getState().resetDefaults();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders default configuration values', () => {
    renderWithProviders(<SettingsPage />);

    const urlInput = screen.getByLabelText(/api base url/i) as HTMLInputElement;
    expect(urlInput.value).toBe('http://127.0.0.1:8000');
  });

  it('validates API base URL and rejects invalid formats', async () => {
    renderWithProviders(<SettingsPage />);

    const urlInput = screen.getByLabelText(/api base url/i);
    fireEvent.change(urlInput, { target: { value: 'invalid-url-without-protocol' } });
    fireEvent.blur(urlInput);

    expect(await screen.findByText(/must be a valid url/i)).toBeInTheDocument();
  });

  it('handles successful API connection test', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/health/ready')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'ready', database: true, engine: true, timestamp: '2026-11-22T00:00:00Z' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', version: '0.1.0', timestamp: '2026-11-22T00:00:00Z' }),
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    renderWithProviders(<SettingsPage />);

    const testButton = screen.getByRole('button', { name: /test connection/i });
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByText(/connection succeeded/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/forgeguard version: 0\.1\.0/i)).toBeInTheDocument();
  });

  it('handles failed API connection test gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network connection refused'));
    vi.stubGlobal('fetch', mockFetch);

    renderWithProviders(<SettingsPage />);

    const testButton = screen.getByRole('button', { name: /test connection/i });
    fireEvent.click(testButton);

    await waitFor(() => {
      expect(screen.getByText(/connection failed/i)).toBeInTheDocument();
    });
  });

  it('resets configuration back to defaults when reset is clicked', () => {
    renderWithProviders(<SettingsPage />);

    const urlInput = screen.getByLabelText(/api base url/i) as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'http://custom-api-host:9999' } });
    expect(urlInput.value).toBe('http://custom-api-host:9999');

    const resetButton = screen.getByRole('button', { name: /reset to defaults/i });
    fireEvent.click(resetButton);

    expect(urlInput.value).toBe('http://127.0.0.1:8000');
  });
});
