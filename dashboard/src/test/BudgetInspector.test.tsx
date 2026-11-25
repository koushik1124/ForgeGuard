import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { BudgetInspector } from '../components/governance/BudgetInspector';
import { BudgetMetric, TaskBudgetState } from '../api/governance/types';

describe('BudgetInspector Component', () => {
  const mockBudgetState: TaskBudgetState = {
    hasEvents: true,
    isExceeded: false,
    maxToolCalls: 20,
    toolCallsReserved: 1,
    remainingToolCalls: 19,
    successfulToolCalls: 1,
    failedToolCalls: 0,
    timedOutToolCalls: 0,
    maxExecutionSeconds: 120,
    elapsedSeconds: 0.55,
    remainingSeconds: 119.45,
    maxToolDurationSeconds: 30,
    maxOutputBytes: 1000000,
    cumulativeOutputBytes: 781,
    remainingOutputBytes: 999219,
    maxConsecutiveFailures: 5,
    consecutiveFailures: 0,
  };

  const mockMetrics: BudgetMetric[] = [
    {
      id: 'tool_calls',
      name: 'Tool Calls Quota',
      limit: 20,
      used: 1,
      remaining: 19,
      unit: 'calls',
      percentUsed: 5,
      status: 'normal',
      formattedLimit: '20 calls',
      formattedUsed: '1 reserved',
      formattedRemaining: '19 calls',
      details: '1 ok • 0 failed • 0 timeouts',
    },
    {
      id: 'execution_duration',
      name: 'Execution Duration',
      limit: 120,
      used: 0.55,
      remaining: 119.45,
      unit: 'seconds',
      percentUsed: 1,
      status: 'normal',
      formattedLimit: '2m 0.0s',
      formattedUsed: '0.55s',
      formattedRemaining: '1m 59.5s',
      details: 'Tool timeout: 30s/call',
    },
    {
      id: 'output_bytes',
      name: 'Output Volume',
      limit: 1000000,
      used: 781,
      remaining: 999219,
      unit: 'bytes',
      percentUsed: 1,
      status: 'normal',
      formattedLimit: '976.6 KB',
      formattedUsed: '781 B',
      formattedRemaining: '975.8 KB',
      details: '975.8 KB capacity remaining',
    },
    {
      id: 'consecutive_failures',
      name: 'Failure Streak',
      limit: 5,
      used: 0,
      remaining: 5,
      unit: 'failures',
      percentUsed: 0,
      status: 'normal',
      formattedLimit: 'Max 5',
      formattedUsed: '0 streak',
      formattedRemaining: '5 left',
      details: 'Zero active failure streak',
    },
  ];

  it('renders all four primary governance metric cards with truthful values and progress indicators', () => {
    renderWithProviders(<BudgetInspector budgetState={mockBudgetState} metrics={mockMetrics} />);

    expect(screen.getByText('Tool Calls Quota')).toBeInTheDocument();
    expect(screen.getByText('1 reserved')).toBeInTheDocument();
    expect(screen.getByText('/ 20 calls')).toBeInTheDocument();
    expect(screen.getByText('Remaining: 19 calls')).toBeInTheDocument();

    expect(screen.getByText('Execution Duration')).toBeInTheDocument();
    expect(screen.getByText('0.55s')).toBeInTheDocument();
    expect(screen.getByText('/ 2m 0.0s')).toBeInTheDocument();

    expect(screen.getByText('Output Volume')).toBeInTheDocument();
    expect(screen.getByText('781 B')).toBeInTheDocument();
    expect(screen.getByText('/ 976.6 KB')).toBeInTheDocument();

    expect(screen.getByText('Failure Streak')).toBeInTheDocument();
    expect(screen.getByText('0 streak')).toBeInTheDocument();
  });

  it('renders prominent alert banner when budget limit is exceeded', () => {
    const exceededState: TaskBudgetState = {
      ...mockBudgetState,
      isExceeded: true,
      exceededLimit: 'max_tool_calls',
      exceededReason: 'Execution halted: maximum tool calls limit of 20 reached',
    };

    renderWithProviders(<BudgetInspector budgetState={exceededState} metrics={mockMetrics} />);

    expect(screen.getByText(/Execution Budget Exceeded \(max_tool_calls\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Execution halted: maximum tool calls limit of 20 reached/i)).toBeInTheDocument();
  });

  it('renders clean empty state when no budget events exist', () => {
    const emptyState: TaskBudgetState = {
      hasEvents: false,
      isExceeded: false,
      maxToolCalls: null,
      toolCallsReserved: 0,
      remainingToolCalls: null,
      successfulToolCalls: 0,
      failedToolCalls: 0,
      timedOutToolCalls: 0,
      maxExecutionSeconds: null,
      elapsedSeconds: 0,
      remainingSeconds: null,
      maxToolDurationSeconds: null,
      maxOutputBytes: null,
      cumulativeOutputBytes: 0,
      remainingOutputBytes: null,
      maxConsecutiveFailures: null,
      consecutiveFailures: 0,
    };

    const emptyMetrics: BudgetMetric[] = [
      {
        id: 'tool_calls',
        name: 'Tool Calls Quota',
        limit: null,
        used: 0,
        remaining: null,
        unit: 'calls',
        percentUsed: null,
        status: 'unknown',
        formattedLimit: '--',
        formattedUsed: '0 reserved',
        formattedRemaining: '--',
      },
    ];

    renderWithProviders(<BudgetInspector budgetState={emptyState} metrics={emptyMetrics} />);

    expect(screen.getByText('No Budget Events Recorded')).toBeInTheDocument();
  });
});
