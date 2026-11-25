import React, { useState } from 'react';
import {
  Box,
  Button,
  Grid,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  Alert,
} from '@mui/material';
import {
  ArrowLeft,
  RotateCw,
  Copy,
  Check,
  XCircle,
  Play,
  AlertCircle,
  Terminal,
  FileText,
  Layers,
  Activity,
} from 'lucide-react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { StatusBadge } from '../components/common/StatusBadge';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { useTask, useTaskResult, useTaskDiagnostics, useCancelTask, useResumeTask } from '../api/hooks';
import { APIClientError } from '../api/client';
import { LiveExecutionInspector } from '../components/inspector/LiveExecutionInspector';
import { GovernanceInspector } from '../components/governance/GovernanceInspector';
import { RecoveryAssessmentBanner } from '../components/recovery/RecoveryAssessmentBanner';
import { RecoveryInspector } from '../components/recovery/RecoveryInspector';
import { determineRecoveryAssessment } from '../api/recovery/extractor';
import { useTaskEvents } from '../api/sse/useTaskEvents';
import { useConnectionStore } from '../stores/connectionStore';
import { useUIStore } from '../stores/uiStore';
import { tokens } from '../theme/tokens';

function formatDuration(startedAt?: string | null, finishedAt?: string | null, status?: string): string {
  if (startedAt && finishedAt) {
    const start = new Date(startedAt).getTime();
    const end = new Date(finishedAt).getTime();
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      const diffMs = end - start;
      if (diffMs < 1000) return `${diffMs}ms`;
      const diffSecs = (diffMs / 1000).toFixed(2);
      if (Number(diffSecs) < 60) return `${diffSecs}s`;
      const mins = Math.floor(diffMs / 60000);
      const remainingSecs = Math.floor((diffMs % 60000) / 1000);
      return `${mins}m ${remainingSecs}s`;
    }
  }
  if (startedAt && status === 'running') {
    const start = new Date(startedAt).getTime();
    if (!isNaN(start)) {
      const elapsedSecs = Math.max(0, Math.floor((Date.now() - start) / 1000));
      return `${elapsedSecs}s (running)`;
    }
  }
  if (status === 'created') {
    return 'Pending';
  }
  return '--';
}

