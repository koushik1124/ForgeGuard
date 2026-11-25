import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { TaskExplorerPage } from '../pages/TaskExplorerPage';
import { LiveRunsPage } from '../pages/LiveRunsPage';
import { PoliciesPage } from '../pages/PoliciesPage';
import { BudgetsPage } from '../pages/BudgetsPage';
import { RecoveryPage } from '../pages/RecoveryPage';
import { MetricsPage } from '../pages/MetricsPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';

const mockTasks = [
  {
    task_id: 'task-live-101',
    description: 'Monitor payment transactions for anomalous spikes',
    status: 'running',
    created_at: '2026-11-24T10:00:00Z',
    started_at: '2026-11-24T10:00:05Z',
    finished_at: null,
    workspace_id: 'ws-main',
    tool_call_count: 5,
    iteration_count: 3,
    budget_summary: {
      tool_calls: { used: 5, limit: 50 },
      execution_seconds: { used: 35.2, limit: 300.0 },
      output_bytes: { used: 4500, limit: 1000000 },
    },
  },
  {
    task_id: 'task-completed-102',
    description: 'Verify SHA256 checksums of released artifacts',
    status: 'completed',
    created_at: '2026-11-24T09:00:00Z',
    started_at: '2026-11-24T09:00:02Z',
    finished_at: '2026-11-24T09:00:15Z',
    workspace_id: 'ws-main',
    tool_call_count: 2,
    iteration_count: 2,
  },
  {
    task_id: 'task-failed-103',
    description: 'Query database with invalid credentials',
    status: 'failed',
    created_at: '2026-11-24T08:00:00Z',
    started_at: '2026-11-24T08:00:02Z',
    finished_at: '2026-11-24T08:00:08Z',
    workspace_id: 'ws-main',
    tool_call_count: 1,
    iteration_count: 1,
    error_summary: 'Database connection failed: Invalid credentials',
  },
];

const mockWorkspaces = [
  {
    workspace_id: 'ws-main',
    name: 'Main Workspace',
    root_path: '/data/main',
    created_at: '2026-11-20T10:00:00Z',
  },
];

const mockDiagnostics = {
  task_id: 'task-failed-103',
  trace_id: 'trace-103',
  timeline: [
    { sequence_number: 1, event_type: 'task_started', summary: 'Task started', category: 'lifecycle' },
    { sequence_number: 2, event_type: 'tool_failed', summary: 'DB connect refused', category: 'execution' },
  ],
  diagnostics: [
    {
      diagnostic_id: 'diag-1',
      code: 'FG-TOOL-500',
      category: 'execution',
      severity: 'high',
      message: 'Database connection failed: Invalid credentials',
      suggested_action: 'Verify database credentials or update configuration.',
      is_fatal: false,
    },
  ],
  budget_snapshot: {
    tool_calls: { used: 1, limit: 50 },
  },
};

const mockReports = [
  {
    experiment_id: 'exp_001',
    name: 'Full Reliability Suite',
    timestamp: '2026-11-24T09:30:00Z',
    duration_ms: 12500,
    total_scenarios: 20,
    passed: 18,
    failed: 2,
    errors: 0,
    skipped: 0,
    overall_status: 'fail',
    summary_metrics: { pass_rate_pct: 90.0 },
    scenario_results: [],
  },
];

