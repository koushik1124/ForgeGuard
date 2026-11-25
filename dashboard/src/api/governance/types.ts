/**
 * ForgeGuard Policy & Budget Governance Contracts (M9.5)
 * Typed models for authorization decisions, budget metrics, and correlation state.
 */

export interface PolicyDecisionItem {
  id: string;
  toolName: string;
  allowed: boolean;
  matchedRule: string;
  reason: string;
  step?: number;
  callId?: string;
  timestamp?: string;
  payload: Record<string, unknown>;
  // Correlated execution state
  executionStatus?: 'not_executed' | 'running' | 'success' | 'failure' | 'timeout' | 'rejected';
  executionError?: string;
  executionDuration?: number;
  executionOutput?: unknown;
}

export type BudgetThresholdStatus = 'normal' | 'warning' | 'critical' | 'exhausted' | 'unknown';

export interface BudgetMetric {
  id: string;
  name: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  unit: string;
  percentUsed: number | null;
  status: BudgetThresholdStatus;
  formattedLimit: string;
  formattedUsed: string;
  formattedRemaining: string;
  details?: string;
}

export interface TaskBudgetState {
  hasEvents: boolean;
  isExceeded: boolean;
  exceededLimit?: string;
  exceededReason?: string;
  // Tool call quotas
  maxToolCalls: number | null;
  toolCallsReserved: number;
  remainingToolCalls: number | null;
  successfulToolCalls: number;
  failedToolCalls: number;
  timedOutToolCalls: number;
  // Duration quotas
  maxExecutionSeconds: number | null;
  elapsedSeconds: number;
  remainingSeconds: number | null;
  maxToolDurationSeconds: number | null;
  // Output byte quotas
  maxOutputBytes: number | null;
  cumulativeOutputBytes: number;
  remainingOutputBytes: number | null;
  // Failure thresholds
  maxConsecutiveFailures: number | null;
  consecutiveFailures: number;
}
