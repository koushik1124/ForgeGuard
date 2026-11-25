import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { GovernanceInspector } from '../components/governance/GovernanceInspector';
import { NormalizedEvent, ToolCallItem } from '../api/sse/types';

describe('GovernanceInspector Integration (M9.5)', () => {
  // Exact replay dataset matching real verified task-230ca91b3c26
  const realTaskEvents: NormalizedEvent[] = [
    {
      id: 'norm-1',
      sequenceNumber: 1,
      timestamp: '2026-11-23T10:00:00Z',
      eventType: 'task_started',
      category: 'lifecycle',
      summary: 'Governed execution started',
      payload: { task_id: 'task-230ca91b3c26' },
      isReplayed: true,
    },
    {
      id: 'norm-2',
      sequenceNumber: 2,
      timestamp: '2026-11-23T10:00:00Z',
      eventType: 'budget_initialized',
      category: 'budget',
      summary: 'Execution budget allocated and initialized',
      payload: {
        task_id: 'task-230ca91b3c26',
        budget: {
          max_consecutive_failures: 5,
          max_execution_seconds: 120.0,
          max_output_bytes: 1000000,
          max_tool_calls: 20,
          max_tool_duration_seconds: 30.0,
        },
      },
      isReplayed: true,
    },
    {
      id: 'norm-3',
      sequenceNumber: 3,
      timestamp: '2026-11-23T10:00:01Z',
      eventType: 'policy_decision',
      category: 'policy',
      summary: "Policy ALLOWED 'workspace_read_file'",
      payload: {
        allowed: true,
        call_id: 'task-230ca91b3c26:step_0:workspace_read_file',
        matched_rule: 'explicit_allow',
        reason: "Tool 'workspace_read_file' is explicitly allowed",
        step: 0,
        task_id: 'task-230ca91b3c26',
        tool_name: 'workspace_read_file',
      },
      isReplayed: true,
    },
    {
      id: 'norm-4',
      sequenceNumber: 4,
      timestamp: '2026-11-23T10:00:01Z',
      eventType: 'tool_call_started',
      category: 'tool',
      summary: "Tool 'workspace_read_file' started execution",
      payload: {
        call_id: 'task-230ca91b3c26:step_0:workspace_read_file',
        step: 0,
        timeout: 30.0,
        tool_name: 'workspace_read_file',
      },
      isReplayed: true,
    },
    {
      id: 'norm-5',
      sequenceNumber: 5,
      timestamp: '2026-11-23T10:00:01Z',
      eventType: 'tool_call_completed',
      category: 'tool',
      durationSeconds: 0.547,
      summary: "Tool 'workspace_read_file' completed successfully",
      payload: {
        call_id: 'task-230ca91b3c26:step_0:workspace_read_file',
        output: { content: 'payment risk rules' },
        status: 'success',
        step: 0,
        tool_name: 'workspace_read_file',
      },
      isReplayed: true,
    },
    {
      id: 'norm-6',
      sequenceNumber: 6,
      timestamp: '2026-11-23T10:00:01Z',
      eventType: 'budget_updated',
      category: 'budget',
      summary: "Budget updated after 'workspace_read_file'",
      payload: {
        consecutive_failures: 0,
        cumulative_output_bytes: 781,
        elapsed_seconds: 0.547,
        failed_tool_calls: 0,
        max_consecutive_failures: 5,
        max_execution_seconds: 120.0,
        max_output_bytes: 1000000,
        max_tool_calls: 20,
        max_tool_duration_seconds: 30.0,
        remaining_output_bytes: 999219,
        remaining_seconds: 119.453,
        remaining_tool_calls: 19,
        step: 0,
        successful_tool_calls: 1,
        task_id: 'task-230ca91b3c26',
        timed_out_tool_calls: 0,
        tool_calls_reserved: 1,
        tool_name: 'workspace_read_file',
      },
      isReplayed: true,
    },
    {
      id: 'norm-7',
      sequenceNumber: 7,
      timestamp: '2026-11-23T10:00:02Z',
      eventType: 'task_completed',
      category: 'lifecycle',
      summary: 'Task completed successfully in 1 steps',
      payload: { steps: 1, task_id: 'task-230ca91b3c26' },
      isReplayed: true,
    },
    {
      id: 'norm-8',
      sequenceNumber: 8,
      timestamp: '2026-11-23T10:00:02Z',
      eventType: 'stream_closed',
      category: 'lifecycle',
      summary: 'SSE stream completed',
      payload: { status: 'completed' },
      isReplayed: true,
    },
  ];

  const correlatedToolCalls: ToolCallItem[] = [
    {
      callId: 'task-230ca91b3c26:step_0:workspace_read_file',
      toolName: 'workspace_read_file',
      step: 0,
      status: 'success',
      durationSeconds: 0.547,
      output: { content: 'payment risk rules' },
    },
  ];

  it('renders complete governance overview from real task-230ca91b3c26 event stream', () => {
    renderWithProviders(
      <GovernanceInspector events={realTaskEvents} toolCalls={correlatedToolCalls} />
    );

    expect(screen.getByText('Governance: Policy & Budget Inspector')).toBeInTheDocument();
    expect(screen.getByText('1 ALLOWED')).toBeInTheDocument();

    // Budget card values
    expect(screen.getByText('1 reserved')).toBeInTheDocument();
    expect(screen.getByText('/ 20 calls')).toBeInTheDocument();
    expect(screen.getByText('0.55s')).toBeInTheDocument();
    expect(screen.getByText('/ 2m 0.0s')).toBeInTheDocument();
    expect(screen.getByText('781 B')).toBeInTheDocument();
    expect(screen.getByText('/ 976.6 KB')).toBeInTheDocument();

    // Policy ledger entries
    expect(screen.getByText('workspace_read_file')).toBeInTheDocument();
    expect(screen.getByText('ALLOWED')).toBeInTheDocument();
    expect(screen.getByText('Rule: explicit_allow')).toBeInTheDocument();
    expect(screen.getByText(/Tool 'workspace_read_file' is explicitly allowed/i)).toBeInTheDocument();
    expect(screen.getByText('Executed: Success (0.55s)')).toBeInTheDocument();
  });

  it('switches between Overview, Policy, and Budgets tabs', () => {
    renderWithProviders(
      <GovernanceInspector events={realTaskEvents} toolCalls={correlatedToolCalls} />
    );

    // Click Policy tab
    const policyTab = screen.getByRole('button', { name: /Policy \(1\)/i });
    fireEvent.click(policyTab);

    expect(screen.getByText('workspace_read_file')).toBeInTheDocument();
    expect(screen.queryByText('Resource Budget Constraints & Utilization')).not.toBeInTheDocument();

    // Click Budgets tab
    const budgetTab = screen.getByRole('button', { name: /Budgets/i });
    fireEvent.click(budgetTab);

    expect(screen.getByText('Tool Calls Quota')).toBeInTheDocument();
    expect(screen.getByText('Output Volume')).toBeInTheDocument();
    expect(screen.queryByText('Security Policy Authorization Ledger')).not.toBeInTheDocument();

    // Click Overview tab
    const overviewTab = screen.getByRole('button', { name: /Overview/i });
    fireEvent.click(overviewTab);

    expect(screen.getByText('Resource Budget Constraints & Utilization')).toBeInTheDocument();
    expect(screen.getByText('Security Policy Authorization Ledger (1 Decisions)')).toBeInTheDocument();
  });

  it('renders clean empty state when no events exist and no snapshot provided', () => {
    renderWithProviders(<GovernanceInspector events={[]} toolCalls={[]} />);

    expect(screen.getByText('No Budget Events Recorded')).toBeInTheDocument();
    expect(screen.getByText('No Policy Decisions Recorded')).toBeInTheDocument();
  });
});
