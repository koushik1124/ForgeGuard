/**
 * ForgeGuard API Client Foundation
 * Handles typed HTTP requests, timeouts, auth headers, latency measurement, and normalized error responses.
 */

import {
  APIErrorResponse,
  ConnectionTestResult,
  EvaluationReportDetailResponse,
  EvaluationReportListResponse,
  EvaluationRunListResponse,
  EvaluationRunStateResponse,
  EvaluationRunSubmitRequest,
  HealthResponse,
  ReadinessResponse,
  ScenarioCatalogResponse,
  TaskCancelResponse,
  TaskDiagnosticsResponse,
  TaskListResponse,
  TaskResponse,
  TaskResultResponse,
  TaskResumeResponse,
  TaskSubmitRequest,
  WorkspaceDirectoryResponse,
  WorkspaceFilePreviewResponse,
  WorkspaceListResponse,
  WorkspaceRegisterRequest,
  WorkspaceResponse,
} from './types';

export interface ClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class APIClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly requestId?: string;
  public readonly details?: unknown;

  constructor(message: string, status: number, code: string = 'FG-CLIENT-ERR', requestId?: string, details?: unknown) {
    super(message);
    this.name = 'APIClientError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }
}

export class ForgeGuardApiClient {
  private baseUrl: string;
  private apiKey?: string;
  private timeoutMs: number;
  private lastLatencyMs: number | null = null;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey?.trim();
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  public updateConfig(config: Partial<ClientConfig>): void {
    if (config.baseUrl !== undefined) {
      this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    }
    if (config.apiKey !== undefined) {
      this.apiKey = config.apiKey.trim() || undefined;
    }
    if (config.timeoutMs !== undefined) {
      this.timeoutMs = config.timeoutMs;
    }
  }

  public getConfig(): { baseUrl: string; hasApiKey: boolean } {
    return {
      baseUrl: this.baseUrl,
      hasApiKey: Boolean(this.apiKey),
    };
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getApiKey(): string | undefined {
    return this.apiKey;
  }

  public setBaseUrl(url: string): void {
    this.updateConfig({ baseUrl: url });
  }

  public setApiKey(key?: string): void {
    this.updateConfig({ apiKey: key });
  }

  public getLastLatency(): number | null {
    return this.lastLatencyMs;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }
    return headers;
  }

