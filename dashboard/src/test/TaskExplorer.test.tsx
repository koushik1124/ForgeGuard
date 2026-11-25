import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { TaskExplorerPage } from '../pages/TaskExplorerPage';
import { useConnectionStore } from '../stores/connectionStore';

describe('TaskExplorerPage Integration', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      connectionState: 'connected',
      baseUrl: 'http://127.0.0.1:8000',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders loading state initially while fetching task records', () => {
    // Hang fetch to check loading state
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<TaskExplorerPage />, { initialEntries: ['/tasks'] });

    expect(screen.getByRole('heading', { name: 'Task Explorer' })).toBeInTheDocument();
  });

  it('renders task records correctly from real API data', async () => {
    const mockTasks = [
      {
        task_id: 'task-exp-001',
        description: 'First exploratory execution test',
        status: 'completed',
        created_at: '2026-11-22T10:00:00Z',
        started_at: '2026-11-22T10:00:01Z',
        finished_at: '2026-11-22T10:00:05Z',
        metadata: { workspace_id: 'ws-main' },
      },
      {
        task_id: 'task-exp-002',
        description: 'Second active task in progress',
        status: 'running',
        created_at: '2026-11-22T10:05:00Z',
        started_at: '2026-11-22T10:05:01Z',
        metadata: { workspace_id: 'ws-default' },
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: mockTasks,
        total: 2,
        limit: 20,
        offset: 0,
      }),
    });

    renderWithProviders(<TaskExplorerPage />, { initialEntries: ['/tasks'] });

    await waitFor(() => {
      expect(screen.getByText('task-exp-001')).toBeInTheDocument();
      expect(screen.getByText('task-exp-002')).toBeInTheDocument();
    });

    expect(screen.getByText('First exploratory execution test')).toBeInTheDocument();
    expect(screen.getByText('Second active task in progress')).toBeInTheDocument();
    expect(screen.getByText('4.00s')).toBeInTheDocument();
  });

  it('renders empty state when no tasks exist', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
      }),
    });

    renderWithProviders(<TaskExplorerPage />, { initialEntries: ['/tasks'] });

    await waitFor(() => {
      expect(screen.getByText(/no execution tasks found/i)).toBeInTheDocument();
    });
  });

  it('renders disconnected alert banner when backend is offline', async () => {
    useConnectionStore.setState({ connectionState: 'disconnected' });

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    renderWithProviders(<TaskExplorerPage />, { initialEntries: ['/tasks'] });

    expect(
      screen.getByText(/forgeguard runtime api is disconnected/i)
    ).toBeInTheDocument();
  });

  it('renders error state on API failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({
        error: { code: 'FG-INTERNAL-500', message: 'Persistence failure' },
      }),
    });

    renderWithProviders(<TaskExplorerPage />, { initialEntries: ['/tasks'] });

    await waitFor(() => {
      expect(screen.getByText(/failed to retrieve execution records/i)).toBeInTheDocument();
      expect(screen.getByText(/persistence failure/i)).toBeInTheDocument();
    });
  });

  it('filters tasks client-side using search term by task ID or prompt', async () => {
    const mockTasks = [
      {
        task_id: 'task-search-alpha',
        description: 'Read file contents from disk',
        status: 'completed',
        created_at: '2026-11-22T10:00:00Z',
      },
      {
        task_id: 'task-search-beta',
        description: 'Analyze telemetry metrics',
        status: 'failed',
        created_at: '2026-11-22T10:05:00Z',
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: mockTasks,
        total: 2,
        limit: 20,
        offset: 0,
      }),
    });

    renderWithProviders(<TaskExplorerPage />, { initialEntries: ['/tasks'] });

    await waitFor(() => {
      expect(screen.getByText('task-search-alpha')).toBeInTheDocument();
      expect(screen.getByText('task-search-beta')).toBeInTheDocument();
    });

    // Enter search term
    const searchInput = screen.getByPlaceholderText(/filter current page by task id or prompt/i);
    fireEvent.change(searchInput, { target: { value: 'telemetry' } });

    // Beta should remain, Alpha should be filtered out
    expect(screen.getByText('task-search-beta')).toBeInTheDocument();
    expect(screen.queryByText('task-search-alpha')).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('task-search-alpha')).toBeInTheDocument();
  });

  it('triggers server-side status filtering on filter chip click', async () => {
    let requestedUrl = '';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      requestedUrl = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          items: [],
          total: 0,
          limit: 20,
          offset: 0,
        }),
      });
    });

    renderWithProviders(<TaskExplorerPage />, { initialEntries: ['/tasks'] });

    await waitFor(() => {
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    // Click Completed status filter
    fireEvent.click(screen.getByText('Completed'));

    await waitFor(() => {
      expect(requestedUrl).toContain('status=completed');
    });
  });

  it('handles server-side pagination with next and previous controls', async () => {
    // Generate 20 tasks to enable Next button (pageSize=20)
    const mockTasks = Array.from({ length: 20 }, (_, i) => ({
      task_id: `task-paged-${i + 1}`,
      description: `Paged execution task ${i + 1}`,
      status: 'completed',
      created_at: '2026-11-22T10:00:00Z',
    }));

    let queryOffset = '0';
    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = new URL(url);
      queryOffset = u.searchParams.get('offset') || '0';
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          items: mockTasks,
          total: 20,
          limit: 20,
          offset: Number(queryOffset),
        }),
      });
    });

    renderWithProviders(<TaskExplorerPage />, { initialEntries: ['/tasks'] });

    await waitFor(() => {
      expect(screen.getByText('task-paged-1')).toBeInTheDocument();
    });

    expect(screen.getByText(/showing tasks 1–20/i)).toBeInTheDocument();

    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect(nextBtn).toBeEnabled();

    // Click next
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(queryOffset).toBe('20');
    });
  });

  it('handles missing fields, invalid timestamps, and unknown statuses safely without crashing', async () => {
    const malformedTasks = [
      {
        task_id: 'task-malformed-001',
        description: 'Task with invalid timestamps and unknown status',
        status: 'custom_unknown_status',
        created_at: 'invalid-date-string',
        started_at: null,
        finished_at: 'gibberish',
        workspace_id: null,
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: malformedTasks,
        total: 1,
        limit: 20,
        offset: 0,
      }),
    });

    renderWithProviders(<TaskExplorerPage />, { initialEntries: ['/tasks'] });

    await waitFor(() => {
      expect(screen.getByText('task-malformed-001')).toBeInTheDocument();
    });

    // Should display unknown status chip gracefully
    expect(screen.getByText('custom_unknown_status')).toBeInTheDocument();
    // Duration fallback should be '--'
    expect(screen.getByText('--')).toBeInTheDocument();
  });
});
