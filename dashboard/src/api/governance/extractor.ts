/**
 * ForgeGuard Governance Data Extractor (M9.5)
 * Pure transformation and correlation functions extracting policy decisions
 * and budget metrics from execution event journals.
 */

import { NormalizedEvent, ToolCallItem } from '../sse/types';
import { BudgetMetric, BudgetThresholdStatus, PolicyDecisionItem, TaskBudgetState } from './types';

/**
 * Format raw byte counts into readable strings (B, KB, MB, GB).
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) {
    return '--';
  }
  if (bytes === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const idx = Math.min(i, units.length - 1);
  const formatted = (bytes / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1);
  return `${formatted} ${units[idx]}`;
}

/**
 * Format duration seconds into concise human-readable time strings.
 */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) {
    return '--';
  }
  if (seconds < 0) {
    return '0.00s';
  }
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const remSec = (seconds % 60).toFixed(1);
  return `${mins}m ${remSec}s`;
}

/**
 * Compute the threshold status given a percentage used.
 */
export function computeThresholdStatus(
  percent: number | null,
  isExplicitlyExceeded: boolean = false
): BudgetThresholdStatus {
  if (isExplicitlyExceeded || (percent !== null && percent >= 100)) {
    return 'exhausted';
  }
  if (percent === null) {
    return 'unknown';
  }
  if (percent >= 90) {
    return 'critical';
  }
  if (percent >= 70) {
    return 'warning';
  }
  return 'normal';
}

/**
 * Extract policy decisions from normalized events and correlate them with tool execution outcomes.
 */
export function extractPolicyDecisions(
  events: NormalizedEvent[],
  toolCalls: ToolCallItem[] = [],
  fallbackTimeline?: Array<Record<string, unknown>> | null
): PolicyDecisionItem[] {
  // Build lookup index for tool calls by callId and by `${toolName}:${step}`
  const toolCallMap = new Map<string, ToolCallItem>();
  for (const tc of toolCalls) {
    if (tc.callId) {
      toolCallMap.set(tc.callId, tc);
    }
    if (tc.toolName && tc.step !== undefined) {
      toolCallMap.set(`${tc.toolName}:${tc.step}`, tc);
    }
  }

  const decisions: PolicyDecisionItem[] = [];

  for (const event of events) {
    if (event.eventType !== 'policy_decision') {
      continue;
    }

    const payload = event.payload || {};
    const toolName = (payload.tool_name as string) || event.toolName || 'unknown_tool';
    const allowed = Boolean(payload.allowed);
    const matchedRule = (payload.matched_rule as string) || (allowed ? 'explicit_allow' : 'default_deny');
    const reason = (payload.reason as string) || (allowed ? `Tool '${toolName}' allowed` : `Tool '${toolName}' denied`);
    const step = payload.step !== undefined ? Number(payload.step) : event.step;
    const callId = (payload.call_id as string) || event.toolCallId;

    // Find correlated tool execution
    let correlated: ToolCallItem | undefined;
    if (callId && toolCallMap.has(callId)) {
      correlated = toolCallMap.get(callId);
    } else if (toolName && step !== undefined && toolCallMap.has(`${toolName}:${step}`)) {
      correlated = toolCallMap.get(`${toolName}:${step}`);
    }

    let executionStatus: PolicyDecisionItem['executionStatus'] = 'not_executed';
    let executionError: string | undefined;
    let executionDuration: number | undefined;
    let executionOutput: unknown = undefined;

    if (!allowed) {
      // If policy denied, tool was blocked by engine
      executionStatus = 'rejected';
      executionError = reason;
    } else if (correlated) {
      if (correlated.status === 'success') {
        executionStatus = 'success';
        executionDuration = correlated.durationSeconds;
        executionOutput = correlated.output;
      } else if (correlated.status === 'failure') {
        executionStatus = 'failure';
        executionError = correlated.error || 'Execution failed';
        executionDuration = correlated.durationSeconds;
      } else if (correlated.status === 'timeout') {
        executionStatus = 'timeout';
        executionError = correlated.error || 'Execution timed out';
      } else if (correlated.status === 'running') {
        executionStatus = 'running';
      } else if (correlated.status === 'rejected') {
        executionStatus = 'rejected';
        executionError = correlated.error;
      }
    }

    decisions.push({
      id: event.id,
      toolName,
      allowed,
      matchedRule,
      reason,
      step,
      callId,
      timestamp: event.timestamp,
      payload,
      executionStatus,
      executionError,
      executionDuration,
      executionOutput,
    });
  }

  // Fallback to persisted diagnostic timeline if no SSE events provided policy decisions
  if (decisions.length === 0 && fallbackTimeline && fallbackTimeline.length > 0) {
    for (const item of fallbackTimeline) {
      const eventType = String(item.event_type || '');
      if (eventType !== 'policy_decision') continue;
      const details = (item.details || item.payload || item.metadata || {}) as Record<string, unknown>;
      const toolName = (details.tool_name as string) || (item.tool_name as string) || 'unknown_tool';
      const allowed = Boolean(details.allowed !== undefined ? details.allowed : (item.status === 'ok' || item.status === 'allowed' || item.status === 'success'));
      const matchedRule = (details.matched_rule as string) || (allowed ? 'explicit_allow' : 'default_deny');
      const reason = (details.reason as string) || (item.summary as string) || (allowed ? `Tool '${toolName}' allowed` : `Tool '${toolName}' denied`);
      const step = details.step !== undefined ? Number(details.step) : undefined;
      const callId = (details.call_id as string) || (item.tool_call_id as string) || undefined;

      decisions.push({
        id: `timeline-${item.sequence_number || Math.random().toString(36).slice(2)}`,
        toolName,
        allowed,
        matchedRule,
        reason,
        step,
        callId,
        timestamp: (item.timestamp as string) || new Date().toISOString(),
        payload: details,
        executionStatus: allowed ? 'success' : 'rejected',
        executionError: !allowed ? reason : undefined,
      });
    }
  }

  return decisions;
}

