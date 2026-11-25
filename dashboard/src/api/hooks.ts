/**
 * TanStack Query hooks for ForgeGuard API integration.
 * Provides resilient polling, cached state preservation, and coordinated refresh.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiClient, APIClientError } from './client';
import {
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
import { useConnectionStore } from '../stores/connectionStore';

export const queryKeys = {
  health: ['health'] as const,
  readiness: ['readiness'] as const,
  tasks: (params?: { status?: string; limit?: number; offset?: number }) => ['tasks', params] as const,
  task: (taskId: string) => ['task', taskId] as const,
  taskResult: (taskId: string) => ['taskResult', taskId] as const,
  taskDiagnostics: (taskId: string) => ['taskDiagnostics', taskId] as const,
  workspaces: ['workspaces'] as const,
  workspace: (workspaceId: string) => ['workspace', workspaceId] as const,
  workspaceFiles: (workspaceId: string, subpath?: string) => ['workspaceFiles', workspaceId, subpath || ''] as const,
  workspaceFile: (workspaceId: string, path: string) => ['workspaceFile', workspaceId, path] as const,
  evaluationScenarios: ['evaluationScenarios'] as const,
  evaluationReports: ['evaluationReports'] as const,
  evaluationReport: (experimentId: string) => ['evaluationReport', experimentId] as const,
  evaluationArtifact: (experimentId: string, format: string) => ['evaluationArtifact', experimentId, format] as const,
  evaluationRuns: ['evaluationRuns'] as const,
  evaluationRun: (runId: string) => ['evaluationRun', runId] as const,
};

const shouldRetry = (failureCount: number, error: Error): boolean => {
  if (error instanceof APIClientError) {
    // Do not retry 4xx or 5xx HTTP responses returned by the API
    if (error.status > 0) {
      return false;
    }
  }
  return failureCount < 1; // At most 1 retry for pure network dropouts
};

export function useHealth(enabled: boolean = true) {
  const { updateSyncStatus } = useConnectionStore();

  return useQuery<HealthResponse, Error>({
    queryKey: queryKeys.health,
    queryFn: async ({ signal }) => {
      try {
        const data = await apiClient.getHealth(signal);
        const latency = apiClient.getLastLatency();
        updateSyncStatus('connected', latency);
        return data;
      } catch (err) {
        updateSyncStatus(err instanceof APIClientError ? 'error' : 'disconnected', null);
        throw err;
      }
    },
    enabled,
    retry: shouldRetry,
    staleTime: 15000,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
  });
}

export function useReadiness(enabled: boolean = true) {
  const { updateSyncStatus } = useConnectionStore();

  return useQuery<ReadinessResponse, Error>({
    queryKey: queryKeys.readiness,
    queryFn: async ({ signal }) => {
      try {
        const data = await apiClient.getReadiness(signal);
        const latency = apiClient.getLastLatency();
        const state = data.status === 'ready' && data.database && data.engine ? 'connected' : 'degraded';
        updateSyncStatus(state, latency);
        return data;
      } catch (err) {
        updateSyncStatus(err instanceof APIClientError ? 'error' : 'disconnected', null);
        throw err;
      }
    },
    enabled,
    retry: shouldRetry,
    staleTime: 15000,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
  });
}

export function useTasks(
  params?: { status?: string; limit?: number; offset?: number },
  enabled: boolean = true
) {
  return useQuery<TaskListResponse, Error>({
    queryKey: queryKeys.tasks(params),
    queryFn: ({ signal }) => apiClient.getTasks(params, signal),
    enabled,
    retry: shouldRetry,
    staleTime: 10000,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
  });
}

export function useTask(taskId: string, enabled: boolean = true) {
  return useQuery<TaskResponse, Error>({
    queryKey: queryKeys.task(taskId),
    queryFn: ({ signal }) => apiClient.getTask(taskId, signal),
    enabled: enabled && Boolean(taskId),
    retry: (failureCount, error) => {
      if (error instanceof APIClientError && error.status === 404) {
        return false; // Do not retry 404 Not Found
      }
      return shouldRetry(failureCount, error);
    },
    staleTime: 5000,
    refetchInterval: (query) => {
      const task = query.state.data;
      if (!task) return false;
      // Auto-poll active tasks every 3 seconds
      if (task.status === 'running' || task.status === 'created') {
        return 3000;
      }
      return false;
    },
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
  });
}

export function useTaskResult(taskId: string, enabled: boolean = true) {
  return useQuery<TaskResultResponse, Error>({
    queryKey: queryKeys.taskResult(taskId),
    queryFn: ({ signal }) => apiClient.getTaskResult(taskId, signal),
    enabled: enabled && Boolean(taskId),
    retry: (failureCount, error) => {
      // Do not retry 400 FG-TASK-NOT-READY or 404
      if (error instanceof APIClientError && (error.status === 400 || error.status === 404)) {
        return false;
      }
      return shouldRetry(failureCount, error);
    },
    staleTime: 30000,
    placeholderData: (previousData) => previousData,
  });
}

export function useTaskDiagnostics(taskId: string, enabled: boolean = true) {
  return useQuery<TaskDiagnosticsResponse, Error>({
    queryKey: queryKeys.taskDiagnostics(taskId),
    queryFn: ({ signal }) => apiClient.getTaskDiagnostics(taskId, signal),
    enabled: enabled && Boolean(taskId),
    retry: (failureCount, error) => {
      if (error instanceof APIClientError && error.status === 404) {
        return false;
      }
      return shouldRetry(failureCount, error);
    },
    staleTime: 15000,
    placeholderData: (previousData) => previousData,
  });
}

export function useCancelTask() {
  const queryClient = useQueryClient();

  return useMutation<TaskCancelResponse, Error, string>({
    mutationFn: (taskId: string) => apiClient.cancelTask(taskId),
    onSuccess: (_data, taskId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.taskResult(taskId) });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.readiness });
    },
  });
}

export function useSubmitTask() {
  const queryClient = useQueryClient();

  return useMutation<TaskResponse, Error, TaskSubmitRequest>({
    mutationFn: (data: TaskSubmitRequest) => apiClient.submitTask(data),
    onSuccess: (newTask) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.task(newTask.task_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.readiness });
    },
  });
}

export function useResumeTask() {
  const queryClient = useQueryClient();

  return useMutation<TaskResumeResponse, Error, string>({
    mutationFn: (taskId: string) => apiClient.resumeTask(taskId),
    onSuccess: (_data, taskId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.taskResult(taskId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.taskDiagnostics(taskId) });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useWorkspaces(enabled: boolean = true) {
  return useQuery<WorkspaceListResponse, Error>({
    queryKey: queryKeys.workspaces,
    queryFn: ({ signal }) => apiClient.getWorkspaces(signal),
    enabled,
    retry: shouldRetry,
    staleTime: 30000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    placeholderData: (previousData) => previousData,
  });
}

export function useWorkspace(workspaceId: string, enabled: boolean = true) {
  return useQuery<WorkspaceResponse, Error>({
    queryKey: queryKeys.workspace(workspaceId),
    queryFn: ({ signal }) => apiClient.getWorkspace(workspaceId, signal),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
    staleTime: 30000,
  });
}

export function useWorkspaceFiles(workspaceId: string, subpath: string = '', enabled: boolean = true) {
  return useQuery<WorkspaceDirectoryResponse, Error>({
    queryKey: queryKeys.workspaceFiles(workspaceId, subpath),
    queryFn: ({ signal }) => apiClient.getWorkspaceFiles(workspaceId, subpath, signal),
    enabled: Boolean(workspaceId) && enabled,
    retry: shouldRetry,
    staleTime: 10000,
  });
}

export function useWorkspaceFilePreview(
  workspaceId: string,
  path: string,
  maxBytes: number = 50000,
  enabled: boolean = true
) {
  return useQuery<WorkspaceFilePreviewResponse, Error>({
    queryKey: queryKeys.workspaceFile(workspaceId, path),
    queryFn: ({ signal }) => apiClient.previewWorkspaceFile(workspaceId, path, maxBytes, signal),
    enabled: Boolean(workspaceId) && Boolean(path) && enabled,
    retry: shouldRetry,
    staleTime: 30000,
  });
}

export function useRegisterWorkspace() {
  const queryClient = useQueryClient();

  return useMutation<WorkspaceResponse, Error, WorkspaceRegisterRequest>({
    mutationFn: (data: WorkspaceRegisterRequest) => apiClient.registerWorkspace(data),
    onSuccess: (newWorkspace) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
      queryClient.setQueryData(queryKeys.workspace(newWorkspace.workspace_id), newWorkspace);
    },
  });
}

export function useUnregisterWorkspace() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (workspaceId: string) => apiClient.unregisterWorkspace(workspaceId),
    onSuccess: (_, workspaceId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
      queryClient.removeQueries({ queryKey: queryKeys.workspace(workspaceId) });
      queryClient.removeQueries({ queryKey: ['workspaceFiles', workspaceId] });
      queryClient.removeQueries({ queryKey: ['workspaceFile', workspaceId] });
    },
  });
}

/**
 * Coordinated Overview Hook
 * Refreshes health, readiness, and tasks synchronously and computes coherent runtime state.
 */
