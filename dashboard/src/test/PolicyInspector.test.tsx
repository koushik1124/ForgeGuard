import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { PolicyInspector } from '../components/governance/PolicyInspector';
import { PolicyDecisionItem } from '../api/governance/types';

describe('PolicyInspector Component', () => {
  const mockDecisions: PolicyDecisionItem[] = [
    {
      id: 'dec-1',
      toolName: 'workspace_read_file',
      allowed: true,
      matchedRule: 'explicit_allow',
      reason: "Tool 'workspace_read_file' is explicitly allowed",
      step: 0,
      callId: 'call-read-001',
      timestamp: '2026-11-23T10:00:00Z',
      payload: {
        tool_name: 'workspace_read_file',
        allowed: true,
        matched_rule: 'explicit_allow',
        reason: "Tool 'workspace_read_file' is explicitly allowed",
      },
      executionStatus: 'success',
      executionDuration: 0.55,
    },
    {
      id: 'dec-2',
      toolName: 'bash_rm_rf',
      allowed: false,
      matchedRule: 'explicit_deny',
      reason: "Tool 'bash_rm_rf' is explicitly denied",
      step: 1,
      callId: 'call-rm-002',
      timestamp: '2026-11-23T10:00:01Z',
      payload: {
        tool_name: 'bash_rm_rf',
        allowed: false,
        matched_rule: 'explicit_deny',
        reason: "Tool 'bash_rm_rf' is explicitly denied",
      },
      executionStatus: 'rejected',
      executionError: "Tool 'bash_rm_rf' is explicitly denied",
    },
  ];

  it('renders allowed and denied decisions with explicit status badges and rule metadata', () => {
    renderWithProviders(<PolicyInspector decisions={mockDecisions} />);

    expect(screen.getByText('workspace_read_file')).toBeInTheDocument();
    expect(screen.getByText('ALLOWED')).toBeInTheDocument();
    expect(screen.getByText('Rule: explicit_allow')).toBeInTheDocument();
    expect(screen.getByText(/Tool 'workspace_read_file' is explicitly allowed/i)).toBeInTheDocument();
    expect(screen.getByText('Executed: Success (0.55s)')).toBeInTheDocument();

    expect(screen.getByText('bash_rm_rf')).toBeInTheDocument();
    expect(screen.getByText('DENIED')).toBeInTheDocument();
    expect(screen.getByText('Rule: explicit_deny')).toBeInTheDocument();
    expect(screen.getByText('Execution Blocked by Engine')).toBeInTheDocument();
  });

  it('filters decisions by allowed and denied buttons', () => {
    renderWithProviders(<PolicyInspector decisions={mockDecisions} />);

    const allowedBtn = screen.getByRole('button', { name: /Allowed \(1\)/i });
    fireEvent.click(allowedBtn);

    expect(screen.getByText('workspace_read_file')).toBeInTheDocument();
    expect(screen.queryByText('bash_rm_rf')).not.toBeInTheDocument();

    const deniedBtn = screen.getByRole('button', { name: /Denied \(1\)/i });
    fireEvent.click(deniedBtn);

    expect(screen.queryByText('workspace_read_file')).not.toBeInTheDocument();
    expect(screen.getByText('bash_rm_rf')).toBeInTheDocument();
  });

  it('filters decisions by search query', () => {
    renderWithProviders(<PolicyInspector decisions={mockDecisions} />);

    const searchInput = screen.getByPlaceholderText(/Filter decisions/i);
    fireEvent.change(searchInput, { target: { value: 'workspace' } });

    expect(screen.getByText('workspace_read_file')).toBeInTheDocument();
    expect(screen.queryByText('bash_rm_rf')).not.toBeInTheDocument();
  });

  it('expands decision payload forensics upon click', () => {
    renderWithProviders(<PolicyInspector decisions={mockDecisions} />);

    // Click on the decision card to expand
    const decisionCard = screen.getByText('workspace_read_file');
    fireEvent.click(decisionCard);

    expect(screen.getByText(/Policy Decision Forensics & Correlated Evidence/i)).toBeInTheDocument();
    expect(screen.getByText('call-read-001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Payload/i })).toBeInTheDocument();
  });

  it('renders clean empty state when no decisions exist', () => {
    renderWithProviders(<PolicyInspector decisions={[]} />);

    expect(screen.getByText('No Policy Decisions Recorded')).toBeInTheDocument();
  });
});
