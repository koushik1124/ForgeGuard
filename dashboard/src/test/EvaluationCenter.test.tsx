import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { EvaluationCenterPage } from '../pages/EvaluationCenterPage';

const mockCatalog = {
  total_scenarios: 20,
  suites: {
    reliability: [
      {
        scenario_id: 'rel_01_success',
        name: 'Reliability Happy Path Execution',
        category: 'reliability',
        severity: 'high',
        description: 'Verify governed agent task completes within limits.',
        tags: ['reliability', 'core'],
      },
    ],
    recovery: [
      {
        scenario_id: 'rec_01_checkpoint_resume',
        name: 'Crash Recovery After Checkpoint',
        category: 'recovery',
        severity: 'critical',
        description: 'Reconstruct state and safely resume after crash.',
        tags: ['recovery', 'durability'],
      },
    ],
    security: [],
    agent: [],
    benchmarks: [],
  },
  scenarios: [
    {
      scenario_id: 'rel_01_success',
      name: 'Reliability Happy Path Execution',
      category: 'reliability',
      severity: 'high',
      description: 'Verify governed agent task completes within limits.',
      tags: ['reliability', 'core'],
    },
    {
      scenario_id: 'rec_01_checkpoint_resume',
      name: 'Crash Recovery After Checkpoint',
      category: 'recovery',
      severity: 'critical',
      description: 'Reconstruct state and safely resume after crash.',
      tags: ['recovery', 'durability'],
    },
  ],
};

const mockReports = [
  {
    experiment_id: 'exp_2acfaf2a',
    name: 'forgeguard_evaluation',
    timestamp: '2026-11-21T10:44:46Z',
    duration_ms: 2985.0,
    total_scenarios: 20,
    passed: 20,
    failed: 0,
    errors: 0,
    skipped: 0,
    overall_status: 'pass',
    pass_rate_pct: 100.0,
  },
  {
    experiment_id: 'exp_6bc1c671',
    name: 'forgeguard_evaluation',
    timestamp: '2026-11-21T10:22:15Z',
    duration_ms: 3120.0,
    total_scenarios: 20,
    passed: 18,
    failed: 2,
    errors: 0,
    skipped: 0,
    overall_status: 'fail',
    pass_rate_pct: 90.0,
  },
];

describe('EvaluationCenterPage Integration (M9.7.2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Evaluation Center header, overview cards, and historical runs', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/evaluations/scenarios')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockCatalog,
        });
      }
      if (url.includes('/api/v1/evaluations/reports')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ total_reports: 2, reports: mockReports }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderWithProviders(<EvaluationCenterPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /Evaluation Center/i })).toBeInTheDocument();
      expect(screen.getByText('Control. Recover. Observe. Evaluate.')).toBeInTheDocument();
    });

    await waitFor(() => {
      // Metric cards
      expect(screen.getByText('Registered Scenarios')).toBeInTheDocument();
      expect(screen.getByText('Historical Reports')).toBeInTheDocument();
      expect(screen.getByText('Latest Run Status')).toBeInTheDocument();

      // Reports in table
      expect(screen.getByText('exp_2acfaf2a')).toBeInTheDocument();
      expect(screen.getByText('exp_6bc1c671')).toBeInTheDocument();
      expect(screen.getByText('100.0%')).toBeInTheDocument();
      expect(screen.getByText('90.0%')).toBeInTheDocument();
    });
  });

  it('navigates to Scenario Catalog tab and displays scenario suites', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/evaluations/scenarios')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockCatalog,
        });
      }
      if (url.includes('/api/v1/evaluations/reports')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ total_reports: 2, reports: mockReports }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderWithProviders(<EvaluationCenterPage />);

    await waitFor(() => {
      expect(screen.getByText(/Scenario Catalog/i)).toBeInTheDocument();
    });

    // Click Scenario Catalog tab
    fireEvent.click(screen.getByRole('tab', { name: /Scenario Catalog/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Reliability & Invariants').length).toBeGreaterThan(0);
      expect(screen.getByText('rel_01_success')).toBeInTheDocument();
      expect(screen.getByText('Reliability Happy Path Execution')).toBeInTheDocument();
    });
  });

  it('renders empty reports state gracefully', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/evaluations/scenarios')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockCatalog,
        });
      }
      if (url.includes('/api/v1/evaluations/reports')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ total_reports: 0, reports: [] }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderWithProviders(<EvaluationCenterPage />);

    await waitFor(() => {
      expect(screen.getByText('No historical evaluation reports found on disk in eval_reports.')).toBeInTheDocument();
    });
  });

  it('renders error state when API fails', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: { message: 'Failed to load evaluation reports' } }),
      });
    });

    renderWithProviders(<EvaluationCenterPage />);

    await waitFor(() => {
      expect(screen.getByText('Evaluation Center Unavailable')).toBeInTheDocument();
    });
  });
});
