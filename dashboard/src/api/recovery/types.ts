export type RecoveryAssessmentState =
  | 'safe_to_resume'
  | 'blocked_uncertain'
  | 'blocked_terminal'
  | 'blocked_running'
  | 'blocked_budget'
  | 'blocked_other'
  | 'assessment_loading'
  | 'assessment_unavailable';

export interface RecoveryInfo {
  can_resume_safely?: boolean;
  completed_calls?: string[];
  uncertain_calls?: string[];
  warnings?: string[];
}

export type DiagnosticSeverityLevel = 'info' | 'warning' | 'error' | 'critical';

export interface DiagnosticItem {
  diagnostic_id: string;
  code: string;
  severity: DiagnosticSeverityLevel;
  category: string;
  message: string;
  suggested_action?: string | null;
  tool_call_id?: string | null;
  span_id?: string | null;
  details?: Record<string, unknown>;
  timestamp?: string;
}

export interface TimelineEntryItem {
  sequence_number: number;
  timestamp: string;
  event_type: string;
  category: string;
  status: string;
  summary: string;
  tool_call_id?: string | null;
  tool_name?: string | null;
  duration_ms?: number | null;
  metadata?: Record<string, unknown>;
}

export interface CheckpointForensics {
  reconstructed_position: number;
  completed_call_count: number;
  completed_calls: string[];
  uncertain_calls: string[];
  is_inferred: boolean;
  reconstruction_source: 'checkpoint' | 'tool_records' | 'none';
  warnings: string[];
  budget_snapshot?: Record<string, unknown> | null;
}
