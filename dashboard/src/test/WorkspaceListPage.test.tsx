import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { WorkspaceListPage } from '../pages/WorkspaceListPage';

const mockWorkspaces = [
  {
    workspace_id: 'ws-alpha',
    name: 'Alpha Project',
    root_path: '/home/user/projects/alpha',
    created_at: '2026-11-20T10:00:00Z',
    description: 'Primary backend workspace',
  },
  {
    workspace_id: 'ws-beta',
    name: 'Beta Project',
    root_path: '/home/user/projects/beta',
    created_at: '2026-11-21T12:00:00Z',
    description: 'Data analytics service',
  },
];

describe('WorkspaceListPage Integration (M9.7.1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders workspace list correctly from API data', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/workspaces')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ workspaces: mockWorkspaces }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderWithProviders(<WorkspaceListPage />);

    expect(screen.getByText('Workspace Explorer')).toBeInTheDocument();
    expect(screen.getByText('Strict Directory Containment Invariant')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Alpha Project')).toBeInTheDocument();
      expect(screen.getByText('Beta Project')).toBeInTheDocument();
      expect(screen.getByText('ws-alpha')).toBeInTheDocument();
      expect(screen.getByText('ws-beta')).toBeInTheDocument();
      expect(screen.getByText('/home/user/projects/alpha')).toBeInTheDocument();
    });
  });

  it('renders empty state when no workspaces are registered', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/workspaces')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ workspaces: [] }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderWithProviders(<WorkspaceListPage />);

    await waitFor(() => {
      expect(screen.getByText('No registered workspaces')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /register first workspace/i })).toBeInTheDocument();
    });
  });

  it('renders error state on API failure', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/workspaces')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({
            error: {
              code: 'FG-INTERNAL-500',
              message: 'Database query failed.',
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderWithProviders(<WorkspaceListPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to Load Workspaces')).toBeInTheDocument();
      expect(screen.getByText('Database query failed.')).toBeInTheDocument();
    });
  });

  it('validates registration inputs and executes registration flow', async () => {
    let registerPayload: unknown = null;

    global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.endsWith('/api/v1/workspaces') && options?.method === 'POST') {
        registerPayload = JSON.parse(options.body);
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            workspace_id: 'ws-new',
            name: 'New Service',
            root_path: '/tmp/new_service',
            created_at: '2026-11-24T05:00:00Z',
            description: 'New service directory',
          }),
        });
      }
      if (url.includes('/api/v1/workspaces')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ workspaces: [] }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderWithProviders(<WorkspaceListPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /register first workspace/i })).toBeInTheDocument();
    });

    // Open register dialog
    fireEvent.click(screen.getByRole('button', { name: /register first workspace/i }));

    expect(screen.getByText('Register Workspace Directory')).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: 'New Service' } });
    fireEvent.change(screen.getByLabelText(/root directory path/i), { target: { value: '/tmp/new_service' } });
    fireEvent.change(screen.getByLabelText(/description \(optional\)/i), { target: { value: 'New service directory' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /^register workspace$/i });
    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(registerPayload).toEqual({
        name: 'New Service',
        root_path: '/tmp/new_service',
        description: 'New service directory',
      });
    });
  });

  it('supports unregistration flow with confirmation dialog', async () => {
    let unregisterCalled = false;

    global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
      if (url.includes('/api/v1/workspaces/ws-alpha') && options?.method === 'DELETE') {
        unregisterCalled = true;
        return Promise.resolve({
          ok: true,
          status: 204,
          text: async () => '',
        });
      }
      if (url.includes('/api/v1/workspaces')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ workspaces: mockWorkspaces }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderWithProviders(<WorkspaceListPage />);

    await waitFor(() => {
      expect(screen.getByText('Alpha Project')).toBeInTheDocument();
    });

    // Click trash icon for first workspace
    const unregisterButtons = screen.getAllByRole('button', { name: /unregister workspace/i });
    fireEvent.click(unregisterButtons[0]);

    // Modal confirmation dialog must appear with non-destructive explanation
    expect(screen.getByRole('heading', { name: 'Unregister Workspace' })).toBeInTheDocument();
    expect(screen.getByText(/it does not delete files from disk/i)).toBeInTheDocument();

    // Confirm in dialog
    const confirmButtons = screen.getAllByRole('button', { name: /unregister workspace/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(unregisterCalled).toBe(true);
    });
  });
});
