import React, { useState, useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Radio,
  RotateCw,
  PlusCircle,
  ExternalLink,
  AlertCircle,
  Clock,
  Activity,
} from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { DataTable, Column } from '../components/common/DataTable';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { LiveExecutionInspector } from '../components/inspector/LiveExecutionInspector';
import { CreateTaskDialog } from '../components/task/CreateTaskDialog';
import { useConnectionStore } from '../stores/connectionStore';
import { useTasks } from '../api/hooks';
import { TaskResponse } from '../api/types';
import { tokens } from '../theme/tokens';

function formatElapsed(startedAt?: string | null): string {
  if (!startedAt) return '--';
  const start = new Date(startedAt).getTime();
  if (isNaN(start)) return '--';
  const elapsedSecs = Math.max(0, Math.floor((Date.now() - start) / 1000));
  if (elapsedSecs < 60) return `${elapsedSecs}s`;
  const mins = Math.floor(elapsedSecs / 60);
  const remSecs = elapsedSecs % 60;
  return `${mins}m ${remSecs}s`;
}

export const LiveRunsPage: React.FC = () => {
  const { connectionState } = useConnectionStore();
  const isDisconnected = connectionState === 'disconnected' || connectionState === 'error';

  // State
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState<boolean>(false);

  // Queries
  const { data: taskData, isError, error, refetch, isFetching } = useTasks({ limit: 50 });
  const allTasks = taskData?.items ?? [];

  // Filter running tasks vs recent terminal tasks
  const runningTasks = useMemo(() => allTasks.filter((t) => t.status?.toLowerCase() === 'running'), [allTasks]);
  const recentTerminalTasks = useMemo(
    () => allTasks.filter((t) => t.status?.toLowerCase() !== 'running'),
    [allTasks]
  );

  // Active task for live inspector
  const activeTaskId = selectedTaskId || (runningTasks.length > 0 ? runningTasks[0].task_id : null);
  const activeTask = useMemo(() => allTasks.find((t) => t.task_id === activeTaskId), [allTasks, activeTaskId]);
  const isTerminal = activeTask ? ['completed', 'failed', 'cancelled'].includes(activeTask.status?.toLowerCase() || '') : false;

  const columns: Column<TaskResponse>[] = [
    {
      id: 'task_id',
      label: 'Task ID',
      width: '180px',
      isMono: true,
      render: (task) => (
        <Tooltip title={`View full execution details for ${task.task_id}`} arrow>
          <Box
            component={RouterLink}
            to={`/tasks/${task.task_id}`}
            sx={{
              color: tokens.colors.accentPrimary,
              textDecoration: 'none',
              fontFamily: tokens.typography.fontFamily.mono,
              fontWeight: 600,
              fontSize: '0.8125rem',
              '&:hover': {
                textDecoration: 'underline',
              },
            }}
          >
            {task.task_id}
          </Box>
        </Tooltip>
      ),
    },
    {
      id: 'description',
      label: 'Prompt / Objective',
      render: (task) => (
        <Typography
          sx={{
            fontSize: '0.8125rem',
            color: tokens.colors.text.primary,
            maxWidth: { xs: '200px', sm: '350px', md: '500px' },
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {task.description}
        </Typography>
      ),
    },
    {
      id: 'status',
      label: 'Status',
      width: '130px',
      render: (task) => <StatusBadge status={task.status} />,
    },
    {
      id: 'workspace',
      label: 'Workspace',
      width: '140px',
      render: (task) => {
        const wsId = task.workspace_id || (task.metadata?.workspace_id as string | undefined);
        return wsId ? (
          <Typography sx={{ fontSize: '0.75rem', fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.muted }}>
            {wsId}
          </Typography>
        ) : (
          <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted }}>--</Typography>
        );
      },
    },
    {
      id: 'duration',
      label: 'Duration / Elapsed',
      width: '140px',
      render: (task) => {
        if (task.status === 'running') {
          return (
            <Chip
              icon={<Clock size={12} />}
              label={formatElapsed(task.started_at)}
              size="small"
              sx={{
                fontSize: '0.75rem',
                backgroundColor: 'rgba(240, 180, 90, 0.15)',
                color: tokens.colors.warning,
                fontFamily: tokens.typography.fontFamily.mono,
              }}
            />
          );
        }
        return (
          <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted }}>
            {task.started_at && task.finished_at ? `${Math.round((new Date(task.finished_at).getTime() - new Date(task.started_at).getTime()) / 1000)}s` : '--'}
          </Typography>
        );
      },
    },
    {
      id: 'actions',
      label: '',
      width: '80px',
      render: (task) => (
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          <Tooltip title="Inspect Live Stream">
            <IconButton
              size="small"
              onClick={() => setSelectedTaskId(task.task_id)}
              sx={{
                color: selectedTaskId === task.task_id ? tokens.colors.accentPrimary : tokens.colors.text.muted,
                '&:hover': { color: tokens.colors.accentPrimary },
              }}
            >
              <Radio size={15} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open Task Details">
            <IconButton
              size="small"
              component={RouterLink}
              to={`/tasks/${task.task_id}`}
              sx={{
                color: tokens.colors.text.muted,
                '&:hover': { color: tokens.colors.accentPrimary },
              }}
            >
              <ExternalLink size={15} />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Live Runs"
        description="Monitor active agent executions, real-time tool dispatches, and streaming runtime events."
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              variant="contained"
              size="small"
              onClick={() => setIsCreateDialogOpen(true)}
              startIcon={<PlusCircle size={14} />}
              sx={{
                backgroundColor: tokens.colors.accentPrimary,
                color: '#ffffff',
                fontSize: '0.8125rem',
                fontWeight: 600,
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: tokens.colors.accentPrimaryHover,
                },
              }}
            >
              Create Task
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => refetch()}
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
          Runtime backend is disconnected. Live event streaming will resume automatically when reconnected.
        </Alert>
      )}

      {/* Error State */}
      {isError && (
        <ErrorState
          title="Failed to Load Executions"
          message={error?.message || 'Unable to retrieve execution records from ForgeGuard runtime.'}
          onRetry={() => refetch()}
        />
      )}

      {/* Active Runs Section */}
      {!isError && (
        <Stack spacing={3}>
          {/* Active Running Executions Panel */}
          <Panel sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: runningTasks.length > 0 ? tokens.colors.warning : tokens.colors.success,
                    boxShadow: runningTasks.length > 0 ? `0 0 8px ${tokens.colors.warning}` : undefined,
                  }}
                />
                <Typography variant="h6" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                  Active Agent Executions ({runningTasks.length})
                </Typography>
              </Stack>
              {runningTasks.length > 0 && (
                <Chip
                  label={`${runningTasks.length} Live`}
                  size="small"
                  sx={{
                    backgroundColor: 'rgba(240, 180, 90, 0.15)',
                    color: tokens.colors.warning,
                    fontWeight: 600,
                    fontSize: '0.75rem',
                  }}
                />
              )}
            </Box>

            {runningTasks.length === 0 ? (
              <EmptyState
                icon={<Activity size={32} color={tokens.colors.text.muted} />}
                title="No Active Executions"
                description="There are currently no agent execution tasks in progress. Create a new task to monitor live tool dispatches and runtime events in real time."
                action={
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setIsCreateDialogOpen(true)}
                    startIcon={<PlusCircle size={14} />}
                    sx={{
                      color: tokens.colors.accentPrimary,
                      borderColor: tokens.colors.accentPrimary,
                      textTransform: 'none',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                    }}
                  >
                    Start an Execution Task
                  </Button>
                }
              />
            ) : (
              <DataTable
                columns={columns}
                data={runningTasks}
                keyField="task_id"
                onRowClick={(task) => setSelectedTaskId(task.task_id)}
              />
            )}
          </Panel>

          {/* Live Execution Inspector Stream (when a task is active or selected) */}
          {activeTaskId && activeTask && (
            <Box>
              <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Radio size={16} color={tokens.colors.accentPrimary} />
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                    Live Event Stream: <span style={{ fontFamily: tokens.typography.fontFamily.mono }}>{activeTaskId}</span>
                  </Typography>
                </Stack>
                <Button
                  component={RouterLink}
                  to={`/tasks/${activeTaskId}`}
                  size="small"
                  endIcon={<ExternalLink size={13} />}
                  sx={{
                    fontSize: '0.75rem',
                    color: tokens.colors.accentPrimary,
                    textTransform: 'none',
                  }}
                >
                  Full Execution Details
                </Button>
              </Box>

              <LiveExecutionInspector
                taskId={activeTaskId}
                isTaskTerminal={isTerminal}
              />
            </Box>
          )}

          {/* Recent Executions Panel */}
          {recentTerminalTasks.length > 0 && (
            <Panel sx={{ p: 2.5 }}>
              <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                  Recent Completed & Failed Executions
                </Typography>
                <Button
                  component={RouterLink}
                  to="/tasks"
                  size="small"
                  endIcon={<ExternalLink size={13} />}
                  sx={{
                    fontSize: '0.75rem',
                    color: tokens.colors.text.muted,
                    textTransform: 'none',
                    '&:hover': { color: tokens.colors.accentPrimary },
                  }}
                >
                  View All in Task Explorer
                </Button>
              </Box>
              <DataTable
                columns={columns}
                data={recentTerminalTasks.slice(0, 10)}
                keyField="task_id"
                onRowClick={(task) => setSelectedTaskId(task.task_id)}
              />
            </Panel>
          )}
        </Stack>
      )}

      {/* Task Creation Dialog */}
      <CreateTaskDialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSuccess={(newTask) => {
          refetch();
          setSelectedTaskId(newTask.task_id);
        }}
      />
    </Box>
  );
};

export default LiveRunsPage;
