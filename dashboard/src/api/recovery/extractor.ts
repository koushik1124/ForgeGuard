import { TaskDiagnosticsResponse, TaskResponse } from '../types';
import {
  CheckpointForensics,
  DiagnosticItem,
  DiagnosticSeverityLevel,
  RecoveryAssessmentState,
  RecoveryInfo,
  TimelineEntryItem,
} from './types';

export interface RecoveryAssessmentResult {
  state: RecoveryAssessmentState;
  isResumable: boolean;
  title: string;
  description: string;
  reasons: string[];
  uncertainCalls: string[];
}

/**
 * Evaluates recovery assessment strictly according to ForgeGuard safety invariants:
 * 1. An actively running task cannot be resumed (FG-STATE-409).
 * 2. A completed or cancelled terminal task cannot be resumed.
 * 3. A task with UNCERTAIN tool executions cannot be resumed (FG-RECOVERY-409).
 * 4. Safety is NEVER inferred from task status alone; it requires backend can_resume_safely === true.
 */
export function determineRecoveryAssessment(
  task?: TaskResponse | null,
  diagnostics?: TaskDiagnosticsResponse | null,
  isDiagnosticsLoading: boolean = false
): RecoveryAssessmentResult {
  if (isDiagnosticsLoading) {
    return {
      state: 'assessment_loading',
      isResumable: false,
      title: 'Evaluating Recovery Preconditions',
      description: 'Inspecting durable checkpoints, tool execution records, and side-effect safety...',
      reasons: [],
      uncertainCalls: [],
    };
  }

  if (!task) {
    return {
      state: 'assessment_unavailable',
      isResumable: false,
      title: 'Recovery Assessment Unavailable',
      description: 'Task state is not loaded.',
      reasons: [],
      uncertainCalls: [],
    };
  }

  // 1. Check if task is actively executing
  if (task.status === 'running' || task.status === 'created') {
    return {
      state: 'blocked_running',
      isResumable: false,
      title: 'Task is Actively Executing',
      description: `Task '${task.task_id}' is currently running. Resumption is blocked until execution halts.`,
      reasons: ['Task is currently in progress.'],
      uncertainCalls: [],
    };
  }

  // 2. Check if task is in terminal completed or cancelled state
  if (task.status === 'completed') {
    return {
      state: 'blocked_terminal',
      isResumable: false,
      title: 'Task Execution Complete',
      description: 'This task has reached terminal completion. Checkpoint state cannot be resumed.',
      reasons: ['Terminal status: completed'],
      uncertainCalls: [],
    };
  }

  if (task.status === 'cancelled') {
    return {
      state: 'blocked_terminal',
      isResumable: false,
      title: 'Task Execution Cancelled',
      description: 'This task was explicitly cancelled. Cancelled executions cannot be resumed.',
      reasons: ['Terminal status: cancelled'],
      uncertainCalls: [],
    };
  }

  const recoveryInfo: RecoveryInfo | null | undefined = diagnostics?.recovery_info;

  if (!recoveryInfo) {
    if (task.recovery_status === 'resumable') {
      return {
        state: 'safe_to_resume',
        isResumable: true,
        title: 'Safe to Resume',
        description:
          'Prior completed steps are preserved. Execution state can be safely resumed from the last checkpoint.',
        reasons: [],
        uncertainCalls: [],
      };
    }
    return {
      state: 'assessment_unavailable',
      isResumable: false,
      title: 'Recovery Assessment Pending',
      description: 'No recovery report is currently available for this task.',
      reasons: [],
      uncertainCalls: [],
    };
  }

  const uncertainCalls = recoveryInfo.uncertain_calls || [];
  const warnings = recoveryInfo.warnings || [];

  // 3. Check for uncertain tool executions (potential external side-effects)
  if (uncertainCalls.length > 0) {
    return {
      state: 'blocked_uncertain',
      isResumable: false,
      title: 'Resume Blocked: Uncertain Side-Effects',
      description:
        'A tool call was interrupted mid-execution. Potential side-effects prevent safe automatic re-execution.',
      reasons: [
        ...warnings,
        `Uncertain tool executions: ${uncertainCalls.join(', ')}`,
      ],
      uncertainCalls,
    };
  }

  // 4. Check if backend explicitly confirmed safe resumability
  if (recoveryInfo.can_resume_safely === true) {
    return {
      state: 'safe_to_resume',
      isResumable: true,
      title: 'Safe to Resume',
      description:
        'Prior completed steps are preserved. Execution state can be safely resumed from the last checkpoint.',
      reasons: warnings,
      uncertainCalls: [],
    };
  }

  // 5. Check if blocked by budget exhaustion
  const isBudgetExhausted = warnings.some(
    (w) => w.toLowerCase().includes('budget') || w.toLowerCase().includes('exhausted')
  );

  if (isBudgetExhausted) {
    return {
      state: 'blocked_budget',
      isResumable: false,
      title: 'Resume Blocked: Budget Exhausted',
      description: 'Resource budget limits (time or tool calls) are exhausted in the snapshot.',
      reasons: warnings,
      uncertainCalls: [],
    };
  }

  // 6. Generic blocked recovery
  return {
    state: 'blocked_other',
    isResumable: false,
    title: 'Resume Blocked by Policy / Engine',
    description: 'ForgeGuard recovery engine determined that this task cannot be safely resumed.',
    reasons: warnings.length > 0 ? warnings : ['Precondition evaluation failed.'],
    uncertainCalls: [],
  };
}

