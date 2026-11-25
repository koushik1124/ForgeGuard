/**
 * Event Normalizer & Tool Call Correlator (M9.4)
 * Transforms raw SSE messages into typed, sanitized NormalizedEvent models.
 * Pairs tool calls with results and enforces secret masking.
 */

import { EventCategory, NormalizedEvent, RawSSEMessage, ToolCallItem } from './types';

// Sensitive keys to mask for security
const SENSITIVE_KEY_REGEX = /^(api[-_]?key|secret|token|authorization|auth|password|credential)/i;

/**
 * Recursively mask sensitive fields in objects/arrays before rendering.
 */
export function sanitizePayload<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return value as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item)) as unknown as T;
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(k)) {
        sanitized[k] = '[CONFIGURED / REDACTED]';
      } else if (typeof v === 'object' && v !== null) {
        sanitized[k] = sanitizePayload(v);
      } else {
        sanitized[k] = v;
      }
    }
    return sanitized as T;
  }

  return value;
}

/**
 * Determine event category based on raw event type.
 */
export function categorizeEventType(eventType: string): EventCategory {
  switch (eventType) {
    case 'tool_call_started':
    case 'tool_call_completed':
    case 'tool_timeout':
    case 'tool_call_rejected':
      return 'tool';
    case 'policy_decision':
      return 'policy';
    case 'budget_initialized':
    case 'budget_updated':
    case 'budget_exceeded':
      return 'budget';
    case 'task_started':
    case 'task_completed':
    case 'task_failed':
    case 'task_cancelled':
    case 'stream_closed':
      return 'lifecycle';
    case 'sync_gap':
      return 'system';
    default:
      return 'custom';
  }
}

/**
 * Generate human-friendly summary text for an event.
 */
export function generateEventSummary(eventType: string, payload: Record<string, unknown>): string {
  const toolName = (payload.tool_name as string) || (payload.tool as string) || 'tool';
  const step = payload.step !== undefined ? ` (step ${payload.step})` : '';

  switch (eventType) {
    case 'task_started':
      return 'Governed execution started';
    case 'budget_initialized':
      return 'Execution budget allocated and initialized';
    case 'tool_call_started':
      return `Tool '${toolName}' started execution${step}`;
    case 'tool_call_completed': {
      const isSuccess = payload.status === 'success' || !payload.error;
      if (isSuccess) {
        return `Tool '${toolName}' completed successfully${step}`;
      }
      const err = (payload.error as string) || 'Execution failure';
      return `Tool '${toolName}' failed${step}: ${err}`;
    }
    case 'tool_timeout': {
      const timeoutSec = payload.timeout_seconds ?? payload.timeout ?? '--';
      return `Tool '${toolName}' timed out after ${timeoutSec}s${step}`;
    }
    case 'tool_call_rejected': {
      const reason = (payload.reason as string) || 'Rejected by engine';
      return `Tool '${toolName}' execution rejected${step}: ${reason}`;
    }
    case 'policy_decision': {
      const allowed = Boolean(payload.allowed);
      const rule = (payload.matched_rule as string) || 'default';
      const reason = (payload.reason as string) || '';
      return allowed
        ? `Policy ALLOWED '${toolName}'${step} [Rule: ${rule}]`
        : `Policy DENIED '${toolName}'${step} [Rule: ${rule}]: ${reason}`;
    }
    case 'budget_updated':
      return `Budget updated${step} after '${toolName}'`;
    case 'budget_exceeded': {
      const limit = (payload.limit as string) || 'limit';
      const reason = (payload.reason as string) || 'Budget limit reached';
      return `Budget exceeded [${limit}]: ${reason}`;
    }
    case 'task_completed': {
      const steps = payload.steps !== undefined ? ` in ${payload.steps} steps` : '';
      return `Task completed successfully${steps}`;
    }
    case 'task_failed': {
      const err = (payload.error as string) || (payload.error_type as string) || 'Execution failed';
      return `Task failed: ${err}`;
    }
    case 'task_cancelled':
      return 'Task execution was cancelled';
    case 'stream_closed': {
      const status = (payload.status as string) || 'terminal';
      return `SSE stream completed (Task status: ${status})`;
    }
    case 'sync_gap':
      return `Sequence gap detected in event stream`;
    default:
      if (typeof payload.summary === 'string') {
        return payload.summary;
      }
      return `Event: ${eventType}`;
  }
}

let clientEventCounter = 0;

/**
 * Normalize raw SSE message into a typed NormalizedEvent.
 */
