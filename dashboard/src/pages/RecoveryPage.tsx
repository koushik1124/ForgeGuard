import React, { useState, useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import {
  ShieldCheck,
  RotateCw,
  AlertCircle,
  ExternalLink,
  History,
} from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { EmptyState } from '../components/common/EmptyState';
import { RecoveryAssessmentBanner } from '../components/recovery/RecoveryAssessmentBanner';
import { RecoveryInspector } from '../components/recovery/RecoveryInspector';
import { useConnectionStore } from '../stores/connectionStore';
import { useTasks, useTaskDiagnostics, useResumeTask } from '../api/hooks';
import { tokens } from '../theme/tokens';

export const RecoveryPage: React.FC = () => {
  const { connectionState } = useConnectionStore();
  const isDisconnected = connectionState === 'disconnected' || connectionState === 'error';

  // Task selection
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');

  // Fetch all tasks
  const { data: taskData, refetch, isFetching } = useTasks({ limit: 50 });
  const tasks = taskData?.items ?? [];

  // Filter failed or cancelled tasks that might require recovery
  const recoverableTasks = useMemo(
    () => tasks.filter((t) => ['failed', 'cancelled'].includes(t.status?.toLowerCase() || '')),
    [tasks]
  );

  // Effective selected task ID (prefer first failed task, fallback to first task)
  const effectiveTaskId =
    selectedTaskId ||
    (recoverableTasks.length > 0 ? recoverableTasks[0].task_id : tasks.length > 0 ? tasks[0].task_id : '');

  const selectedTask = useMemo(() => tasks.find((t) => t.task_id === effectiveTaskId), [tasks, effectiveTaskId]);

  // Load diagnostics for the selected task
  const {
    data: diagnosticsData,
    isLoading: isLoadingDiagnostics,
    refetch: refetchDiag,
  } = useTaskDiagnostics(effectiveTaskId, Boolean(effectiveTaskId));

  // Resume mutation
  const resumeMutation = useResumeTask();

  const handleResume = () => {
    if (!effectiveTaskId || resumeMutation.isPending) return;
    resumeMutation.mutate(effectiveTaskId, {
      onSuccess: () => {
        refetch();
        refetchDiag();
      },
    });
  };

  return (
    <Box>
      <PageHeader
        title="Crash Recovery & State"
        description="Inspect failure diagnostics, atomic checkpoints, and authoritative recovery safety."
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                refetch();
                refetchDiag();
              }}
              disabled={isFetching}
              startIcon={
                <RotateCw
                  size={14}
                  style={{
                    animation: isFetching ? 'spin 1s linear infinite' : undefined,
                  }}
                />
              }
              sx={{
                color: tokens.colors.text.primary,
                borderColor: tokens.colors.border,
                fontSize: '0.8125rem',
                textTransform: 'none',
              }}
            >
              {isFetching ? 'Refreshing' : 'Refresh'}
            </Button>
          </Stack>
        }
      />

      {/* Disconnected Alert */}
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
          Runtime backend is disconnected. Resume operations and diagnostics require an active backend connection.
        </Alert>
      )}

      {/* Resume error alert */}
      {resumeMutation.isError && (
        <Alert
          severity="error"
          onClose={() => resumeMutation.reset()}
          sx={{
            mb: 3,
            backgroundColor: tokens.colors.errorSubtle,
            border: `1px solid rgba(255, 99, 132, 0.3)`,
            color: tokens.colors.text.primary,
          }}
        >
          Failed to resume task: {resumeMutation.error?.message || 'Resume rejected by runtime safety check.'}
        </Alert>
      )}

      <Stack spacing={3}>
        {/* Authoritative Safety Invariant Notice */}
        <Panel
          sx={{
            p: 2.5,
            backgroundColor: 'rgba(124, 140, 255, 0.04)',
            border: `1px solid rgba(124, 140, 255, 0.2)`,
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} alignItems={{ md: 'center' }} justifyContent="space-between">
            <Box>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <ShieldCheck size={20} color={tokens.colors.success} />
                <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                  Authoritative Recovery Invariant
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.muted, lineHeight: 1.6, maxWidth: 800 }}>
                ForgeGuard enforces authoritative recovery checks. Tasks are only eligible for resumption if durable checkpoints exist,
                no uncommitted side-effects remain uncertain, and policy limits were not fatally breached. The runtime rejects any unsafe resume request.
              </Typography>
            </Box>
            <Chip
              label={`${recoverableTasks.length} Failed / Interrupted`}
              color={recoverableTasks.length > 0 ? 'error' : 'default'}
              size="small"
              sx={{
                fontWeight: 600,
                fontSize: '0.75rem',
                fontFamily: tokens.typography.fontFamily.mono,
                alignSelf: { xs: 'flex-start', md: 'center' },
              }}
            />
          </Stack>
        </Panel>

        {/* Task Selector Panel */}
        <Panel sx={{ p: 2.5 }}>
          <Box sx={{ mb: 2, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                Select Task for Recovery Diagnostics
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted }}>
                Examine durable checkpoint state, failure diagnostics, and safe resumability assessment.
              </Typography>
            </Box>

            {tasks.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 280 }}>
                <InputLabel id="recovery-task-select-label">Select Task</InputLabel>
                <Select
                  labelId="recovery-task-select-label"
                  value={effectiveTaskId}
                  label="Select Task"
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  sx={{ backgroundColor: tokens.colors.surfaceElevated, fontSize: '0.8125rem' }}
                >
                  {tasks.map((t) => (
                    <MenuItem key={t.task_id} value={t.task_id} sx={{ fontSize: '0.8125rem' }}>
                      {t.task_id} ({t.status}) {t.status === 'failed' ? '⚠️' : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>

          {tasks.length === 0 ? (
            <EmptyState
              icon={<History size={32} color={tokens.colors.text.muted} />}
              title="No Task Execution Records"
              description="No execution tasks have been recorded yet. When tasks fail or encounter faults, recovery diagnostics will appear here."
              action={
                <Button
                  component={RouterLink}
                  to="/tasks"
                  variant="outlined"
                  size="small"
                  sx={{ color: tokens.colors.accentPrimary, borderColor: tokens.colors.accentPrimary, textTransform: 'none' }}
                >
                  Go to Task Explorer
                </Button>
              }
            />
          ) : (
            <Box>
              {selectedTask && (
                <Box sx={{ mb: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.secondary }}>
                    Diagnosing: <strong style={{ color: tokens.colors.text.primary }}>{selectedTask.task_id}</strong> &mdash; Status: <strong>{selectedTask.status}</strong>
                  </Typography>
                  <Button
                    component={RouterLink}
                    to={`/tasks/${selectedTask.task_id}`}
                    size="small"
                    endIcon={<ExternalLink size={13} />}
                    sx={{ fontSize: '0.75rem', color: tokens.colors.accentPrimary, textTransform: 'none' }}
                  >
                    Open Task Details
                  </Button>
                </Box>
              )}

              <Stack spacing={2.5}>
                {/* 1. Authoritative Recovery Assessment Banner */}
                <RecoveryAssessmentBanner
                  task={selectedTask}
                  diagnostics={diagnosticsData}
                  isDiagnosticsLoading={isLoadingDiagnostics}
                  onResumeClick={handleResume}
                  isResumePending={resumeMutation.isPending}
                />

                {/* 2. Recovery & Diagnostics Inspector (Diagnostics, Timeline, Checkpoints) */}
                <RecoveryInspector
                  diagnostics={diagnosticsData}
                  isLoading={isLoadingDiagnostics}
                  onRefresh={refetchDiag}
                />
              </Stack>
            </Box>
          )}
        </Panel>
      </Stack>
    </Box>
  );
};

export default RecoveryPage;
