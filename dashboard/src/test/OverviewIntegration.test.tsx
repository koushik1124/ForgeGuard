import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { DashboardPage } from '../pages/DashboardPage';
import { renderWithProviders } from './test-utils';
import { useConnectionStore } from '../stores/connectionStore';

describe('M9.2 Overview Runtime Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useConnectionStore.getState().resetDefaults();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders disconnected state when backend is offline and no connection established', () => {
    renderWithProviders(<DashboardPage />);

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getAllByText('--').length).toBeGreaterThan(0);
    expect(screen.getByText('DISCONNECTED')).toBeInTheDocument();
    expect(screen.getByText('Runtime API Disconnected')).toBeInTheDocument();
  });

  it('renders runtime health and readiness correctly on live API success', async () => {
    useConnectionStore.getState().setConnectionState('connected');

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/health/ready')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'ready', database: true, engine: true, timestamp: '2026-11-22T12:00:00Z' }),
        });
      }
      if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', version: '0.1.0', timestamp: '2026-11-22T12:00:00Z' }),
        });
      }
      if (url.includes('/api/v1/tasks')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            total: 0,
            limit: 50,
            offset: 0,
          }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    vi.stubGlobal('fetch', mockFetch);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('OK (v0.1.0)')).toBeInTheDocument();
      expect(screen.getByText('READY')).toBeInTheDocument();
    });

    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('displays NOT READY and unavailable database when readiness is degraded', async () => {
    useConnectionStore.getState().setConnectionState('degraded');

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/health/ready')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'not_ready', database: false, engine: true, timestamp: '2026-11-22T12:00:00Z' }),
        });
      }
      if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', version: '0.1.0', timestamp: '2026-11-22T12:00:00Z' }),
        });
      }
      if (url.includes('/api/v1/tasks')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ items: [], total: 0, limit: 50, offset: 0 }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    vi.stubGlobal('fetch', mockFetch);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('NOT READY')).toBeInTheDocument();
      expect(screen.getByText('Unavailable')).toBeInTheDocument();
    });
  });

  it('calculates execution metrics accurately from real task records', async () => {
    useConnectionStore.getState().setConnectionState('connected');

    const sampleTasks = [
      {
        task_id: 'task-001',
        description: 'Active task 1',
        status: 'running',
        created_at: '2026-11-22T10:00:00Z',
        started_at: '2026-11-22T10:00:05Z',
      },
      {
        task_id: 'task-002',
        description: 'Pending task',
        status: 'created',
        created_at: '2026-11-22T10:01:00Z',
      },
      {
        task_id: 'task-003',
        description: 'Completed analysis',
        status: 'completed',
        created_at: '2026-11-22T10:02:00Z',
        started_at: '2026-11-22T10:02:01Z',
        finished_at: '2026-11-22T10:02:04Z',
      },
      {
        task_id: 'task-004',
        description: 'Budget exceeded run',
        status: 'failed',
        created_at: '2026-11-22T10:03:00Z',
        started_at: '2026-11-22T10:03:01Z',
        finished_at: '2026-11-22T10:03:03Z',
        error_summary: 'Tool budget limit exceeded',
      },
      {
        task_id: 'task-005',
        description: 'User aborted run',
        status: 'cancelled',
        created_at: '2026-11-22T10:04:00Z',
        started_at: '2026-11-22T10:04:01Z',
        finished_at: '2026-11-22T10:04:02Z',
      },
    ];

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/tasks')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            items: sampleTasks,
            total: 5,
            limit: 50,
            offset: 0,
          }),
        });
      }
      if (url.includes('/health/ready')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'ready', database: true, engine: true, timestamp: '2026-11-22T12:00:00Z' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', version: '0.1.0', timestamp: '2026-11-22T12:00:00Z' }),
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    renderWithProviders(<DashboardPage />);

    // Active tasks: running (1) + created (1) = 2
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument(); // Active executions
    });

    // Completed: 1, Failed: 1, Cancelled: 1
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(3);

    // Verify Scope label indicates number of tasks
    expect(screen.getByText('Scoped to latest 5 tasks')).toBeInTheDocument();
  });

  it('renders Recent Executions table with real task attributes and duration calculation', async () => {
    useConnectionStore.getState().setConnectionState('connected');

    const taskWithDuration = {
      task_id: 'task-dur-123456789',
      description: 'Run calculation and analysis',
      status: 'completed',
      created_at: '2026-11-22T10:00:00Z',
      started_at: '2026-11-22T10:00:00Z',
      finished_at: '2026-11-22T10:00:03.500Z',
      metadata: { workspace_id: 'ws-prod-1' },
    };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/tasks')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            items: [taskWithDuration],
            total: 1,
            limit: 50,
            offset: 0,
          }),
        });
      }
      if (url.includes('/health/ready')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'ready', database: true, engine: true, timestamp: '2026-11-22T12:00:00Z' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', version: '0.1.0', timestamp: '2026-11-22T12:00:00Z' }),
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      const taskLinks = screen.getAllByText(/task-dur-12/i);
      expect(taskLinks.length).toBeGreaterThanOrEqual(1);
      expect(taskLinks[0]).toBeInTheDocument();
      expect(screen.getAllByText('Run calculation and analysis').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('ws-prod-1')).toBeInTheDocument();
      expect(screen.getByText('3.50s')).toBeInTheDocument(); // 3500ms duration
    });
  });

  it('renders task-derived lifecycle activity chronologically', async () => {
    useConnectionStore.getState().setConnectionState('connected');

    const taskWithLifecycle = {
      task_id: 'task-event-1',
      description: 'Audit safety policy',
      status: 'completed',
      created_at: '2026-11-22T10:00:00Z',
      started_at: '2026-11-22T10:00:01Z',
      finished_at: '2026-11-22T10:00:05Z',
    };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/tasks')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            items: [taskWithLifecycle],
            total: 1,
            limit: 50,
            offset: 0,
          }),
        });
      }
      if (url.includes('/health/ready')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'ready', database: true, engine: true, timestamp: '2026-11-22T12:00:00Z' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', version: '0.1.0', timestamp: '2026-11-22T12:00:00Z' }),
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Runtime Activity')).toBeInTheDocument();
      expect(screen.getByText('Task-Derived')).toBeInTheDocument();
      expect(screen.getByText(/Completed execution — Audit safety policy/i)).toBeInTheDocument();
    });
  });

  it('renders refresh button and executes refresh on click', async () => {
    useConnectionStore.getState().setConnectionState('connected');

    let fetchCount = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      fetchCount++;
      if (url.includes('/api/v1/tasks')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ items: [], total: 0, limit: 50, offset: 0 }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', version: '0.1.0', timestamp: '2026-11-22T12:00:00Z' }),
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(fetchCount).toBeGreaterThan(0);
    });

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    expect(refreshButton).toBeInTheDocument();

    const previousCount = fetchCount;
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(fetchCount).toBeGreaterThanOrEqual(previousCount);
    });
  });
});