const SENSITIVE_KEYS = new Set([
  'api_key',
  'apikey',
  'key',
  'token',
  'secret',
  'password',
  'authorization',
  'auth',
  'credential',
]);

/**
 * Recursively sanitizes JSON payload details to prevent leaking secrets.
 */
export function sanitizeDetails(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;

  if (Array.isArray(val)) {
    return val.map(sanitizeDetails);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      sanitized[k] = '***REDACTED***';
    } else if (typeof v === 'object' && v !== null) {
      sanitized[k] = sanitizeDetails(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Extracts and normalizes structured failure diagnostics from API response.
 */
export function extractDiagnostics(rawDiagnostics: unknown[] | undefined | null): DiagnosticItem[] {
  if (!Array.isArray(rawDiagnostics)) return [];

  const validSeverities: Set<DiagnosticSeverityLevel> = new Set(['info', 'warning', 'error', 'critical']);

  const items: DiagnosticItem[] = [];

  for (let i = 0; i < rawDiagnostics.length; i++) {
    const raw = rawDiagnostics[i];
    if (typeof raw !== 'object' || raw === null) continue;

    const record = raw as Record<string, unknown>;
    const rawSeverity = String(record.severity || 'error').toLowerCase();
    const severity: DiagnosticSeverityLevel = validSeverities.has(rawSeverity as DiagnosticSeverityLevel)
      ? (rawSeverity as DiagnosticSeverityLevel)
      : 'error';

    items.push({
      diagnostic_id: String(record.diagnostic_id || `diag-${i}`),
      code: String(record.code || 'FG-UNKNOWN'),
      severity,
      category: String(record.category || 'execution'),
      message: String(record.message || 'Diagnostic anomaly recorded'),
      suggested_action: record.suggested_action ? String(record.suggested_action) : null,
      tool_call_id: record.tool_call_id ? String(record.tool_call_id) : null,
      span_id: record.span_id ? String(record.span_id) : null,
      details: record.details && typeof record.details === 'object'
        ? (sanitizeDetails(record.details) as Record<string, unknown>)
        : undefined,
      timestamp: record.timestamp ? String(record.timestamp) : undefined,
    });
  }

  // Sort by severity priority: critical > error > warning > info
  const severityOrder: Record<DiagnosticSeverityLevel, number> = {
    critical: 0,
    error: 1,
    warning: 2,
    info: 3,
  };

  items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return items;
}

/**
 * Extracts and deterministically sorts chronological timeline entries from diagnostics API.
 */
export function extractRecoveryTimeline(rawTimeline: unknown[] | undefined | null): TimelineEntryItem[] {
  if (!Array.isArray(rawTimeline)) return [];

  const entries: TimelineEntryItem[] = [];

  for (let i = 0; i < rawTimeline.length; i++) {
    const raw = rawTimeline[i];
    if (typeof raw !== 'object' || raw === null) continue;

    const record = raw as Record<string, unknown>;
    const seq = typeof record.sequence_number === 'number' ? record.sequence_number : i + 1;

    entries.push({
      sequence_number: seq,
      timestamp: String(record.timestamp || new Date().toISOString()),
      event_type: String(record.event_type || 'unknown_event'),
      category: String(record.category || 'execution'),
      status: String(record.status || 'success'),
      summary: String(record.summary || record.event_type || 'Timeline event'),
      tool_call_id: record.tool_call_id ? String(record.tool_call_id) : null,
      tool_name: record.tool_name ? String(record.tool_name) : null,
      duration_ms: typeof record.duration_ms === 'number' ? record.duration_ms : null,
      metadata: record.metadata && typeof record.metadata === 'object'
        ? (sanitizeDetails(record.metadata) as Record<string, unknown>)
        : undefined,
    });
  }

  entries.sort((a, b) => a.sequence_number - b.sequence_number);
  return entries;
}

/**
 * Derives checkpoint forensics truthfully:
 * If budget_snapshot is present, state was persisted with a SQLite checkpoint.
 * If only completed_calls exist without snapshot, state is reconstructed from tool execution records.
 */
export function extractCheckpointForensics(
  diagnostics?: TaskDiagnosticsResponse | null,
  taskStatus?: string | null
): CheckpointForensics {
  const recoveryInfo = diagnostics?.recovery_info;
  const budgetSnapshot =
    diagnostics?.budget_snapshot ||
    ((recoveryInfo as unknown as Record<string, unknown>)?.budget_snapshot as Record<string, unknown> | undefined);

  let completedCalls = [...(recoveryInfo?.completed_calls || [])];
  const uncertainCalls = recoveryInfo?.uncertain_calls || [];
  let warnings = [...(recoveryInfo?.warnings || [])];

  // If completed_calls is empty, inspect timeline for completed tool calls
  if (completedCalls.length === 0 && diagnostics?.timeline && Array.isArray(diagnostics.timeline)) {
    const timelineCompleted = diagnostics.timeline
      .filter((t: any) => t.event_type === 'tool_call_completed' || (t.category === 'tool' && t.status === 'success'))
      .map((t: any) => t.tool_call_id || t.tool_name)
      .filter((id: any): id is string => Boolean(id));
    if (timelineCompleted.length > 0) {
      completedCalls = timelineCompleted;
    }
  }

  // Filter out misleading "was running when execution stopped; marked as interrupted" if task ended cleanly in 'completed'
  if (taskStatus === 'completed') {
    warnings = warnings.filter(
      (w) =>
        !w.toLowerCase().includes('marked as interrupted') &&
        !w.toLowerCase().includes('was running when execution stopped')
    );
  }

  const completedCount = completedCalls.length;
  const reconstructedPosition = completedCount;

  let source: 'checkpoint' | 'tool_records' | 'none' = 'none';
  let isInferred = false;

  if (budgetSnapshot && Object.keys(budgetSnapshot).length > 0) {
    source = 'checkpoint';
    isInferred = false;
  } else if (completedCount > 0 || uncertainCalls.length > 0) {
    source = 'tool_records';
    isInferred = true;
  }

  return {
    reconstructed_position: reconstructedPosition,
    completed_call_count: completedCount,
    completed_calls: completedCalls,
    uncertain_calls: uncertainCalls,
    is_inferred: isInferred,
    reconstruction_source: source,
    warnings,
    budget_snapshot: budgetSnapshot,
  };
}