export function useOverviewData(taskLimit: number = 50) {
  const queryClient = useQueryClient();
  const healthQuery = useHealth();
  const readinessQuery = useReadiness();
  const tasksQuery = useTasks({ limit: taskLimit });

  const isRefreshing =
    healthQuery.isFetching || readinessQuery.isFetching || tasksQuery.isFetching;

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      queryClient.invalidateQueries({ queryKey: queryKeys.readiness }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks({ limit: taskLimit }) }),
    ]);
  }, [queryClient, taskLimit]);

  return {
    healthQuery,
    readinessQuery,
    tasksQuery,
    isRefreshing,
    refreshAll,
  };
}

// ==========================================
// M9.7.2 Evaluation Center Hooks
// ==========================================

export function useEvaluationScenarios(enabled: boolean = true) {
  return useQuery<ScenarioCatalogResponse, Error>({
    queryKey: queryKeys.evaluationScenarios,
    queryFn: ({ signal }) => apiClient.getEvaluationScenarios(signal),
    enabled,
    retry: shouldRetry,
    staleTime: 60000,
  });
}

export function useEvaluationReports(enabled: boolean = true) {
  return useQuery<EvaluationReportListResponse, Error>({
    queryKey: queryKeys.evaluationReports,
    queryFn: ({ signal }) => apiClient.getEvaluationReports(signal),
    enabled,
    retry: shouldRetry,
    staleTime: 10000,
    refetchInterval: 15000,
  });
}

