/**
 * TypeScript contracts mirroring ForgeGuard M8 REST API models.
 */

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
}

export interface ReadinessResponse {
  status: string;
  database: boolean;
  engine: boolean;
  timestamp: string;
}

export interface TaskResponse {
  task_id: string;
  description: string;
  status: 'created' | 'running' | 'completed' | 'failed' | 'cancelled' | string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  workspace_id?: string | null;
  step_count?: number | null;
  metadata?: Record<string, unknown>;
  iteration_count?: number | null;
  tool_call_count?: number | null;
  budget_summary?: Record<string, unknown> | null;
  cancellation_status?: string | null;
  recovery_status?: string | null;
  error_summary?: string | null;
}

export interface TaskListResponse {
  items: TaskResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface BudgetOverride {
  max_tool_calls?: number | null;
  max_execution_seconds?: number | null;
  max_output_bytes?: number | null;
  max_tool_duration_seconds?: number | null;
}

export interface TaskSubmitRequest {
  prompt: string;
  workspace_id?: string | null;
  execution_mode?: 'agent' | 'tool_calls' | string;
  tool_calls?: Array<{
    tool_name: string;
    arguments?: Record<string, unknown>;
    call_id?: string | null;
  }> | null;
  metadata?: Record<string, unknown>;
  budget?: BudgetOverride | null;
}

export interface TaskResultResponse {
  task_id: string;
  status: string;
  completed: boolean;
  final_response?: string | null;
  outputs?: Record<string, unknown>;
  error?: string | null;
  iterations?: number;
  tool_call_count?: number;
  duration_seconds?: number;
}

export interface TaskCancelResponse {
  task_id: string;
  status: string;
  cancelled: boolean;
  message: string;
}

export interface TaskResumeResponse {
  task_id: string;
  status: string;
  resumed: boolean;
  message: string;
  completed_calls: string[];
}

export interface TaskDiagnosticsResponse {
  task_id: string;
  trace_id?: string | null;
  timeline: Record<string, unknown>[];
  diagnostics: Record<string, unknown>[];
  budget_snapshot?: Record<string, unknown> | null;
  recovery_info?: {
    can_resume_safely?: boolean;
    completed_calls?: string[];
    uncertain_calls?: string[];
    warnings?: string[];
  } | null;
}

export interface WorkspaceResponse {
  workspace_id: string;
  name: string;
  root_path: string;
  created_at: string;
  description?: string;
}

export interface WorkspaceListResponse {
  workspaces: WorkspaceResponse[];
}

export interface WorkspaceRegisterRequest {
  name: string;
  root_path: string;
  workspace_id?: string;
  description?: string;
}

export interface WorkspaceFileEntry {
  name: string;
  relative_path: string;
  is_directory: boolean;
  size_bytes?: number | null;
  extension?: string;
}

export interface WorkspaceDirectoryResponse {
  workspace_id: string;
  subpath: string;
  total_entries: number;
  entries: WorkspaceFileEntry[];
}

export interface WorkspaceFilePreviewResponse {
  workspace_id: string;
  relative_path: string;
  name: string;
  size_bytes: number;
  read_bytes: number;
  is_truncated: boolean;
  is_binary: boolean;
  content: string | null;
  extension: string;
  mime_type: string;
}

export interface APIErrorDetail {
  code: string;
  message: string;
  request_id: string;
  task_id?: string | null;
  details?: unknown;
}

export interface APIErrorResponse {
  error: APIErrorDetail;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'testing' | 'connected' | 'degraded' | 'error';

export interface ConnectionTestResult {
  success: boolean;
  state: ConnectionState;
  latencyMs: number;
  health?: HealthResponse;
  readiness?: ReadinessResponse;
  errorMessage?: string;
  error?: string;
  errorCode?: string;
  testedAt: string;
}

/**
 * Task-derived lifecycle event for the Overview activity feed.
 */
export interface TaskDerivedActivity {
  id: string;
  taskId: string;
  taskDescription: string;
  type: 'created' | 'started' | 'completed' | 'failed' | 'cancelled';
  timestamp: string;
  status: string;
  errorSummary?: string | null;
}

// ==========================================
// M9.7.2 Evaluation Center Types
// ==========================================

export interface ScenarioCatalogItem {
  scenario_id: string;
  name: string;
  category: string;
  severity: string;
  description: string;
  tags: string[];
}

export interface ScenarioCatalogResponse {
  total_scenarios: number;
  suites: Record<string, ScenarioCatalogItem[]>;
  scenarios: ScenarioCatalogItem[];
}

export interface EvaluationReportSummary {
  experiment_id: string;
  name: string;
  timestamp: string;
  duration_ms: number;
  total_scenarios: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  overall_status: 'pass' | 'fail' | 'error' | 'skipped' | string;
  pass_rate_pct: number;
}

export interface EvaluationReportListResponse {
  total_reports: number;
  reports: EvaluationReportSummary[];
}

export interface EvaluationScenarioAssertion {
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
  evidence?: Record<string, unknown>;
}

export interface EvaluationScenarioResult {
  experiment_id: string;
  scenario_id: string;
  name: string;
  category: string;
  severity: string;
  status: 'pass' | 'fail' | 'error' | 'skipped' | string;
  start_time: string;
  end_time?: string | null;
  duration_ms: number;
  assertions: EvaluationScenarioAssertion[];
  assertions_passed?: number;
  assertions_failed?: number;
  failure_reason?: string | null;
  evidence?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>[];
  tags?: string[];
  metrics?: Record<string, unknown>;
}

export interface EvaluationBenchmarkResult {
  benchmark_id: string;
  name: string;
  workload_type: string;
  sample_count: number;
  mean_ms: number;
  median_ms: number;
  p95_ms: number;
  min_ms: number;
  max_ms: number;
  std_dev_ms: number;
  relative_overhead_pct?: number | null;
  baseline_name?: string | null;
}

export interface EvaluationReportDetailResponse {
  experiment_id: string;
  name: string;
  timestamp: string;
  duration_ms: number;
  total_scenarios: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  overall_status: 'pass' | 'fail' | 'error' | 'skipped' | string;
  scenario_results: EvaluationScenarioResult[];
  benchmarks: EvaluationBenchmarkResult[];
  summary_metrics: {
    pass_rate_pct?: number;
    total_assertions?: number;
    assertions_passed?: number;
    assertions_failed?: number;
    [key: string]: unknown;
  };
  environment_info: {
    platform?: string;
    python_version?: string;
    architecture?: string;
    [key: string]: unknown;
  };
}

export type EvaluationRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface EvaluationRunSubmitRequest {
  name?: string;
  suites?: string[];
  scenario_ids?: string[];
}

export interface EvaluationRunStateResponse {
  run_id: string;
  experiment_id: string;
  name: string;
  status: EvaluationRunStatus | string;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  selected_suites: string[];
  selected_scenario_ids: string[];
  total_scenarios: number;
  completed_scenarios: number;
  current_scenario_id?: string | null;
  current_scenario_name?: string | null;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  overall_status?: string | null;
  duration_ms: number;
  error_summary?: string | null;
  report_id?: string | null;
}

export interface EvaluationRunListResponse {
  total_runs: number;
  active_run_id?: string | null;
  runs: EvaluationRunStateResponse[];
}