function formatFullTimestamp(isoString?: string | null): string {
  if (!isoString) return '--';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const TaskDetailPage: React.FC = () => {
  const { taskId = '' } = useParams<{ taskId: string }>();
  const { showToast } = useUIStore();
  const { connectionState } = useConnectionStore();
  const isDisconnected = connectionState === 'disconnected' || connectionState === 'error';

  // Modal dialog states
  const [cancelDialogOpen, setCancelDialogOpen] = useState<boolean>(false);
  const [resumeDialogOpen, setResumeDialogOpen] = useState<boolean>(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Queries
  const taskQuery = useTask(taskId);
  const { data: task, isLoading: isTaskLoading, isError: isTaskError, error: taskError, refetch: refetchTask, isFetching: isTaskFetching } = taskQuery;

  const isTerminal = task?.status === 'completed' || task?.status === 'failed' || task?.status === 'cancelled';

  // Coordinated live execution & governance stream (M9.4 / M9.5)
  const taskEvents = useTaskEvents(taskId, {
    enabled: Boolean(taskId && task),
    isTaskTerminal: isTerminal,
  });

  const resultQuery = useTaskResult(taskId, Boolean(task && isTerminal));
  const { data: result, isLoading: isResultLoading, refetch: refetchResult } = resultQuery;

  const diagnosticsQuery = useTaskDiagnostics(taskId, Boolean(task));
  const { data: diagnostics, refetch: refetchDiag } = diagnosticsQuery;

  // Mutations
  const cancelMutation = useCancelTask();
  const resumeMutation = useResumeTask();

  // Copy helper
  const handleCopy = async (text: string, label: string, sectionKey: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedSection(sectionKey);
        setTimeout(() => setCopiedSection(null), 2000);
        showToast(`${label} copied to clipboard`, 'success');
      } else {
        showToast('Clipboard access unavailable', 'warning');
      }
    } catch {
      showToast(`Failed to copy ${label}`, 'error');
    }
  };

  // Coordinated manual refresh
  const handleRefresh = async () => {
    taskEvents.reconnect();
    await Promise.allSettled([
      refetchTask(),
      isTerminal ? refetchResult() : Promise.resolve(),
      refetchDiag(),
    ]);
  };

  // Execution cancel action
  const handleConfirmCancel = async () => {
    setCancelDialogOpen(false);
    try {
      const res = await cancelMutation.mutateAsync(taskId);
      if (res.cancelled) {
        showToast(`Task ${taskId} cancelled successfully`, 'success');
      } else {
        showToast(res.message || 'Task could not be cancelled', 'warning');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Cancellation failed: ${message}`, 'error');
    }
  };

  // Execution resume action
  const handleConfirmResume = async () => {
    setResumeDialogOpen(false);
    try {
      const res = await resumeMutation.mutateAsync(taskId);
      if (res.resumed) {
        showToast(`Task ${taskId} resumed from checkpoint`, 'success');
      } else {
        showToast(res.message || 'Task could not be resumed', 'warning');
      }
    } catch (err: unknown) {
      if (err instanceof APIClientError && err.status === 409) {
        showToast(`Resume blocked: ${err.message}`, 'error');
      } else {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Resume failed: ${message}`, 'error');
      }
    }
  };

  // 1. Loading State
  if (isTaskLoading) {
    return (
      <Box>
        <PageHeader
          title={`Task: ${taskId}`}
          description="Retrieving execution state and runtime details..."
          actions={
            <Button
              component={RouterLink}
              to="/tasks"
              variant="outlined"
              size="small"
              startIcon={<ArrowLeft size={16} />}
              sx={{ color: tokens.colors.text.primary, borderColor: tokens.colors.border }}
            >
              Back to Tasks
            </Button>
          }
        />
        <Box sx={{ p: 2 }}>
          <LoadingSkeleton variant="card" />
          <Box sx={{ mt: 3 }}>
            <LoadingSkeleton variant="table" rows={4} />
          </Box>
        </Box>
      </Box>
    );
  }

  // 2. Not Found (404) or Invalid Task State
  if (isTaskError) {
    const is404 = taskError instanceof APIClientError && taskError.status === 404;

    if (is404) {
      return (
        <Box>
          <PageHeader
            title="Task Not Found"
            description={`No execution record exists with ID: ${taskId}`}
            actions={
              <Button
                component={RouterLink}
                to="/tasks"
                variant="outlined"
                size="small"
                startIcon={<ArrowLeft size={16} />}
                sx={{ color: tokens.colors.text.primary, borderColor: tokens.colors.border }}
              >
                Back to Tasks
              </Button>
            }
          />
          <Panel sx={{ p: 4 }}>
            <EmptyState
              title={`Task "${taskId}" Not Found`}
              description="The requested task ID does not exist in the ForgeGuard runtime repository or was purged."
              icon={<AlertCircle size={36} color={tokens.colors.warning} />}
              action={
                <Button
                  component={RouterLink}
                  to="/tasks"
                  variant="contained"
                  size="small"
                  sx={{ textTransform: 'none' }}
                >
                  Return to Task Explorer
                </Button>
              }
            />
          </Panel>
        </Box>
      );
    }

    return (
      <Box>
        <PageHeader
          title={`Task: ${taskId}`}
          description="Error loading execution details"
          actions={
            <Button
              component={RouterLink}
              to="/tasks"
              variant="outlined"
              size="small"
              startIcon={<ArrowLeft size={16} />}
              sx={{ color: tokens.colors.text.primary, borderColor: tokens.colors.border }}
            >
              Back to Tasks
            </Button>
          }
        />
        <ErrorState
          title="Failed to retrieve task detail"
          message={taskError?.message || 'Connection to ForgeGuard runtime failed.'}
          onRetry={handleRefresh}
        />
      </Box>
    );
  }

  if (!task) {
    return null;
  }

  // Action Permissions
  const canCancel = task.status === 'created' || task.status === 'running';
  const recoveryAssessment = determineRecoveryAssessment(task, diagnostics, diagnosticsQuery.isLoading);
  const canResume = recoveryAssessment.isResumable && !isDisconnected;

  const workspaceDisplay =
    (task.metadata?.workspace_name as string | undefined) ||
    task.workspace_id ||
    (task.metadata?.workspace_id as string | undefined) ||
    'default';

  return (
    <Box>
      {/* Top Header with Back Navigation and Actions */}
      <PageHeader
        title={`Task: ${task.task_id}`}
        description={task.description}
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              component={RouterLink}
              to="/tasks"
              variant="outlined"
              size="small"
              startIcon={<ArrowLeft size={14} />}
              sx={{
                color: tokens.colors.text.primary,
                borderColor: tokens.colors.border,
                fontSize: '0.8125rem',
                textTransform: 'none',
              }}
            >
              Back
            </Button>

            <Tooltip title="Copy Task ID" arrow>
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleCopy(task.task_id, 'Task ID', 'taskId')}
                startIcon={copiedSection === 'taskId' ? <Check size={14} /> : <Copy size={14} />}
                sx={{
                  color: tokens.colors.text.primary,
                  borderColor: tokens.colors.border,
                  fontSize: '0.8125rem',
                  textTransform: 'none',
                }}
              >
                {copiedSection === 'taskId' ? 'Copied' : 'Copy ID'}
              </Button>
            </Tooltip>

            {/* Cancel Action Button */}
            {canCancel && (
              <Button
                variant="outlined"
                size="small"
                color="error"
                onClick={() => setCancelDialogOpen(true)}
                disabled={cancelMutation.isPending}
                startIcon={<XCircle size={14} />}
                sx={{
                  fontSize: '0.8125rem',
                  textTransform: 'none',
                  borderColor: 'rgba(241, 108, 120, 0.4)',
                  color: tokens.colors.error,
                  '&:hover': {
                    borderColor: tokens.colors.error,
                    backgroundColor: tokens.colors.errorSubtle,
                  },
                }}
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Task'}
              </Button>
            )}

            {/* Resume Action Button */}
            {canResume && (
              <Button
                variant="contained"
                size="small"
                onClick={() => setResumeDialogOpen(true)}
                disabled={resumeMutation.isPending}
                startIcon={<Play size={14} />}
                sx={{
                  fontSize: '0.8125rem',
                  textTransform: 'none',
                  backgroundColor: tokens.colors.accentPrimary,
                  color: '#FFFFFF',
                  '&:hover': {
                    backgroundColor: tokens.colors.primaryHover,
                  },
                }}
              >
                {resumeMutation.isPending ? 'Resuming...' : 'Resume Task'}
              </Button>
            )}

            {/* Coordinated Refresh */}
            <IconButton
              size="small"
              onClick={handleRefresh}
              disabled={isTaskFetching}
              sx={{
                border: `1px solid ${tokens.colors.border}`,
                borderRadius: '6px',
                color: tokens.colors.text.primary,
                p: 0.75,
              }}
            >
              <RotateCw
                size={14}
                style={{
                  animation: isTaskFetching ? 'spin 1s linear infinite' : undefined,
                }}
              />
            </IconButton>
          </Stack>
        }
      />

      {/* Disconnected Warning */}
      {isDisconnected && (
        <Alert
          severity="warning"
          icon={<AlertCircle size={18} />}
          sx={{
            mb: 3,
            backgroundColor: tokens.colors.warningSubtle,
            border: `1px solid rgba(240, 180, 90, 0.3)`,
            color: tokens.colors.text.primary,
          }}
        >
          Backend connection offline. Viewing cached execution state.
        </Alert>
      )}

      {/* Recovery Assessment Banner (M9.6) */}
      <Box sx={{ mb: 3 }}>
        <RecoveryAssessmentBanner
          task={task}
          diagnostics={diagnostics}
          isDiagnosticsLoading={diagnosticsQuery.isLoading}
          onResumeClick={() => setResumeDialogOpen(true)}
          isResumePending={resumeMutation.isPending}
        />
      </Box>

      <Stack spacing={3}>
        {/* Section 1: Execution Overview & Metadata */}
        <Panel sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Layers size={18} color={tokens.colors.accentPrimary} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: tokens.colors.text.primary }}>
                Execution Overview
              </Typography>
            </Box>
            <StatusBadge status={task.status} size="medium" />
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600, textTransform: 'uppercase' }}>
                Task ID
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.accentPrimary, mt: 0.5 }}>
                {task.task_id}
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600, textTransform: 'uppercase' }}>
                Workspace
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.primary, mt: 0.5 }}>
                {workspaceDisplay}
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600, textTransform: 'uppercase' }}>
                Duration
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.primary, mt: 0.5 }}>
                {formatDuration(task.started_at, task.finished_at, task.status)}
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600, textTransform: 'uppercase' }}>
                Iterations / Tools
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.primary, mt: 0.5 }}>
                {task.iteration_count ?? 0} iters / {task.tool_call_count ?? 0} calls
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600, textTransform: 'uppercase' }}>
                Created At
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.secondary, mt: 0.5 }}>
                {formatFullTimestamp(task.created_at)}
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600, textTransform: 'uppercase' }}>
                Started At
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.secondary, mt: 0.5 }}>
                {formatFullTimestamp(task.started_at)}
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600, textTransform: 'uppercase' }}>
                Finished At
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.secondary, mt: 0.5 }}>
                {formatFullTimestamp(task.finished_at)}
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600, textTransform: 'uppercase' }}>
                Recovery Status
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.secondary, mt: 0.5 }}>
                {task.recovery_status || 'None'}
              </Typography>
            </Grid>
          </Grid>
        </Panel>

        {/* Section 2: Lifecycle Timeline */}
        <Panel sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <Activity size={18} color={tokens.colors.accentPrimary} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: tokens.colors.text.primary }}>
              Lifecycle Timeline
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
            {/* Step 1: Created */}
            <Box
              sx={{
                flex: 1,
                p: 2,
                borderRadius: `${tokens.borderRadius.sm}px`,
                backgroundColor: tokens.colors.surfaceElevated,
                border: `1px solid ${tokens.colors.borderSubtle}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: tokens.colors.success }} />
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                  Task Submitted
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.75rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.secondary }}>
                {formatFullTimestamp(task.created_at)}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mt: 0.5 }}>
                Task recorded in persistent repository.
              </Typography>
            </Box>

            {/* Step 2: Started */}
            <Box
              sx={{
                flex: 1,
                p: 2,
                borderRadius: `${tokens.borderRadius.sm}px`,
                backgroundColor: tokens.colors.surfaceElevated,
                border: `1px solid ${tokens.colors.borderSubtle}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: task.started_at ? tokens.colors.primary : tokens.colors.border,
                  }}
                />
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                  Execution Started
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.75rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.secondary }}>
                {task.started_at ? formatFullTimestamp(task.started_at) : 'Awaiting worker'}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mt: 0.5 }}>
                {task.started_at ? 'Governed execution loop commenced.' : 'Execution not yet started.'}
              </Typography>
            </Box>

            {/* Step 3: Finished */}
            <Box
              sx={{
                flex: 1,
                p: 2,
                borderRadius: `${tokens.borderRadius.sm}px`,
                backgroundColor: tokens.colors.surfaceElevated,
                border: `1px solid ${tokens.colors.borderSubtle}`,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor:
                      task.status === 'completed'
                        ? tokens.colors.success
                        : task.status === 'failed'
                        ? tokens.colors.error
                        : task.status === 'cancelled'
                        ? tokens.colors.warning
                        : tokens.colors.border,
                  }}
                />
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                  Terminal State ({task.status.toUpperCase()})
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.75rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.secondary }}>
                {task.finished_at ? formatFullTimestamp(task.finished_at) : 'In progress'}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mt: 0.5 }}>
                {task.finished_at ? `Execution completed with status '${task.status}'.` : 'Active governed execution.'}
              </Typography>
            </Box>
          </Box>
        </Panel>

        {/* Governance: Policy & Budget Inspector (M9.5) */}
        <GovernanceInspector
          events={taskEvents.events}
          toolCalls={taskEvents.toolCalls}
          budgetSnapshot={diagnostics?.budget_snapshot || task.budget_summary}
          fallbackTimeline={diagnostics?.timeline}
        />

        {/* Live Execution Inspector & SSE Streaming */}
        <LiveExecutionInspector taskId={task.task_id} isTaskTerminal={isTerminal} eventsResult={taskEvents} />

        {/* Section 3: Task Input / Prompt */}
        <Panel sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <FileText size={18} color={tokens.colors.accentPrimary} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: tokens.colors.text.primary }}>
                Task Input / Prompt
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              onClick={() => handleCopy(task.description, 'Prompt', 'prompt')}
              startIcon={copiedSection === 'prompt' ? <Check size={14} /> : <Copy size={14} />}
              sx={{
                fontSize: '0.75rem',
                textTransform: 'none',
                borderColor: tokens.colors.borderSubtle,
                color: tokens.colors.text.secondary,
              }}
            >
              {copiedSection === 'prompt' ? 'Copied' : 'Copy Prompt'}
            </Button>
          </Box>

          <Box
            sx={{
              p: 2,
              borderRadius: `${tokens.borderRadius.sm}px`,
              backgroundColor: tokens.colors.surfaceElevated,
              border: `1px solid ${tokens.colors.borderSubtle}`,
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            <Typography
              component="pre"
              sx={{
                m: 0,
                fontSize: '0.8125rem',
                fontFamily: tokens.typography.fontFamily.mono,
                color: tokens.colors.text.primary,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.6,
              }}
            >
              {task.description}
            </Typography>
          </Box>
        </Panel>

        {/* Section 4: Execution Result / Outputs */}
        <Panel sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Terminal size={18} color={tokens.colors.accentSuccess} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: tokens.colors.text.primary }}>
                Execution Result
              </Typography>
            </Box>

            {result?.final_response && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleCopy(result.final_response || '', 'Result', 'result')}
                startIcon={copiedSection === 'result' ? <Check size={14} /> : <Copy size={14} />}
                sx={{
                  fontSize: '0.75rem',
                  textTransform: 'none',
                  borderColor: tokens.colors.borderSubtle,
                  color: tokens.colors.text.secondary,
                }}
              >
                {copiedSection === 'result' ? 'Copied' : 'Copy Output'}
              </Button>
            )}
          </Box>

          {!isTerminal ? (
            <Alert
              severity="info"
              sx={{
                backgroundColor: tokens.colors.primarySubtle,
                border: `1px solid rgba(124, 140, 255, 0.25)`,
                color: tokens.colors.text.primary,
              }}
            >
              Task is currently executing (status: {task.status}). Terminal results will appear here upon completion.
            </Alert>
          ) : isResultLoading ? (
            <LoadingSkeleton variant="card" />
          ) : result ? (
            <Stack spacing={2}>
              {/* Result Summary Bar */}
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: `${tokens.borderRadius.sm}px`,
                  backgroundColor: tokens.colors.surfaceElevated,
                  border: `1px solid ${tokens.colors.borderSubtle}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  flexWrap: 'wrap',
                }}
              >
                <Box>
                  <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600 }}>
                    OUTCOME
                  </Typography>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: result.completed ? tokens.colors.success : tokens.colors.error }}>
                    {result.completed ? 'COMPLETED' : 'INCOMPLETE'}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600 }}>
                    DURATION
                  </Typography>
                  <Typography sx={{ fontSize: '0.8125rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.primary }}>
                    {result.duration_seconds !== undefined ? `${result.duration_seconds}s` : '--'}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600 }}>
                    TOOL CALLS
                  </Typography>
                  <Typography sx={{ fontSize: '0.8125rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.primary }}>
                    {result.tool_call_count ?? 0}
                  </Typography>
                </Box>
              </Box>

              {/* Final Response Output */}
              {result.final_response && (
                <Box
                  sx={{
                    p: 2,
                    borderRadius: `${tokens.borderRadius.sm}px`,
                    backgroundColor: tokens.colors.surfaceElevated,
                    border: `1px solid ${tokens.colors.borderSubtle}`,
                    maxHeight: 320,
                    overflowY: 'auto',
                  }}
                >
                  <Typography
                    component="pre"
                    sx={{
                      m: 0,
                      fontSize: '0.8125rem',
                      fontFamily: tokens.typography.fontFamily.mono,
                      color: tokens.colors.text.primary,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      lineHeight: 1.6,
                    }}
                  >
                    {result.final_response}
                  </Typography>
                </Box>
              )}

              {/* Structured JSON Outputs */}
              {result.outputs && Object.keys(result.outputs).length > 0 && !result.final_response && (
                <Box
                  sx={{
                    p: 2,
                    borderRadius: `${tokens.borderRadius.sm}px`,
                    backgroundColor: tokens.colors.surfaceElevated,
                    border: `1px solid ${tokens.colors.borderSubtle}`,
                    maxHeight: 320,
                    overflowY: 'auto',
                  }}
                >
                  <Typography
                    component="pre"
                    sx={{
                      m: 0,
                      fontSize: '0.75rem',
                      fontFamily: tokens.typography.fontFamily.mono,
                      color: tokens.colors.text.primary,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(result.outputs, null, 2)}
                  </Typography>
                </Box>
              )}

              {!result.final_response && (!result.outputs || Object.keys(result.outputs).length === 0) && (
                <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.secondary }}>
                  No output payload produced.
                </Typography>
              )}
            </Stack>
          ) : (
            <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.secondary }}>
              No result data returned.
            </Typography>
          )}
        </Panel>

        {/* Section 5: Execution Error Alert (if any) */}
        {(task.error_summary || result?.error) && (
          <Alert
            severity="error"
            sx={{
              backgroundColor: tokens.colors.errorSubtle,
              border: '1px solid rgba(241, 108, 120, 0.3)',
              color: tokens.colors.text.primary,
            }}
          >
            <Typography sx={{ fontWeight: 600, fontSize: '0.8125rem', mb: 0.5 }}>
              Execution Error
            </Typography>
            <Typography
              component="pre"
              sx={{
                m: 0,
                fontSize: '0.75rem',
                fontFamily: tokens.typography.fontFamily.mono,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {task.error_summary || result?.error}
            </Typography>
          </Alert>
        )}

        {/* Section 6: Recovery & Diagnostics Inspector (M9.6) */}
        <RecoveryInspector
          diagnostics={diagnostics}
          isLoading={diagnosticsQuery.isLoading}
          onRefresh={refetchDiag}
          taskStatus={task.status}
        />
      </Stack>

      {/* Confirmation Dialogs */}
      <ConfirmationDialog
        open={cancelDialogOpen}
        title="Cancel Governed Execution"
        message={`Are you sure you want to cancel execution of task "${taskId}"? All tool calls and agent loops will be aborted immediately.`}
        confirmLabel="Cancel Task"
        isDestructive={true}
        onConfirm={handleConfirmCancel}
        onCancel={() => setCancelDialogOpen(false)}
      />

      <ConfirmationDialog
        open={resumeDialogOpen}
        title="Resume Governed Execution"
        message={`Resume task "${taskId}" from its last verified checkpoint? ForgeGuard will evaluate safe recovery preconditions before proceeding.`}
        confirmLabel="Resume Execution"
        isDestructive={false}
        onConfirm={handleConfirmResume}
        onCancel={() => setResumeDialogOpen(false)}
      />
    </Box>
  );
};

export default TaskDetailPage;