export function useEvaluationReport(experimentId?: string, enabled: boolean = true) {
  return useQuery<EvaluationReportDetailResponse, Error>({
    queryKey: queryKeys.evaluationReport(experimentId || ''),
    queryFn: ({ signal }) => {
      if (!experimentId) {
        throw new Error('Experiment ID is required');
      }
      return apiClient.getEvaluationReport(experimentId, signal);
    },
    enabled: enabled && !!experimentId,
    retry: shouldRetry,
    staleTime: 30000,
  });
}

export function useEvaluationArtifact(
  experimentId?: string,
  format: 'json' | 'markdown' = 'json',
  enabled: boolean = false
) {
  return useQuery<string, Error>({
    queryKey: queryKeys.evaluationArtifact(experimentId || '', format),
    queryFn: ({ signal }) => {
      if (!experimentId) {
        throw new Error('Experiment ID is required');
      }
      return apiClient.getEvaluationArtifact(experimentId, format, signal);
    },
    enabled: enabled && !!experimentId,
    retry: shouldRetry,
    staleTime: 60000,
  });
}

export function useStartEvaluationRun() {
  const queryClient = useQueryClient();
  return useMutation<EvaluationRunStateResponse, Error, EvaluationRunSubmitRequest>({
    mutationFn: (req: EvaluationRunSubmitRequest) => apiClient.startEvaluationRun(req),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.evaluationRuns });
      queryClient.setQueryData(queryKeys.evaluationRun(data.run_id), data);
    },
  });
}

export function useEvaluationRuns(enabled: boolean = true) {
  return useQuery<EvaluationRunListResponse, Error>({
    queryKey: queryKeys.evaluationRuns,
    queryFn: ({ signal }) => apiClient.getEvaluationRuns(signal),
    enabled,
    retry: shouldRetry,
    staleTime: 2000,
    refetchInterval: (query) => {
      const activeId = query.state.data?.active_run_id;
      return activeId ? 1500 : 8000;
    },
  });
}

export function useEvaluationRun(runId?: string, enabled: boolean = true) {
  return useQuery<EvaluationRunStateResponse, Error>({
    queryKey: queryKeys.evaluationRun(runId || ''),
    queryFn: ({ signal }) => {
      if (!runId) {
        throw new Error('Run ID is required');
      }
      return apiClient.getEvaluationRun(runId, signal);
    },
    enabled: enabled && !!runId,
    retry: shouldRetry,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'queued' || status === 'running') {
        return 1000;
      }
      return false;
    },
  });
}