/**
 * Extract chronological budget state from execution events and optional fallback snapshot.
 */
export function extractBudgetState(
  events: NormalizedEvent[],
  fallbackSnapshot?: Record<string, unknown> | null
): TaskBudgetState {
  const state: TaskBudgetState = {
    hasEvents: false,
    isExceeded: false,
    exceededLimit: undefined,
    exceededReason: undefined,
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

  // Helper to extract numeric field safely
  const parseNum = (val: unknown): number | null => {
    if (typeof val === 'number' && !isNaN(val)) {
      return val;
    }
    if (typeof val === 'string' && val.trim() !== '') {
      const parsed = parseFloat(val);
      return !isNaN(parsed) ? parsed : null;
    }
    return null;
  };

  for (const event of events) {
    const payload = event.payload || {};

    if (event.eventType === 'budget_initialized') {
      state.hasEvents = true;
      // Handle both top-level and nested payload.budget
      const bObj = (typeof payload.budget === 'object' && payload.budget !== null)
        ? (payload.budget as Record<string, unknown>)
        : payload;

      if (bObj.max_tool_calls !== undefined) state.maxToolCalls = parseNum(bObj.max_tool_calls);
      if (bObj.max_execution_seconds !== undefined) state.maxExecutionSeconds = parseNum(bObj.max_execution_seconds);
      if (bObj.max_output_bytes !== undefined) state.maxOutputBytes = parseNum(bObj.max_output_bytes);
      if (bObj.max_consecutive_failures !== undefined) state.maxConsecutiveFailures = parseNum(bObj.max_consecutive_failures);
      if (bObj.max_tool_duration_seconds !== undefined) state.maxToolDurationSeconds = parseNum(bObj.max_tool_duration_seconds);

      // Initial defaults
      if (state.maxToolCalls !== null && state.remainingToolCalls === null) {
        state.remainingToolCalls = state.maxToolCalls;
      }
      if (state.maxExecutionSeconds !== null && state.remainingSeconds === null) {
        state.remainingSeconds = state.maxExecutionSeconds;
      }
      if (state.maxOutputBytes !== null && state.remainingOutputBytes === null) {
        state.remainingOutputBytes = state.maxOutputBytes;
      }
    } else if (event.eventType === 'budget_updated') {
      state.hasEvents = true;
      if (payload.max_tool_calls !== undefined) state.maxToolCalls = parseNum(payload.max_tool_calls);
      if (payload.tool_calls_reserved !== undefined) state.toolCallsReserved = parseNum(payload.tool_calls_reserved) ?? state.toolCallsReserved;
      if (payload.remaining_tool_calls !== undefined) state.remainingToolCalls = parseNum(payload.remaining_tool_calls);
      if (payload.successful_tool_calls !== undefined) state.successfulToolCalls = parseNum(payload.successful_tool_calls) ?? state.successfulToolCalls;
      if (payload.failed_tool_calls !== undefined) state.failedToolCalls = parseNum(payload.failed_tool_calls) ?? state.failedToolCalls;
      if (payload.timed_out_tool_calls !== undefined) state.timedOutToolCalls = parseNum(payload.timed_out_tool_calls) ?? state.timedOutToolCalls;

      if (payload.max_execution_seconds !== undefined) state.maxExecutionSeconds = parseNum(payload.max_execution_seconds);
      if (payload.elapsed_seconds !== undefined) state.elapsedSeconds = parseNum(payload.elapsed_seconds) ?? state.elapsedSeconds;
      if (payload.remaining_seconds !== undefined) state.remainingSeconds = parseNum(payload.remaining_seconds);
      if (payload.max_tool_duration_seconds !== undefined) state.maxToolDurationSeconds = parseNum(payload.max_tool_duration_seconds);

      if (payload.max_output_bytes !== undefined) state.maxOutputBytes = parseNum(payload.max_output_bytes);
      if (payload.cumulative_output_bytes !== undefined) state.cumulativeOutputBytes = parseNum(payload.cumulative_output_bytes) ?? state.cumulativeOutputBytes;
      if (payload.remaining_output_bytes !== undefined) state.remainingOutputBytes = parseNum(payload.remaining_output_bytes);

      if (payload.max_consecutive_failures !== undefined) state.maxConsecutiveFailures = parseNum(payload.max_consecutive_failures);
      if (payload.consecutive_failures !== undefined) state.consecutiveFailures = parseNum(payload.consecutive_failures) ?? state.consecutiveFailures;
    } else if (event.eventType === 'budget_exceeded') {
      state.hasEvents = true;
      state.isExceeded = true;
      state.exceededLimit = (payload.limit as string) || state.exceededLimit;
      state.exceededReason = (payload.reason as string) || state.exceededReason;

      // Also ingest snapshot fields embedded in budget_exceeded
      if (payload.tool_calls_reserved !== undefined) state.toolCallsReserved = parseNum(payload.tool_calls_reserved) ?? state.toolCallsReserved;
      if (payload.cumulative_output_bytes !== undefined) state.cumulativeOutputBytes = parseNum(payload.cumulative_output_bytes) ?? state.cumulativeOutputBytes;
      if (payload.elapsed_seconds !== undefined) state.elapsedSeconds = parseNum(payload.elapsed_seconds) ?? state.elapsedSeconds;
      if (payload.consecutive_failures !== undefined) state.consecutiveFailures = parseNum(payload.consecutive_failures) ?? state.consecutiveFailures;
    }
  }

  // Merge or fallback to persisted diagnostic budget snapshot
  if (fallbackSnapshot && typeof fallbackSnapshot === 'object') {
    state.hasEvents = true;
    if (fallbackSnapshot.max_tool_calls !== undefined && state.maxToolCalls === null) {
      state.maxToolCalls = parseNum(fallbackSnapshot.max_tool_calls);
    }
    const snapReserved = parseNum(fallbackSnapshot.tool_calls_reserved) ?? 0;
    if (snapReserved > state.toolCallsReserved || state.toolCallsReserved === 0) {
      state.toolCallsReserved = snapReserved;
    }
    if (fallbackSnapshot.remaining_tool_calls !== undefined && (state.remainingToolCalls === null || snapReserved > state.toolCallsReserved)) {
      state.remainingToolCalls = parseNum(fallbackSnapshot.remaining_tool_calls);
    }
    const snapSuccess = parseNum(fallbackSnapshot.successful_tool_calls) ?? 0;
    if (snapSuccess > state.successfulToolCalls) {
      state.successfulToolCalls = snapSuccess;
    }
    const snapFailed = parseNum(fallbackSnapshot.failed_tool_calls) ?? 0;
    if (snapFailed > state.failedToolCalls) {
      state.failedToolCalls = snapFailed;
    }
    const snapTimedOut = parseNum(fallbackSnapshot.timed_out_tool_calls) ?? 0;
    if (snapTimedOut > state.timedOutToolCalls) {
      state.timedOutToolCalls = snapTimedOut;
    }

    if (fallbackSnapshot.max_execution_seconds !== undefined && state.maxExecutionSeconds === null) {
      state.maxExecutionSeconds = parseNum(fallbackSnapshot.max_execution_seconds);
    }
    const snapElapsed = parseNum(fallbackSnapshot.elapsed_seconds) ?? 0;
    if (snapElapsed > state.elapsedSeconds) {
      state.elapsedSeconds = snapElapsed;
    }
    if (fallbackSnapshot.remaining_seconds !== undefined && state.remainingSeconds === null) {
      state.remainingSeconds = parseNum(fallbackSnapshot.remaining_seconds);
    }
    if (fallbackSnapshot.max_tool_duration_seconds !== undefined && state.maxToolDurationSeconds === null) {
      state.maxToolDurationSeconds = parseNum(fallbackSnapshot.max_tool_duration_seconds);
    }

    if (fallbackSnapshot.max_output_bytes !== undefined && state.maxOutputBytes === null) {
      state.maxOutputBytes = parseNum(fallbackSnapshot.max_output_bytes);
    }
    const snapBytes = parseNum(fallbackSnapshot.cumulative_output_bytes) ?? 0;
    if (snapBytes > state.cumulativeOutputBytes) {
      state.cumulativeOutputBytes = snapBytes;
    }
    if (fallbackSnapshot.remaining_output_bytes !== undefined && state.remainingOutputBytes === null) {
      state.remainingOutputBytes = parseNum(fallbackSnapshot.remaining_output_bytes);
    }

    if (fallbackSnapshot.max_consecutive_failures !== undefined && state.maxConsecutiveFailures === null) {
      state.maxConsecutiveFailures = parseNum(fallbackSnapshot.max_consecutive_failures);
    }
    const snapFailures = parseNum(fallbackSnapshot.consecutive_failures) ?? 0;
    if (snapFailures > state.consecutiveFailures) {
      state.consecutiveFailures = snapFailures;
    }
  }

  return state;
}

/**
 * Compute the 4 primary budget metric models with exact progress and thresholds.
 */
export function computeBudgetMetrics(state: TaskBudgetState): BudgetMetric[] {
  // 1. Tool Calls Metric
  let toolCallsPercent: number | null = null;
  if (state.maxToolCalls !== null && state.maxToolCalls > 0) {
    toolCallsPercent = Math.min(100, Math.round((state.toolCallsReserved / state.maxToolCalls) * 100));
  }
  const toolCallsStatus = computeThresholdStatus(
    toolCallsPercent,
    state.isExceeded && state.exceededLimit === 'max_tool_calls'
  );

  const toolCallsMetric: BudgetMetric = {
    id: 'tool_calls',
    name: 'Tool Calls Quota',
    limit: state.maxToolCalls,
    used: state.toolCallsReserved,
    remaining: state.remainingToolCalls,
    unit: 'calls',
    percentUsed: toolCallsPercent,
    status: toolCallsStatus,
    formattedLimit: state.maxToolCalls !== null ? `${state.maxToolCalls} calls` : '--',
    formattedUsed: `${state.toolCallsReserved} reserved`,
    formattedRemaining: state.remainingToolCalls !== null ? `${state.remainingToolCalls} calls` : '--',
    details: `${state.successfulToolCalls} ok • ${state.failedToolCalls} failed • ${state.timedOutToolCalls} timeouts`,
  };

  // 2. Execution Duration Metric
  let durationPercent: number | null = null;
  if (state.maxExecutionSeconds !== null && state.maxExecutionSeconds > 0) {
    durationPercent = Math.min(100, Math.round((state.elapsedSeconds / state.maxExecutionSeconds) * 100));
  }
  const durationStatus = computeThresholdStatus(
    durationPercent,
    state.isExceeded && state.exceededLimit === 'max_execution_seconds'
  );

  const durationMetric: BudgetMetric = {
    id: 'execution_duration',
    name: 'Execution Duration',
    limit: state.maxExecutionSeconds,
    used: state.elapsedSeconds,
    remaining: state.remainingSeconds,
    unit: 'seconds',
    percentUsed: durationPercent,
    status: durationStatus,
    formattedLimit: formatSeconds(state.maxExecutionSeconds),
    formattedUsed: formatSeconds(state.elapsedSeconds),
    formattedRemaining: formatSeconds(state.remainingSeconds),
    details: state.maxToolDurationSeconds ? `Tool timeout: ${state.maxToolDurationSeconds}s/call` : undefined,
  };

  // 3. Output Volume Metric
  let outputPercent: number | null = null;
  if (state.maxOutputBytes !== null && state.maxOutputBytes > 0) {
    outputPercent = Math.min(100, Math.round((state.cumulativeOutputBytes / state.maxOutputBytes) * 100));
  }
  const outputStatus = computeThresholdStatus(
    outputPercent,
    state.isExceeded && state.exceededLimit === 'max_output_bytes'
  );

  const outputMetric: BudgetMetric = {
    id: 'output_bytes',
    name: 'Output Volume',
    limit: state.maxOutputBytes,
    used: state.cumulativeOutputBytes,
    remaining: state.remainingOutputBytes,
    unit: 'bytes',
    percentUsed: outputPercent,
    status: outputStatus,
    formattedLimit: formatBytes(state.maxOutputBytes),
    formattedUsed: formatBytes(state.cumulativeOutputBytes),
    formattedRemaining: formatBytes(state.remainingOutputBytes),
    details: state.remainingOutputBytes !== null ? `${formatBytes(state.remainingOutputBytes)} capacity remaining` : undefined,
  };

  // 4. Consecutive Failures Metric
  let failurePercent: number | null = null;
  if (state.maxConsecutiveFailures !== null && state.maxConsecutiveFailures > 0) {
    failurePercent = Math.min(100, Math.round((state.consecutiveFailures / state.maxConsecutiveFailures) * 100));
  }
  const failureStatus = computeThresholdStatus(
    failurePercent,
    state.isExceeded && state.exceededLimit === 'max_consecutive_failures'
  );

  const failureMetric: BudgetMetric = {
    id: 'consecutive_failures',
    name: 'Failure Streak',
    limit: state.maxConsecutiveFailures,
    used: state.consecutiveFailures,
    remaining: state.maxConsecutiveFailures !== null ? Math.max(0, state.maxConsecutiveFailures - state.consecutiveFailures) : null,
    unit: 'failures',
    percentUsed: failurePercent,
    status: failureStatus,
    formattedLimit: state.maxConsecutiveFailures !== null ? `Max ${state.maxConsecutiveFailures}` : '--',
    formattedUsed: `${state.consecutiveFailures} streak`,
    formattedRemaining: state.maxConsecutiveFailures !== null ? `${Math.max(0, state.maxConsecutiveFailures - state.consecutiveFailures)} left` : '--',
    details: state.consecutiveFailures === 0 ? 'Zero active failure streak' : `${state.consecutiveFailures} consecutive failure(s)`,
  };

  return [toolCallsMetric, durationMetric, outputMetric, failureMetric];
}
