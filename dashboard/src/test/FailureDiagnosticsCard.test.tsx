import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { FailureDiagnosticsCard } from '../components/recovery/FailureDiagnosticsCard';
import { DiagnosticItem } from '../api/recovery/types';

describe('FailureDiagnosticsCard Component', () => {
  const mockDiagnostics: DiagnosticItem[] = [
    {
      diagnostic_id: 'diag-1',
      code: 'FG-RECOVERY-001',
      severity: 'critical',
      category: 'recovery',
      message: 'Crash recovery failed or blocked: Tool call in uncertain state',
      suggested_action: 'Inspect tool executions in UNCERTAIN state; verify external idempotency.',
      tool_call_id: 'call-side-effect',
      details: {
        reason: 'Uncertain tool execution',
        tool_name: 'external_payment_api',
      },
    },
    {
      diagnostic_id: 'diag-2',
      code: 'FG-TIMEOUT-001',
      severity: 'error',
      category: 'timeout',
      message: "Tool 'web_scrape' timed out after 30.00 seconds.",
      suggested_action: 'Increase max_tool_duration_seconds or optimize handler.',
      tool_call_id: 'call-scrape-02',
      details: {
        timeout_seconds: 30.0,
      },
    },
    {
      diagnostic_id: 'diag-3',
      code: 'FG-CANCEL-001',
      severity: 'info',
      category: 'cancellation',
      message: 'Task execution was explicitly cancelled.',
      suggested_action: 'None required; cancellation was requested.',
    },
  ];

  it('renders diagnostics with severity badges, codes, and suggested actions', () => {
    renderWithProviders(<FailureDiagnosticsCard diagnostics={mockDiagnostics} />);

    expect(screen.getByText('FG-RECOVERY-001')).toBeInTheDocument();
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText(/Crash recovery failed or blocked/i)).toBeInTheDocument();
    expect(screen.getByText(/Inspect tool executions in UNCERTAIN state/i)).toBeInTheDocument();
    expect(screen.getByText('call-side-effect')).toBeInTheDocument();

    expect(screen.getByText('FG-TIMEOUT-001')).toBeInTheDocument();
    expect(screen.getByText('ERROR')).toBeInTheDocument();
    expect(screen.getByText("Tool 'web_scrape' timed out after 30.00 seconds.")).toBeInTheDocument();

    expect(screen.getByText('FG-CANCEL-001')).toBeInTheDocument();
    expect(screen.getByText('INFO')).toBeInTheDocument();
  });

  it('filters diagnostics by severity buttons', () => {
    renderWithProviders(<FailureDiagnosticsCard diagnostics={mockDiagnostics} />);

    // Click CRITICAL filter
    const criticalBtn = screen.getByRole('button', { name: /CRITICAL \(1\)/i });
    fireEvent.click(criticalBtn);

    expect(screen.getByText('FG-RECOVERY-001')).toBeInTheDocument();
    expect(screen.queryByText('FG-TIMEOUT-001')).not.toBeInTheDocument();
    expect(screen.queryByText('FG-CANCEL-001')).not.toBeInTheDocument();

    // Click All Diagnostics
    const allBtn = screen.getByRole('button', { name: /All Diagnostics \(3\)/i });
    fireEvent.click(allBtn);

    expect(screen.getByText('FG-TIMEOUT-001')).toBeInTheDocument();
  });

  it('filters diagnostics by search query', () => {
    renderWithProviders(<FailureDiagnosticsCard diagnostics={mockDiagnostics} />);

    const searchInput = screen.getByPlaceholderText(/Filter diagnostics/i);
    fireEvent.change(searchInput, { target: { value: 'scrape' } });

    expect(screen.getByText('FG-TIMEOUT-001')).toBeInTheDocument();
    expect(screen.queryByText('FG-RECOVERY-001')).not.toBeInTheDocument();
  });

  it('expands diagnostic payload forensics details upon click', () => {
    renderWithProviders(<FailureDiagnosticsCard diagnostics={mockDiagnostics} />);

    const collapseBtn = screen.getAllByLabelText(/Expand diagnostic details/i)[0];
    fireEvent.click(collapseBtn);

    expect(screen.getByText('Diagnostic Forensics Payload')).toBeInTheDocument();
    expect(screen.getByText(/external_payment_api/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Details/i })).toBeInTheDocument();
  });

  it('renders clean empty state when no diagnostics exist', () => {
    renderWithProviders(<FailureDiagnosticsCard diagnostics={[]} />);

    expect(screen.getByText('No Diagnostic Anomalies Recorded')).toBeInTheDocument();
  });
});
