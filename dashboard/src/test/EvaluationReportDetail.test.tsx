import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from './test-utils';
import { EvaluationReportDetailPage } from '../pages/EvaluationReportDetailPage';

const renderDetail = (experimentId = 'exp_2acfaf2a') => {
  return renderWithProviders(
    <Routes>
      <Route path="/evaluations/:experimentId" element={<EvaluationReportDetailPage />} />
    </Routes>,
    { initialEntries: [`/evaluations/${experimentId}`] }
  );
};

const mockReportDetail = {
  experiment_id: 'exp_2acfaf2a',
  name: 'forgeguard_evaluation',
  timestamp: '2026-11-21T10:44:46Z',
  duration_ms: 2985.0,
  total_scenarios: 20,
  passed: 19,
  failed: 1,
  errors: 0,
  skipped: 0,
  overall_status: 'fail',
  summary_metrics: {
    pass_rate_pct: 95.0,
    total_assertions: 44,
    assertions_passed: 43,
    assertions_failed: 1,
  },
  environment_info: {
    platform: 'Windows-10-Mock',
    python_version: '3.10.0',
    architecture: '64bit',
  },
  scenario_results: [
    {
      experiment_id: 'exp_2acfaf2a',
      scenario_id: 'rel_01_success',
      name: 'Reliability Happy Path Execution',
      category: 'reliability',
      severity: 'high',
      status: 'pass',
      start_time: '2026-11-21T10:44:46Z',
      duration_ms: 63.0,
      assertions: [
        {
          name: 'task_status_check',
          passed: true,
          expected: 'completed',
          actual: 'completed',
          message: 'Passed',
        },
      ],
      diagnostics: [],
      tags: ['reliability', 'core'],
    },
    {
      experiment_id: 'exp_2acfaf2a',
      scenario_id: 'sec_01_unauthorized_tool',
      name: 'Default-Deny Policy Enforcement',
      category: 'security',
      severity: 'critical',
      status: 'fail',
      start_time: '2026-11-21T10:44:46Z',
      duration_ms: 47.0,
      failure_reason: 'Tool execution was unexpectedly permitted',
      assertions: [
        {
          name: 'policy_denial_check',
          passed: false,
          expected: 'denied',
          actual: 'allowed',
          message: 'Expected default deny policy rule to block calculator.',
        },
      ],
      diagnostics: [
        {
          code: 'FG-POLICY-001',
          message: 'Tool calculator authorization policy error',
          suggested_action: 'Configure explicit tool allowlist.',
        },
      ],
      tags: ['security', 'policy'],
    },
  ],
  benchmarks: [
    {
      benchmark_id: 'bm_baseline_direct',
      name: 'Raw Tool Direct Execution',
      workload_type: 'Direct Python Call (Zero Governance)',
      sample_count: 30,
      mean_ms: 0.0662,
      median_ms: 0.0494,
      p95_ms: 0.1767,
      min_ms: 0.0166,
      max_ms: 0.4114,
      std_dev_ms: 0.0735,
      relative_overhead_pct: null,
      baseline_name: null,
    },
    {
      benchmark_id: 'bm_policy_only',
      name: 'Policy Governance',
      workload_type: 'ForgeGuard Authorization Only',
      sample_count: 30,
      mean_ms: 0.8414,
      median_ms: 0.6631,
      p95_ms: 1.6133,
      min_ms: 0.5899,
      max_ms: 2.4209,
      std_dev_ms: 0.3901,
      relative_overhead_pct: 1171.01,
      baseline_name: 'Raw Tool Direct Execution',
    },
  ],
};

describe('EvaluationReportDetailPage Integration (M9.7.2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders report header, summary metric cards, and scenario results', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/evaluations/reports/exp_2acfaf2a/artifact')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => '# Mock Markdown Artifact',
        });
      }
      if (url.includes('/api/v1/evaluations/reports/exp_2acfaf2a')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockReportDetail,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderDetail('exp_2acfaf2a');

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: /Evaluation Report: exp_2acfaf2a/i })
      ).toBeInTheDocument();
      expect(screen.getByText('Back to Evaluations')).toBeInTheDocument();
    });

    // Metric Cards
    expect(screen.getByText('Pass Rate')).toBeInTheDocument();
    expect(screen.getByText('95.0%')).toBeInTheDocument();
    expect(screen.getByText('Assertions Summary')).toBeInTheDocument();
    expect(screen.getByText('43 / 44')).toBeInTheDocument();

    // Scenarios in list
    expect(screen.getByText('rel_01_success')).toBeInTheDocument();
    expect(screen.getByText('Reliability Happy Path Execution')).toBeInTheDocument();
    expect(screen.getByText('sec_01_unauthorized_tool')).toBeInTheDocument();
    expect(screen.getByText('Default-Deny Policy Enforcement')).toBeInTheDocument();
  });

  it('inspects scenario failures with expected and actual details', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/evaluations/reports/exp_2acfaf2a')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockReportDetail,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderDetail('exp_2acfaf2a');

    await waitFor(() => {
      expect(screen.getByText('sec_01_unauthorized_tool')).toBeInTheDocument();
    });

    // Expand the failed scenario
    fireEvent.click(screen.getByText('Default-Deny Policy Enforcement'));

    await waitFor(() => {
      expect(screen.getByText(/Failure Reason:/i)).toBeInTheDocument();
      expect(screen.getByText('Tool execution was unexpectedly permitted')).toBeInTheDocument();
      expect(screen.getByText(/Expected default deny policy rule to block calculator/i)).toBeInTheDocument();
      expect(screen.getByText(/"denied"/)).toBeInTheDocument();
      expect(screen.getByText(/"allowed"/)).toBeInTheDocument();
      expect(screen.getByText('FG-POLICY-001')).toBeInTheDocument();
    });
  });

  it('switches to Performance Benchmarks tab and displays metrics', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/evaluations/reports/exp_2acfaf2a')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockReportDetail,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderDetail('exp_2acfaf2a');

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Performance Benchmarks/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Performance Benchmarks/i }));

    await waitFor(() => {
      expect(screen.getByText('Performance Benchmarks & Governance Overhead')).toBeInTheDocument();
      expect(screen.getByText('bm_baseline_direct')).toBeInTheDocument();
      expect(screen.getByText('Baseline (0%)')).toBeInTheDocument();
      expect(screen.getByText('bm_policy_only')).toBeInTheDocument();
      expect(screen.getByText('+1171.01%')).toBeInTheDocument();
    });
  });

  it('switches to Environment Info tab and displays host parameters', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/evaluations/reports/exp_2acfaf2a')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockReportDetail,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderDetail('exp_2acfaf2a');

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Environment Info/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Environment Info/i }));

    await waitFor(() => {
      expect(screen.getByText('Runtime Execution Environment')).toBeInTheDocument();
      expect(screen.getByText('Windows-10-Mock')).toBeInTheDocument();
      expect(screen.getByText('3.10.0')).toBeInTheDocument();
      expect(screen.getByText('64bit')).toBeInTheDocument();
    });
  });

  it('handles 404 report not found state', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: {
            code: 'FG-EVAL-404',
            message: "Evaluation report 'exp_unknown' not found.",
          },
        }),
      });
    });

    renderDetail('exp_unknown');

    await waitFor(() => {
      expect(screen.getByText('Evaluation Report Not Found')).toBeInTheDocument();
      expect(screen.getByText("Evaluation report 'exp_unknown' not found.")).toBeInTheDocument();
    });
  });
});
