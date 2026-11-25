import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from './test-utils';
import { TaskDetailPage } from '../pages/TaskDetailPage';
import { useConnectionStore } from '../stores/connectionStore';

describe('TaskDetailPage Integration', () => {
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

  const renderDetailPage = (taskId: string) => {
    return renderWithProviders(
      <Routes>
        <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
      </Routes>,
      { initialEntries: [`/tasks/${taskId}`] }
    );
  };

  it('renders loading skeleton while task data is fetching', () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    renderDetailPage('task-load-123');

    expect(screen.getByText(/retrieving execution state and runtime details/i)).toBeInTheDocument();
  });

  it('renders 404 Not Found state when API returns FG-TASK-404', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({
        error: { code: 'FG-TASK-404', message: "Task 'task-not-found' not found." },
      }),
    });

    renderDetailPage('task-not-found');

    await waitFor(() => {
      expect(screen.getByText(/task "task-not-found" not found/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /return to task explorer/i })).toBeInTheDocument();
    });
  });

  it('renders execution overview metadata, input prompt, and lifecycle timeline', async () => {
    const mockTask = {
      task_id: 'task-detail-001',
      description: 'Analyze system memory and disk limits for the workspace container',
      status: 'completed',
      created_at: '2026-11-22T08:00:00Z',
      started_at: '2026-11-22T08:00:01Z',
      finished_at: '2026-11-22T08:00:10Z',
      workspace_id: 'ws-security',
      iteration_count: 3,
      tool_call_count: 5,
      recovery_status: 'none',
      metadata: { execution_mode: 'agent' },
    };

    const mockResult = {
      task_id: 'task-detail-001',
      status: 'completed',
      completed: true,
      final_response: 'System memory analysis complete: 4GB available, no pressure.',
      duration_seconds: 9.0,
      tool_call_count: 5,
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/result')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockResult,
        });
      }
      if (url.includes('/diagnostics')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            task_id: 'task-detail-001',
            trace_id: 'trace-xyz-987',
            timeline: [],
            diagnostics: [],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockTask,
      });
    });

    renderDetailPage('task-detail-001');

    await waitFor(
      () => {
        expect(screen.getByText('Task: task-detail-001')).toBeInTheDocument();
        expect(screen.getByText('Execution Overview')).toBeInTheDocument();
        expect(screen.getByText('Lifecycle Timeline')).toBeInTheDocument();
        expect(screen.getByText('Task Input / Prompt')).toBeInTheDocument();
        expect(screen.getByText('Execution Result')).toBeInTheDocument();
        expect(
          screen.getByText(/System memory analysis complete: 4GB available, no pressure/i)
        ).toBeInTheDocument();
      },
      { timeout: 4000 }
    );

    expect(screen.getByText('ws-security')).toBeInTheDocument();
    expect(screen.getByText('3 iters / 5 calls')).toBeInTheDocument();
    expect(screen.getByText('9.00s')).toBeInTheDocument();
  });

  it('renders structured JSON outputs when final_response is absent', async () => {
    const mockTask = {
      task_id: 'task-json-002',
      description: 'Fetch JSON configuration report',
      status: 'completed',
      created_at: '2026-11-22T08:00:00Z',
      started_at: '2026-11-22T08:00:01Z',
      finished_at: '2026-11-22T08:00:03Z',
    };

    const mockResult = {
      task_id: 'task-json-002',
      status: 'completed',
      completed: true,
      final_response: null,
      outputs: { quota_exceeded: false, memory_mb: 2048, regions: ['us-west-1', 'eu-central-1'] },
      duration_seconds: 2.0,
      tool_call_count: 1,
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/result')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockResult,
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockTask,
      });
    });

    renderDetailPage('task-json-002');

    await waitFor(() => {
      expect(screen.getByText(/"quota_exceeded": false/i)).toBeInTheDocument();
      expect(screen.getByText(/"memory_mb": 2048/i)).toBeInTheDocument();
    });
  });

  it('renders error summary and diagnostics forensics for failed tasks', async () => {
    const mockTask = {
      task_id: 'task-failed-003',
      description: 'Run privileged filesystem write without authorization',
      status: 'failed',
      created_at: '2026-11-22T08:00:00Z',
      started_at: '2026-11-22T08:00:01Z',
      finished_at: '2026-11-22T08:00:02Z',
      error_summary: 'PolicyDenialError: Unauthorized write to /etc/hosts',
    };

    const mockDiagnostics = {
      task_id: 'task-failed-003',
      trace_id: 'trace-forensic-777',
      timeline: [],
      diagnostics: [],
      recovery_info: {
        can_resume_safely: false,
        warnings: ['Unapproved filesystem side-effects attempted.'],
      },
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/diagnostics')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockDiagnostics,
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockTask,
      });
    });

    renderDetailPage('task-failed-003');

    await waitFor(() => {
      expect(screen.getByText('Diagnostics & Forensics')).toBeInTheDocument();
      expect(screen.getByText(/PolicyDenialError: Unauthorized write to \/etc\/hosts/i)).toBeInTheDocument();
      expect(screen.getByText('trace-forensic-777')).toBeInTheDocument();
      expect(screen.getByText('Unrecoverable Side Effects')).toBeInTheDocument();
    });
  });

  it('supports cancel action flow with confirmation dialog on active tasks', async () => {
    const mockTask = {
      task_id: 'task-cancel-004',
      description: 'Long running agent calculation',
      status: 'running',
      created_at: '2026-11-22T08:00:00Z',
      started_at: '2026-11-22T08:00:01Z',
    };

    let cancelCalled = false;

    global.fetch = vi.fn().mockImplementation((url: string, options: any) => {
      if (url.includes('/cancel') && options?.method === 'POST') {
        cancelCalled = true;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            task_id: 'task-cancel-004',
            status: 'cancelled',
            cancelled: true,
            message: 'Task execution successfully cancelled.',
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockTask,
      });
    });

    renderDetailPage('task-cancel-004');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel task/i })).toBeInTheDocument();
    });

    // Click Cancel Task button to open confirmation dialog
    fireEvent.click(screen.getByRole('button', { name: /cancel task/i }));

    expect(screen.getByText('Cancel Governed Execution')).toBeInTheDocument();
    expect(
      screen.getByText(/are you sure you want to cancel execution of task "task-cancel-004"/i)
    ).toBeInTheDocument();

    // Confirm cancel in modal dialog
    const confirmButtons = screen.getAllByRole('button', { name: /cancel task/i });
    // The dialog button is the second one
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(cancelCalled).toBe(true);
    });
  });

  it('supports resume action flow with confirmation dialog on recoverable failed tasks', async () => {
    const mockTask = {
      task_id: 'task-resume-005',
      description: 'Interrupted batch export task',
      status: 'failed',
      created_at: '2026-11-22T08:00:00Z',
      started_at: '2026-11-22T08:00:01Z',
      finished_at: '2026-11-22T08:00:04Z',
      recovery_status: 'resumable',
    };

    let resumeCalled = false;

    global.fetch = vi.fn().mockImplementation((url: string, options: any) => {
      if (url.includes('/resume') && options?.method === 'POST') {
        resumeCalled = true;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            task_id: 'task-resume-005',
            status: 'running',
            resumed: true,
            message: 'Task successfully resumed from checkpoint.',
            completed_calls: ['call-1'],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => mockTask,
      });
    });

    renderDetailPage('task-resume-005');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resume task/i })).toBeInTheDocument();
    });

    // Click Resume Task button to open confirmation dialog
    fireEvent.click(screen.getByRole('button', { name: /resume task/i }));

    expect(screen.getByText('Resume Governed Execution')).toBeInTheDocument();

    // Confirm resume in modal dialog
    const confirmResumeBtn = screen.getByRole('button', { name: /resume execution/i });
    fireEvent.click(confirmResumeBtn);

    await waitFor(() => {
      expect(resumeCalled).toBe(true);
    });
  });

  it('handles clipboard copy actions gracefully', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const mockTask = {
      task_id: 'task-copy-006',
      description: 'Short task description for copy test',
      status: 'completed',
      created_at: '2026-11-22T08:00:00Z',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockTask,
    });

    renderDetailPage('task-copy-006');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy task id/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /copy prompt/i })).toBeInTheDocument();
    });

    // Copy ID
    fireEvent.click(screen.getByRole('button', { name: /copy task id/i }));
    expect(writeTextMock).toHaveBeenCalledWith('task-copy-006');

    // Copy Prompt
    fireEvent.click(screen.getByRole('button', { name: /copy prompt/i }));
    expect(writeTextMock).toHaveBeenCalledWith('Short task description for copy test');
  });
});
