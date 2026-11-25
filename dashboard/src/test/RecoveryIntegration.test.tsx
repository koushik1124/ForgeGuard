import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from './test-utils';
import { TaskDetailPage } from '../pages/TaskDetailPage';
import { useConnectionStore } from '../stores/connectionStore';
import { useUIStore } from '../stores/uiStore';

describe('Recovery & Diagnostics Integration (M9.6)', () => {
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

  it('renders recovery assessment banner and recovery inspector for a failed task', async () => {
    const mockTask = {
      task_id: 'task-recov-001',
      description: 'Run financial ledger reconciliation',
      status: 'failed',
      created_at: '2026-11-23T10:00:00Z',
      started_at: '2026-11-23T10:00:01Z',
      finished_at: '2026-11-23T10:00:15Z',
      iteration_count: 2,
      tool_call_count: 2,
      recovery_status: 'failed',
      metadata: {},
    };

    const mockDiagnostics = {
      task_id: 'task-recov-001',
      trace_id: 'trace-recov-999',
      timeline: [
        {
          sequence_number: 1,
          timestamp: '2026-11-23T10:00:00Z',
          event_type: 'task_started',
          category: 'lifecycle',
          status: 'success',
          summary: 'Task initialized',
          metadata: {},
        },
        {
          sequence_number: 2,
          timestamp: '2026-11-23T10:00:05Z',
          event_type: 'tool_call_started',
          category: 'tool',
          status: 'success',
          summary: 'ledger_read started',
          metadata: { tool_name: 'ledger_read' },
        },
        {
          sequence_number: 3,
          timestamp: '2026-11-23T10:00:15Z',
          event_type: 'task_failed',
          category: 'lifecycle',
          status: 'failure',
          summary: 'Tool call execution timed out',
          metadata: { reason: 'timeout' },
        },
      ],
      diagnostics: [
        {
          code: 'FG-TOOL-TIMEOUT',
          category: 'tool',
          severity: 'ERROR',
          message: 'Tool ledger_read exceeded 10.0s execution timeout',
          suggested_action: 'Increase timeout or optimize database query',
          tool_call_id: 'tc-ledger-01',
          details: { duration: 10.1, limit: 10.0 },
        },
      ],
      budget_snapshot: { max_tool_calls: 10 },
      recovery_info: {
        can_resume_safely: true,
        reconstruction_source: 'checkpoint',
        completed_calls: ['tc-auth-00'],
        uncertain_calls: [],
        warnings: [],
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

    renderDetailPage('task-recov-001');

    await waitFor(() => {
      // Banner
      expect(screen.getByText('Safe to Resume')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Resume from Checkpoint' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Resume Task' })).toBeInTheDocument();
      // Section title
      expect(screen.getByText('Recovery & Failure Diagnostics')).toBeInTheDocument();
      // Trace ID
      expect(screen.getByText(/trace-recov-999/)).toBeInTheDocument();
    });

    // Overview Tab items
    expect(screen.getByText('Suggested Operator Action')).toBeInTheDocument();
    expect(screen.getByText('Increase timeout or optimize database query')).toBeInTheDocument();

    // Switch to Diagnostics tab
    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics (1)' }));
    expect(screen.getByText('FG-TOOL-TIMEOUT')).toBeInTheDocument();
    expect(screen.getByText('Tool ledger_read exceeded 10.0s execution timeout')).toBeInTheDocument();

    // Switch to Timeline tab
    fireEvent.click(screen.getByRole('button', { name: 'Timeline (3)' }));
    expect(screen.getByText('Tool call execution timed out')).toBeInTheDocument();

    // Switch to Checkpoints tab
    fireEvent.click(screen.getByRole('button', { name: 'Checkpoints (1)' }));
    expect(screen.getByText('Verified SQLite Checkpoint')).toBeInTheDocument();
    expect(screen.getByText('#1: tc-auth-00')).toBeInTheDocument();
  }, 30000);

  it('handles resume confirmation dialog flow and triggers resume mutation', async () => {
    const mockTask = {
      task_id: 'task-resume-flow',
      description: 'Run financial ledger reconciliation',
      status: 'failed',
      created_at: '2026-11-23T10:00:00Z',
      started_at: '2026-11-23T10:00:01Z',
      finished_at: '2026-11-23T10:00:15Z',
      iteration_count: 2,
      tool_call_count: 2,
      recovery_status: 'failed',
      metadata: {},
    };

    const mockDiagnostics = {
      task_id: 'task-resume-flow',
      trace_id: 'trace-resume-123',
      timeline: [],
      diagnostics: [],
      recovery_info: {
        can_resume_safely: true,
        reconstruction_source: 'checkpoint',
        completed_calls: ['tc-step1'],
        uncertain_calls: [],
        warnings: [],
        budget_snapshot: { max_tool_calls: 10 },
      },
    };

    let resumeCalled = false;
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/resume') && options?.method === 'POST') {
        resumeCalled = true;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            task_id: 'task-resume-flow',
            status: 'running',
            resumed: true,
            message: 'Task execution resumed from checkpoint',
            completed_calls: ['tc-step1'],
          }),
        });
      }
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

    renderDetailPage('task-resume-flow');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Resume from Checkpoint' })).toBeInTheDocument();
    });

    // Click Resume Task from Checkpoint in Banner
    fireEvent.click(screen.getByRole('button', { name: 'Resume from Checkpoint' }));

    // Confirmation dialog appears
    await waitFor(() => {
      expect(screen.getByText('Resume Governed Execution')).toBeInTheDocument();
      expect(screen.getByText(/Resume task "task-resume-flow" from its last verified checkpoint/i)).toBeInTheDocument();
    });

    // Click Confirm Resume in dialog
    const confirmButton = screen.getByRole('button', { name: /^Resume Execution$/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(resumeCalled).toBe(true);
      expect(useUIStore.getState().toast.message).toContain('resumed from checkpoint');
    });
  }, 15000);

  it('displays error toast when backend returns HTTP 409 conflict on resume', async () => {
    const mockTask = {
      task_id: 'task-409-test',
      description: 'Run financial ledger reconciliation',
      status: 'failed',
      created_at: '2026-11-23T10:00:00Z',
      started_at: '2026-11-23T10:00:01Z',
      finished_at: '2026-11-23T10:00:15Z',
      iteration_count: 2,
      tool_call_count: 2,
      recovery_status: 'failed',
      metadata: {},
    };

    const mockDiagnostics = {
      task_id: 'task-409-test',
      trace_id: 'trace-409',
      timeline: [],
      diagnostics: [],
      recovery_info: {
        can_resume_safely: true,
        reconstruction_source: 'checkpoint',
        completed_calls: [],
        uncertain_calls: [],
        warnings: [],
      },
    };

    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/resume') && options?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 409,
          statusText: 'Conflict',
          json: async () => ({
            error: {
              code: 'FG-RECOVERY-409',
              message: 'Cannot resume task with uncertain tool executions or non-terminal active state.',
            },
          }),
        });
      }
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

    renderDetailPage('task-409-test');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Resume from Checkpoint' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Resume from Checkpoint' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Resume Execution$/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Resume Execution$/i }));

    await waitFor(() => {
      expect(useUIStore.getState().toast.message).toContain(
        'Cannot resume task with uncertain tool executions or non-terminal active state.'
      );
    });
  }, 15000);
});