describe('UI Completeness & Integration Correction', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupMockFetch = (customTasks = mockTasks) => {
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      const urlStr = String(url);

      if (urlStr.includes('/api/v1/tasks') && options?.method === 'POST') {
        const body = JSON.parse(String(options.body));
        return Promise.resolve({
          ok: true,
          status: 202,
          json: async () => ({
            task_id: 'task-new-created',
            description: body.prompt,
            status: 'created',
            created_at: '2026-11-24T11:00:00Z',
            workspace_id: body.workspace_id,
          }),
        });
      }

      if (urlStr.includes('/api/v1/tasks/') && urlStr.includes('/diagnostics')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockDiagnostics,
        });
      }

      if (urlStr.includes('/api/v1/tasks')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            items: customTasks,
            total: customTasks.length,
            limit: 50,
            offset: 0,
          }),
        });
      }

      if (urlStr.includes('/api/v1/workspaces')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ workspaces: mockWorkspaces }),
        });
      }

      if (urlStr.includes('/api/v1/evaluations/reports')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            total_reports: mockReports.length,
            reports: mockReports,
          }),
        });
      }

      if (urlStr.includes('/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', timestamp: new Date().toISOString(), version: '0.1.0' }),
        });
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
  };

  it('TaskExplorerPage: displays Create Task button, opens dialog, and submits task', async () => {
    setupMockFetch();

    renderWithProviders(<TaskExplorerPage />);

    // Check Create Task button exists
    const createBtn = screen.getByRole('button', { name: /create task/i });
    expect(createBtn).toBeInTheDocument();

    // Click Create Task
    fireEvent.click(createBtn);

    // Dialog should open
    expect(await screen.findByText('Create Governed Task')).toBeInTheDocument();
    expect(screen.getByText(/LLM proposes; ForgeGuard authorizes and executes/i)).toBeInTheDocument();

    // Fill in prompt
    const promptInput = screen.getByPlaceholderText(/Describe what the agent should accomplish/i);
    fireEvent.change(promptInput, {
      target: { value: 'Inspect security anomalies in workspace' },
    });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /^submit task$/i });
    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);

    // Should call POST /api/v1/tasks
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/tasks'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Inspect security anomalies in workspace'),
        })
      );
    });
  });

  it('LiveRunsPage: renders active running agent executions and live stream', async () => {
    setupMockFetch();

    renderWithProviders(<LiveRunsPage />);

    expect(screen.getByRole('heading', { name: 'Live Runs' })).toBeInTheDocument();
    expect(
      screen.getByText('Monitor active agent executions, real-time tool dispatches, and streaming runtime events.')
    ).toBeInTheDocument();

    // Verify running task appears
    await waitFor(() => {
      const taskEls = screen.getAllByText('task-live-101');
      expect(taskEls.length).toBeGreaterThan(0);
      expect(taskEls[0]).toBeInTheDocument();
      expect(screen.getByText(/Monitor payment transactions for anomalous spikes/i)).toBeInTheDocument();
      expect(screen.getByText('1 Live')).toBeInTheDocument();
    });

    // Ensure no milestone labels are rendered
    expect(screen.queryByText(/milestone/i)).not.toBeInTheDocument();
  });

  it('LiveRunsPage: renders empty state when no tasks are running', async () => {
    // Only completed tasks, none running
    setupMockFetch([mockTasks[1], mockTasks[2]]);

    renderWithProviders(<LiveRunsPage />);

    await waitFor(() => {
      expect(screen.getByText('No Active Executions')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /start an execution task/i })).toBeInTheDocument();
    });

    // Ensure no milestone labels
    expect(screen.queryByText(/milestone/i)).not.toBeInTheDocument();
  });

  it('PoliciesPage: renders default-deny guardrails and task policy decisions without milestone labels', async () => {
    setupMockFetch();

    renderWithProviders(<PoliciesPage />);

    expect(screen.getByRole('heading', { name: 'Security Policies' })).toBeInTheDocument();
    expect(
      screen.getByText('Core Invariant: LLM proposes; ForgeGuard authorizes and executes.')
    ).toBeInTheDocument();
    expect(screen.getByText('Default-Deny Tool Authorization')).toBeInTheDocument();
    expect(screen.getByText('Workspace Boundary Containment')).toBeInTheDocument();
    expect(screen.getByText('Protected Credential Defense')).toBeInTheDocument();

    // Ensure no milestone labels
    expect(screen.queryByText(/milestone/i)).not.toBeInTheDocument();
  });

  it('BudgetsPage: renders default guardrails and task budget forensics without milestone labels', async () => {
    setupMockFetch();

    renderWithProviders(<BudgetsPage />);

    expect(screen.getByRole('heading', { name: 'Resource Budgets' })).toBeInTheDocument();
    expect(screen.getByText('Max Tool Invocations')).toBeInTheDocument();
    expect(screen.getByText('50 calls')).toBeInTheDocument();
    expect(screen.getByText('Max Wall-Clock Time')).toBeInTheDocument();
    expect(screen.getByText('300 sec')).toBeInTheDocument();
    expect(screen.getByText('Max Output Size')).toBeInTheDocument();
    expect(screen.getByText('1.0 MB')).toBeInTheDocument();

    // Ensure no milestone labels
    expect(screen.queryByText(/milestone/i)).not.toBeInTheDocument();
  });

  it('RecoveryPage: renders authoritative recovery safety notice and diagnostics without milestone labels', async () => {
    setupMockFetch();

    renderWithProviders(<RecoveryPage />);

    expect(screen.getByRole('heading', { name: 'Crash Recovery & State' })).toBeInTheDocument();
    expect(screen.getByText('Authoritative Recovery Invariant')).toBeInTheDocument();

    // Ensure no milestone labels
    expect(screen.queryByText(/milestone/i)).not.toBeInTheDocument();
  });

  it('MetricsPage: calculates accurate telemetry from authentic records without fake statistics', async () => {
    setupMockFetch();

    renderWithProviders(<MetricsPage />);

    expect(screen.getByRole('heading', { name: 'Metrics & Telemetry' })).toBeInTheDocument();

    await waitFor(() => {
      // Total tasks: 3
      expect(screen.getByText('Total Tasks Executed')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();

      // Tool calls sum: 5 + 2 + 1 = 8
      expect(screen.getByText('Total Governed Tool Calls')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();

      // Evaluation pass rate from mock report: 18 / 20 = 90.0%
      expect(screen.getByText('Benchmark Pass Rate')).toBeInTheDocument();
      expect(screen.getByText('90.0%')).toBeInTheDocument();
    });

    // Ensure no milestone labels
    expect(screen.queryByText(/milestone/i)).not.toBeInTheDocument();
  });

  it('PlaceholderPage: renders clean console module fallback without milestone numbers', () => {
    renderWithProviders(<PlaceholderPage />);

    expect(screen.queryByText(/milestone/i)).not.toBeInTheDocument();
  });
});