export function normalizeSSEEvent(
  raw: RawSSEMessage,
  options?: { isReplayed?: boolean; fallbackSeq?: number }
): NormalizedEvent {
  const isReplayed = options?.isReplayed ?? false;
  let payload: Record<string, unknown> = {};
  let isMalformed = false;

  if (raw.data && raw.data.trim()) {
    try {
      const parsed = JSON.parse(raw.data);
      if (typeof parsed === 'object' && parsed !== null) {
        payload = sanitizePayload(parsed);
      } else {
        payload = { value: parsed };
      }
    } catch {
      isMalformed = true;
      payload = { raw: raw.data };
    }
  }

  const rawEventType = raw.event || (payload.type as string) || 'message';
  const category = categorizeEventType(rawEventType);

  // Extract sequence number from SSE id, payload, or fallback
  let seqNumber = 0;
  if (raw.id) {
    const parsedId = parseInt(raw.id, 10);
    if (!isNaN(parsedId)) {
      seqNumber = parsedId;
    }
  }
  if (!seqNumber && typeof payload.sequence_number === 'number') {
    seqNumber = payload.sequence_number;
  }
  if (!seqNumber && options?.fallbackSeq) {
    seqNumber = options.fallbackSeq;
  }
  if (!seqNumber) {
    clientEventCounter += 1;
    seqNumber = clientEventCounter;
  }

  // Extract timestamp
  let timestamp = new Date().toISOString();
  if (typeof payload.timestamp === 'string' && payload.timestamp) {
    timestamp = payload.timestamp;
  }

  // Extract identifiers
  const toolName = (payload.tool_name as string) || (payload.tool as string) || undefined;
  const toolCallId = (payload.call_id as string) || (payload.tool_call_id as string) || undefined;
  const taskId = (payload.task_id as string) || undefined;
  const step = typeof payload.step === 'number' ? payload.step : undefined;
  const durationSeconds =
    typeof payload.duration_seconds === 'number'
      ? payload.duration_seconds
      : typeof payload.duration === 'number'
      ? payload.duration
      : undefined;

  // Determine status
  let status: string | undefined = undefined;
  if (rawEventType === 'tool_call_started') {
    status = 'running';
  } else if (rawEventType === 'tool_call_completed') {
    status = payload.status === 'success' || !payload.error ? 'success' : 'failure';
  } else if (rawEventType === 'tool_timeout') {
    status = 'timeout';
  } else if (rawEventType === 'tool_call_rejected') {
    status = 'rejected';
  } else if (rawEventType === 'policy_decision') {
    status = payload.allowed ? 'allowed' : 'denied';
  } else if (typeof payload.status === 'string') {
    status = payload.status;
  }

  const summary = generateEventSummary(rawEventType, payload);
  const eventId = raw.id || (payload.event_id as string) || `ev-${seqNumber}-${Date.now()}`;

  return {
    id: `norm-${eventId}-${Math.random().toString(36).substring(2, 7)}`,
    eventId,
    sequenceNumber: seqNumber,
    timestamp,
    eventType: rawEventType,
    category,
    taskId,
    toolName,
    toolCallId,
    step,
    status,
    durationSeconds,
    summary,
    payload,
    isReplayed,
    isMalformed,
  };
}

/**
 * Pair tool calls with their corresponding executions, results, and policy decisions.
 */
export function correlateToolCalls(events: NormalizedEvent[]): ToolCallItem[] {
  const toolMap = new Map<string, ToolCallItem>();

  for (const event of events) {
    // Generate a reliable correlation key: toolCallId if present, else `${toolName}:${step}`
    const key =
      event.toolCallId ||
      (event.toolName && event.step !== undefined ? `${event.toolName}:${event.step}` : null);

    if (!key && event.category !== 'tool') {
      continue;
    }

    const effectiveKey = key || `unmatched-${event.id}`;

    if (event.eventType === 'tool_call_started') {
      const existing = toolMap.get(effectiveKey);
      toolMap.set(effectiveKey, {
        callId: event.toolCallId || effectiveKey,
        toolName: event.toolName || 'unknown_tool',
        step: event.step,
        status: 'running',
        startedAt: event.timestamp,
        durationSeconds: event.durationSeconds,
        arguments: (event.payload.arguments as Record<string, unknown>) || undefined,
        policyDecision: existing?.policyDecision,
      });
    } else if (event.eventType === 'tool_call_completed') {
      const item = toolMap.get(effectiveKey) || {
        callId: event.toolCallId || effectiveKey,
        toolName: event.toolName || 'unknown_tool',
        step: event.step,
        status: event.status === 'success' ? 'success' : 'failure',
      };

      item.status = event.status === 'success' ? 'success' : 'failure';
      item.completedAt = event.timestamp;
      item.durationSeconds = event.durationSeconds ?? item.durationSeconds;
      item.output = event.payload.output;
      item.error = (event.payload.error as string) || undefined;
      toolMap.set(effectiveKey, item);
    } else if (event.eventType === 'tool_timeout') {
      const item = toolMap.get(effectiveKey) || {
        callId: event.toolCallId || effectiveKey,
        toolName: event.toolName || 'unknown_tool',
        step: event.step,
        status: 'timeout',
      };
      item.status = 'timeout';
      item.completedAt = event.timestamp;
      item.error = `Timed out after ${event.payload.timeout_seconds ?? '--'}s`;
      toolMap.set(effectiveKey, item);
    } else if (event.eventType === 'tool_call_rejected') {
      const item = toolMap.get(effectiveKey) || {
        callId: event.toolCallId || effectiveKey,
        toolName: event.toolName || 'unknown_tool',
        step: event.step,
        status: 'rejected',
      };
      item.status = 'rejected';
      item.completedAt = event.timestamp;
      item.error = (event.payload.reason as string) || 'Tool call rejected by policy engine';
      toolMap.set(effectiveKey, item);
    } else if (event.eventType === 'policy_decision') {
      const item = toolMap.get(effectiveKey) || {
        callId: event.toolCallId || effectiveKey,
        toolName: event.toolName || 'unknown_tool',
        step: event.step,
        status: 'pending',
      };
      item.policyDecision = {
        allowed: Boolean(event.payload.allowed),
        reason: (event.payload.reason as string) || '',
        matchedRule: (event.payload.matched_rule as string) || undefined,
      };
      toolMap.set(effectiveKey, item);
    }
  }

  return Array.from(toolMap.values());
}