  private async request<T>(path: string, options: RequestInit = {}, signal?: AbortSignal): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    
    // Setup timeout controller
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), this.timeoutMs);
    
    // Combine signals if external signal passed
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }

    const startTime = performance.now();

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.getHeaders(),
          ...(options.headers as Record<string, string> | undefined),
        },
      });

      this.lastLatencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        let errorBody: APIErrorResponse | null = null;
        try {
          errorBody = await response.json();
        } catch {
          // Response was not JSON
        }

        const code = errorBody?.error?.code ?? (response.status === 401 ? 'FG-AUTH-401' : response.status === 403 ? 'FG-AUTH-403' : `HTTP_${response.status}`);
        const message = errorBody?.error?.message ?? (response.status === 401 ? 'API key required or invalid' : response.status === 403 ? 'Access forbidden' : response.statusText || 'Unknown error');
        const requestId = errorBody?.error?.request_id;
        const details = errorBody?.error?.details;

        throw new APIClientError(message, response.status, code, requestId, details);
      }

      // Check if 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      this.lastLatencyMs = Math.round(performance.now() - startTime);

      if (err instanceof APIClientError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new APIClientError(
          `Request to ${path} timed out after ${this.timeoutMs}ms`,
          408,
          'FG-TIMEOUT-408'
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new APIClientError(`Network connection failure: ${message}`, 0, 'FG-NETWORK-ERR');
    } finally {
      clearTimeout(timerId);
    }
  }

  public async getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health', { method: 'GET' }, signal);
  }

  public async getReadiness(signal?: AbortSignal): Promise<ReadinessResponse> {
    return this.request<ReadinessResponse>('/health/ready', { method: 'GET' }, signal);
  }

  public async getTasks(
    params?: { status?: string; limit?: number; offset?: number },
    signal?: AbortSignal
  ): Promise<TaskListResponse> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    
    const queryString = query.toString();
    const path = queryString ? `/api/v1/tasks?${queryString}` : '/api/v1/tasks';
    return this.request<TaskListResponse>(path, { method: 'GET' }, signal);
  }

  public async submitTask(data: TaskSubmitRequest, signal?: AbortSignal): Promise<TaskResponse> {
    return this.request<TaskResponse>('/api/v1/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }, signal);
  }

  public async getTask(taskId: string, signal?: AbortSignal): Promise<TaskResponse> {
    return this.request<TaskResponse>(`/api/v1/tasks/${taskId}`, { method: 'GET' }, signal);
  }

  public async getTaskResult(taskId: string, signal?: AbortSignal): Promise<TaskResultResponse> {
    return this.request<TaskResultResponse>(`/api/v1/tasks/${taskId}/result`, { method: 'GET' }, signal);
  }

  public async cancelTask(taskId: string, signal?: AbortSignal): Promise<TaskCancelResponse> {
    return this.request<TaskCancelResponse>(`/api/v1/tasks/${taskId}/cancel`, { method: 'POST' }, signal);
  }

  public async resumeTask(taskId: string, signal?: AbortSignal): Promise<TaskResumeResponse> {
    return this.request<TaskResumeResponse>(`/api/v1/tasks/${taskId}/resume`, { method: 'POST' }, signal);
  }

  public async getTaskDiagnostics(taskId: string, signal?: AbortSignal): Promise<TaskDiagnosticsResponse> {
    return this.request<TaskDiagnosticsResponse>(`/api/v1/tasks/${taskId}/diagnostics`, { method: 'GET' }, signal);
  }

  public async getWorkspaces(signal?: AbortSignal): Promise<WorkspaceListResponse> {
    return this.request<WorkspaceListResponse>('/api/v1/workspaces', { method: 'GET' }, signal);
  }

  public async getWorkspace(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceResponse> {
    return this.request<WorkspaceResponse>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}`, { method: 'GET' }, signal);
  }

  public async registerWorkspace(data: WorkspaceRegisterRequest, signal?: AbortSignal): Promise<WorkspaceResponse> {
    return this.request<WorkspaceResponse>('/api/v1/workspaces', {
      method: 'POST',
      body: JSON.stringify(data),
    }, signal);
  }

  public async unregisterWorkspace(workspaceId: string, signal?: AbortSignal): Promise<void> {
    return this.request<void>(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}`, { method: 'DELETE' }, signal);
  }

  public async getWorkspaceFiles(
    workspaceId: string,
    subpath: string = '',
    signal?: AbortSignal
  ): Promise<WorkspaceDirectoryResponse> {
    const params = new URLSearchParams();
    if (subpath) {
      params.set('subpath', subpath);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<WorkspaceDirectoryResponse>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/files${query}`,
      { method: 'GET' },
      signal
    );
  }

  public async previewWorkspaceFile(
    workspaceId: string,
    filePath: string,
    maxBytes: number = 50000,
    signal?: AbortSignal
  ): Promise<WorkspaceFilePreviewResponse> {
    const params = new URLSearchParams({ path: filePath });
    if (maxBytes) {
      params.set('max_bytes', String(maxBytes));
    }
    return this.request<WorkspaceFilePreviewResponse>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/file?${params.toString()}`,
      { method: 'GET' },
      signal
    );
  }

  // ==========================================
  // Evaluation Center API
  // ==========================================

  public async getEvaluationScenarios(signal?: AbortSignal): Promise<ScenarioCatalogResponse> {
    return this.request<ScenarioCatalogResponse>('/api/v1/evaluations/scenarios', { method: 'GET' }, signal);
  }

  public async getEvaluationReports(signal?: AbortSignal): Promise<EvaluationReportListResponse> {
    return this.request<EvaluationReportListResponse>('/api/v1/evaluations/reports', { method: 'GET' }, signal);
  }

  public async getEvaluationReport(
    experimentId: string,
    signal?: AbortSignal
  ): Promise<EvaluationReportDetailResponse> {
    return this.request<EvaluationReportDetailResponse>(
      `/api/v1/evaluations/reports/${encodeURIComponent(experimentId)}`,
      { method: 'GET' },
      signal
    );
  }

  public async getEvaluationArtifact(
    experimentId: string,
    format: 'json' | 'markdown' | 'md' = 'json',
    signal?: AbortSignal
  ): Promise<string> {
    const url = `${this.baseUrl}/api/v1/evaluations/reports/${encodeURIComponent(experimentId)}/artifact?format=${encodeURIComponent(format)}`;
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), this.timeoutMs);
    if (signal) {
      signal.addEventListener('abort', () => controller.abort());
    }
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: this.apiKey ? { 'X-API-Key': this.apiKey } : {},
      });
      if (!response.ok) {
        throw new APIClientError(`Failed to download artifact: ${response.statusText}`, response.status, 'FG-ARTIFACT-FAIL');
      }
      return await response.text();
    } finally {
      clearTimeout(timerId);
    }
  }

  public async startEvaluationRun(
    req: EvaluationRunSubmitRequest,
    signal?: AbortSignal
  ): Promise<EvaluationRunStateResponse> {
    return this.request<EvaluationRunStateResponse>(
      '/api/v1/evaluations/runs',
      {
        method: 'POST',
        body: JSON.stringify(req),
      },
      signal
    );
  }

  public async getEvaluationRuns(signal?: AbortSignal): Promise<EvaluationRunListResponse> {
    return this.request<EvaluationRunListResponse>('/api/v1/evaluations/runs', { method: 'GET' }, signal);
  }

  public async getEvaluationRun(
    runId: string,
    signal?: AbortSignal
  ): Promise<EvaluationRunStateResponse> {
    return this.request<EvaluationRunStateResponse>(
      `/api/v1/evaluations/runs/${encodeURIComponent(runId)}`,
      { method: 'GET' },
      signal
    );
  }

  public getEvaluationRunEventsUrl(runId: string): string {
    return `${this.baseUrl}/api/v1/evaluations/runs/${encodeURIComponent(runId)}/events`;
  }

  /**
   * Test connection against ForgeGuard API.
   * Probes /health and /health/ready, measuring round-trip latency.
   */
  public async testConnection(signal?: AbortSignal): Promise<ConnectionTestResult> {
    const startTime = performance.now();
    const testedAt = new Date().toISOString();

    try {
      const health = await this.getHealth(signal);
      let readiness: ReadinessResponse | undefined = undefined;
      
      try {
        readiness = await this.getReadiness(signal);
      } catch {
        // If /health/ready is not available or degraded, we continue with health
      }

      const latencyMs = Math.round(performance.now() - startTime);
      const isDegraded = readiness && (!readiness.database || !readiness.engine || readiness.status === 'not_ready');

      return {
        success: true,
        state: isDegraded ? 'degraded' : 'connected',
        latencyMs,
        health,
        readiness,
        testedAt,
      };
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - startTime);
      const isClientError = err instanceof APIClientError;
      const message = isClientError ? err.message : 'Failed to connect to ForgeGuard runtime';

      return {
        success: false,
        state: 'error',
        latencyMs,
        errorMessage: message,
        error: message,
        errorCode: isClientError ? err.code : 'FG-CONN-FAIL',
        testedAt,
      };
    }
  }
}

// Global API client instance
export const apiClient = new ForgeGuardApiClient({
  baseUrl: 'http://127.0.0.1:8000',
});
