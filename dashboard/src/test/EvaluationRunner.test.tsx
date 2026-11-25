import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { RunEvaluationDialog } from '../components/evaluation/RunEvaluationDialog';
import { ActiveEvaluationBanner } from '../components/evaluation/ActiveEvaluationBanner';
import { EvaluationCenterPage } from '../pages/EvaluationCenterPage';
import { apiClient } from '../api/client';

const mockCatalog = {
  total_scenarios: 3,
  suites: {
    reliability: [
      {
        scenario_id: 'rel_01_success',
        name: 'Reliability Happy Path Execution',
        category: 'reliability',
        severity: 'high',
        description: 'Verify governed agent task completes within limits.',
        tags: ['reliability'],
      },
    ],
    recovery: [
      {
        scenario_id: 'rec_01_checkpoint_resume',
        name: 'Crash Recovery After Checkpoint',
        category: 'recovery',
        severity: 'critical',
        description: 'Reconstruct state and safely resume after crash.',
        tags: ['recovery'],
      },
    ],
    benchmarks: [
      {
        scenario_id: 'bench_01_runtime_overhead',
        name: 'Runtime Overhead Benchmarks',
        category: 'benchmark',
        severity: 'medium',
        description: 'Measure runtime latency and overhead.',
        tags: ['benchmark'],
      },
    ],
    security: [],
    agent: [],
  },
  scenarios: [
    {
      scenario_id: 'rel_01_success',
      name: 'Reliability Happy Path Execution',
      category: 'reliability',
      severity: 'high',
      description: 'Verify governed agent task completes within limits.',
      tags: ['reliability'],
    },
    {
      scenario_id: 'rec_01_checkpoint_resume',
      name: 'Crash Recovery After Checkpoint',
      category: 'recovery',
      severity: 'critical',
      description: 'Reconstruct state and safely resume after crash.',
      tags: ['recovery'],
    },
    {
      scenario_id: 'bench_01_runtime_overhead',
      name: 'Runtime Overhead Benchmarks',
      category: 'benchmark',
      severity: 'medium',
      description: 'Measure runtime latency and overhead.',
      tags: ['benchmark'],
    },
  ],
};

const mockRunningRun = {
  run_id: 'run-test-123',
  experiment_id: 'exp-test-123',
  name: 'test_evaluation_run',
  status: 'running',
  created_at: '2026-11-24T12:00:00Z',
  started_at: '2026-11-24T12:00:01Z',
  total_scenarios: 3,
  completed_scenarios: 1,
  current_scenario_id: 'rel_01_success',
  current_scenario_name: 'Reliability Happy Path Execution',
  passed: 1,
  failed: 0,
  errors: 0,
  skipped: 0,
  duration_ms: 850.0,
  selected_suites: ['reliability'],
  selected_scenario_ids: ['rel_01_success'],
};

const mockCompletedRun = {
  run_id: 'run-test-456',
  experiment_id: 'exp-test-456',
  name: 'completed_evaluation_run',
  status: 'completed',
  created_at: '2026-11-24T12:00:00Z',
  started_at: '2026-11-24T12:00:01Z',
  completed_at: '2026-11-24T12:00:05Z',
  total_scenarios: 3,
  completed_scenarios: 3,
  current_scenario_id: null,
  current_scenario_name: null,
  passed: 3,
  failed: 0,
  errors: 0,
  skipped: 0,
  overall_status: 'pass',
  duration_ms: 2450.0,
  report_id: 'exp-test-456',
  selected_suites: ['all'],
  selected_scenario_ids: ['rel_01_success', 'rec_01_checkpoint_resume', 'bench_01_runtime_overhead'],
};

describe('RunEvaluationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders presets and isolation notice when open', () => {
    renderWithProviders(
      <RunEvaluationDialog
        open={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        catalog={mockCatalog as any}
      />
    );

    expect(screen.getByText('Launch Evaluation Run')).toBeInTheDocument();
    expect(screen.getByText(/All Scenarios/i)).toBeInTheDocument();
    expect(screen.getByText(/Core Invariants/i)).toBeInTheDocument();
    expect(screen.getByText(/Benchmarks Only/i)).toBeInTheDocument();
    expect(screen.getByText(/Strict Sandbox Isolation/i)).toBeInTheDocument();
  });

  it('displays concurrency warning and disables submit when another run is active', () => {
    renderWithProviders(
      <RunEvaluationDialog
        open={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        catalog={mockCatalog as any}
        isAnyRunActive={true}
      />
    );

    expect(
      screen.getByText(/An evaluation run is currently active. ForgeGuard enforces a strict limit/i)
    ).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Start Evaluation/i });
    expect(submitBtn).toBeDisabled();
  });

  it('submits evaluation request with selected scenarios', async () => {
    const startSpy = vi.spyOn(apiClient, 'startEvaluationRun').mockResolvedValueOnce({
      run_id: 'run-new-789',
      experiment_id: 'exp-new-789',
      name: 'forgeguard_evaluation',
      status: 'queued',
      created_at: new Date().toISOString(),
      total_scenarios: 3,
      completed_scenarios: 0,
      passed: 0,
      failed: 0,
      errors: 0,
      skipped: 0,
      duration_ms: 0,
      selected_suites: [],
      selected_scenario_ids: ['rel_01_success'],
    });

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(
      <RunEvaluationDialog
        open={true}
        onClose={onClose}
        onSuccess={onSuccess}
        catalog={mockCatalog as any}
        isAnyRunActive={false}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Start Evaluation/i });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(startSpy).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledWith('run-new-789');
      expect(onClose).toHaveBeenCalled();
    });
  });
});

describe('ActiveEvaluationBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays live progress and active scenario badge for a running run', async () => {
    vi.spyOn(apiClient, 'getEvaluationRun').mockResolvedValueOnce(mockRunningRun as any);

    renderWithProviders(<ActiveEvaluationBanner runId="run-test-123" />);

    await waitFor(() => {
      expect(screen.getByText('test_evaluation_run')).toBeInTheDocument();
      expect(screen.getByText('RUNNING')).toBeInTheDocument();
      expect(screen.getByText(/rel_01_success/i)).toBeInTheDocument();
      expect(screen.getByText(/Passed: 1/i)).toBeInTheDocument();
    });
  });

  it('displays completed state with View Full Report button', async () => {
    vi.spyOn(apiClient, 'getEvaluationRun').mockResolvedValueOnce(mockCompletedRun as any);

    renderWithProviders(<ActiveEvaluationBanner runId="run-test-456" />);

    await waitFor(() => {
      expect(screen.getByText('completed_evaluation_run')).toBeInTheDocument();
      expect(screen.getByText('COMPLETED')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /View Full Report/i })).toBeInTheDocument();
    });
  });
});

describe('EvaluationCenterPage Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(apiClient, 'getEvaluationScenarios').mockResolvedValue(mockCatalog as any);
    vi.spyOn(apiClient, 'getEvaluationReports').mockResolvedValue({
      total_reports: 0,
      reports: [],
    });
    vi.spyOn(apiClient, 'getEvaluationRuns').mockResolvedValue({
      total_runs: 0,
      active_run_id: null,
      runs: [],
    });
  });

  it('renders Run Evaluation button and opens dialog upon click', async () => {
    renderWithProviders(<EvaluationCenterPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run Evaluation/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Run Evaluation/i }));

    await waitFor(() => {
      expect(screen.getByText('Launch Evaluation Run')).toBeInTheDocument();
    });
  });
});
