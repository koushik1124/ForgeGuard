import React, { useMemo } from 'react';
import {
  Box,
  Grid,
  Typography,
  Button,
  Stack,
  Chip,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  Database,
  Server,
  Clock,
  Plus,
  RefreshCw,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { MetricCard } from '../components/common/MetricCard';
import { Panel } from '../components/common/Panel';
import { DataTable, Column } from '../components/common/DataTable';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { useConnectionStore } from '../stores/connectionStore';
import { useOverviewData } from '../api/hooks';
import { TaskResponse } from '../api/types';
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

function formatTimestamp(isoString?: string | null): string {
  if (!isoString) return '--';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface DerivedActivity {
  id: string;
  taskId: string;
  description: string;
  action: string;
  status: string;
  timestamp: string;
}

export const DashboardPage: React.FC = () => {
  const { connectionState, baseUrl, latencyMs, lastSynchronizedAt } = useConnectionStore();
  const isConnected = connectionState === 'connected' || connectionState === 'degraded';

  const { healthQuery, readinessQuery, tasksQuery, isRefreshing, refreshAll } = useOverviewData(50);

  const health = healthQuery.data;
  const readiness = readinessQuery.data;
  const taskList = tasksQuery.data;

  const isDataStale =
    Boolean(healthQuery.isError && health) ||
    Boolean(readinessQuery.isError && readiness) ||
    Boolean(tasksQuery.isError && taskList);

  const hasEndpointError = !isConnected && (healthQuery.isError || tasksQuery.isError);

  const tasks = taskList?.items || [];
  const totalTasksCount = taskList?.total ?? tasks.length;

  // Metric classifications from actual TaskStatus values
  const activeCount = tasks.filter((t) => t.status === 'running' || t.status === 'created').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;
  const cancelledCount = tasks.filter((t) => t.status === 'cancelled').length;

  const scopeLabel = tasks.length > 0 ? `Scoped to latest ${tasks.length} tasks` : undefined;

  // Derive truthful lifecycle activity from task records
  const derivedActivity = useMemo<DerivedActivity[]>(() => {
    const items: DerivedActivity[] = [];

    tasks.forEach((task) => {
      if (task.finished_at) {
        items.push({
          id: `${task.task_id}-finished`,
          taskId: task.task_id,
          description: task.description || 'Task execution',
          action: task.status === 'completed' ? 'Completed execution' : task.status === 'failed' ? 'Failed execution' : 'Cancelled execution',
          status: task.status,
          timestamp: task.finished_at,
        });
      } else if (task.started_at) {
        items.push({
          id: `${task.task_id}-started`,
          taskId: task.task_id,
          description: task.description || 'Task execution',
          action: 'Started execution',
          status: 'running',
          timestamp: task.started_at,
        });
      } else if (task.created_at) {
        items.push({
          id: `${task.task_id}-created`,
          taskId: task.task_id,
          description: task.description || 'Task execution',
          action: 'Task submitted',
          status: 'created',
          timestamp: task.created_at,
        });
      }
    });

    return items
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 6);
  }, [tasks]);

  const columns: Column<TaskResponse>[] = [
    {
      id: 'task_id',
      header: 'Task ID',
      width: 140,
      render: (row) => (
        <Tooltip title={`Full Task ID: ${row.task_id}`} placement="top" arrow>
          <Typography
            component={RouterLink}
            to={`/tasks/${row.task_id}`}
            sx={{
              fontFamily: tokens.fonts.mono,
              fontSize: '0.8125rem',
              color: tokens.colors.accentPrimary,
              textDecoration: 'none',
              fontWeight: 500,
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {row.task_id.length > 14 ? `${row.task_id.substring(0, 12)}...` : row.task_id}
          </Typography>
        </Tooltip>
      ),
    },
    {
      id: 'description',
      header: 'Objective / Prompt',
      render: (row) => (
        <Tooltip title={row.description || 'No description provided'} placement="top-start" arrow>
          <Typography
            sx={{
              fontSize: '0.8125rem',
              color: tokens.colors.textPrimary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: { xs: 180, sm: 260, md: 360 },
            }}
          >
            {row.description || '--'}
          </Typography>
        </Tooltip>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      width: 110,
      render: (row) => (
        <Stack direction="row" spacing={0.75} alignItems="center">
          <StatusBadge status={row.status} size="small" />
          {row.error_summary && (
            <Tooltip title={`Error: ${row.error_summary}`} arrow>
              <Box component="span" sx={{ display: 'inline-flex', color: tokens.colors.accentError }}>
                <AlertTriangle size={13} />
              </Box>
            </Tooltip>
          )}
        </Stack>
      ),
    },
    {
      id: 'workspace_id',
      header: 'Workspace',
      width: 120,
      render: (row) => {
        const wsId = (row.metadata?.workspace_id as string) || row.workspace_id || 'default';
        return (
          <Typography
            sx={{
              fontFamily: tokens.fonts.mono,
              fontSize: '0.75rem',
              color: tokens.colors.textMuted,
              backgroundColor: 'rgba(146, 155, 172, 0.08)',
              px: 0.75,
              py: 0.25,
              borderRadius: '4px',
              display: 'inline-block',
            }}
          >
            {wsId}
          </Typography>
        );
      },
    },
    {
      id: 'duration',
      header: 'Duration',
      align: 'right',
      width: 110,
      render: (row) => (
        <Typography
          sx={{
            fontFamily: tokens.fonts.mono,
            fontSize: '0.8rem',
            color: row.status === 'running' ? tokens.colors.accentPrimary : tokens.colors.textPrimary,
          }}
        >
          {formatDuration(row.started_at, row.finished_at, row.status)}
        </Typography>
      ),
    },
    {
      id: 'created_at',
      header: 'Created',
      width: 110,
      render: (row) => (
        <Tooltip title={row.created_at} arrow>
          <Typography sx={{ fontFamily: tokens.fonts.mono, fontSize: '0.75rem', color: tokens.colors.textMuted }}>
            {formatTimestamp(row.created_at)}
          </Typography>
        </Tooltip>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Overview"
        description="Monitor governed AI agent executions, policy decisions, and runtime infrastructure health."
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              variant="outlined"
              size="small"
              onClick={refreshAll}
              disabled={isRefreshing}
              startIcon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
              sx={{
                color: tokens.colors.textPrimary,
                borderColor: tokens.colors.borderSubtle,
                '&:hover': { borderColor: tokens.colors.borderHover },
              }}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button
              component={RouterLink}
              to="/settings"
              variant="outlined"
              size="small"
              sx={{ color: tokens.colors.textPrimary, borderColor: tokens.colors.borderSubtle }}
            >
              Configure API
            </Button>
            <Button
              component={RouterLink}
              to="/tasks"
              variant="contained"
              size="small"
              startIcon={<Plus size={16} />}
              sx={{
                backgroundColor: tokens.colors.accentPrimary,
                color: '#fff',
                '&:hover': { backgroundColor: tokens.colors.accentPrimaryHover },
              }}
            >
              View Tasks
            </Button>
          </Stack>
        }
      />

      {/* Endpoint Error Alert */}
      {hasEndpointError && (
        <Alert
          severity="error"
          icon={<AlertTriangle size={18} />}
          action={
            <Button component={RouterLink} to="/settings" size="small" color="inherit">
              Settings
            </Button>
          }
          sx={{
            mb: 2.5,
            backgroundColor: 'rgba(241, 108, 120, 0.1)',
            color: tokens.colors.textPrimary,
            border: '1px solid rgba(241, 108, 120, 0.3)',
            '& .MuiAlert-icon': { color: tokens.colors.accentError },
          }}
        >
          <Typography sx={{ fontSize: '0.8125rem' }}>
            Cannot reach ForgeGuard runtime at {baseUrl}. Verify the backend server is running and check settings.
          </Typography>
        </Alert>
      )}

      {/* Stale Data Alert */}
      {isDataStale && (
        <Alert
          severity="warning"
          icon={<AlertTriangle size={18} />}
          sx={{
            mb: 2.5,
            backgroundColor: 'rgba(240, 180, 90, 0.1)',
            color: tokens.colors.textPrimary,
            border: '1px solid rgba(240, 180, 90, 0.3)',
            '& .MuiAlert-icon': { color: tokens.colors.accentWarning },
          }}
        >
          <Typography sx={{ fontSize: '0.8125rem' }}>
            Background refresh encountered a connection error. Displaying cached operational data.
          </Typography>
        </Alert>
      )}

      {/* Primary Metrics Row (4 Governed Task Metrics) */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Active Executions"
            value={isConnected ? activeCount : '--'}
            unavailableReason={!isConnected ? 'Connect API in Settings' : undefined}
            icon={<Play size={18} color={tokens.colors.accentPrimary} />}
            subtitle={isConnected ? (scopeLabel || 'Running or created') : undefined}
            loading={tasksQuery.isLoading && isConnected}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Completed Tasks"
            value={isConnected ? completedCount : '--'}
            unavailableReason={!isConnected ? 'Connect API in Settings' : undefined}
            icon={<CheckCircle2 size={18} color={tokens.colors.accentSuccess} />}
            subtitle={isConnected ? 'Terminal successful outcomes' : undefined}
            loading={tasksQuery.isLoading && isConnected}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Failed / Terminated"
            value={isConnected ? failedCount : '--'}
            unavailableReason={!isConnected ? 'Connect API in Settings' : undefined}
            icon={<AlertTriangle size={18} color={tokens.colors.accentError} />}
            subtitle={isConnected ? 'Policy, budget or tool halts' : undefined}
            loading={tasksQuery.isLoading && isConnected}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Cancelled Tasks"
            value={isConnected ? cancelledCount : '--'}
            unavailableReason={!isConnected ? 'Connect API in Settings' : undefined}
            icon={<XCircle size={18} color={tokens.colors.accentWarning} />}
            subtitle={isConnected ? 'Client or operator stopped' : undefined}
            loading={tasksQuery.isLoading && isConnected}
          />
        </Grid>
      </Grid>

      {/* Main Content Layout */}
      <Grid container spacing={2.5}>
        {/* Left Column: Recent Executions + Runtime Activity Feed */}
        <Grid item xs={12} lg={8}>
          <Stack spacing={2.5}>
            {/* Recent Executions Table */}
            <Panel
              title="Recent Executions"
              subtitle="Latest governed agent execution runs across all active workspaces"
              actions={
                <Button
                  component={RouterLink}
                  to="/tasks"
                  size="small"
                  endIcon={<ExternalLink size={14} />}
                  sx={{ fontSize: '0.8rem', color: tokens.colors.accentPrimary }}
                >
                  View all ({totalTasksCount})
                </Button>
              }
            >
              {tasksQuery.isError && !tasks.length ? (
                <ErrorState
                  title="Failed to Load Executions"
                  message={tasksQuery.error?.message || 'Could not retrieve tasks from the ForgeGuard API.'}
                  onRetry={() => tasksQuery.refetch()}
                />
              ) : isConnected ? (
                <DataTable<TaskResponse>
                  columns={columns}
                  data={tasks}
                  keyField="task_id"
                  loading={tasksQuery.isLoading}
                  emptyTitle="No Execution Tasks"
                  emptyMessage="No execution tasks have been recorded yet in this runtime."
                />
              ) : (
                <EmptyState
                  icon={<Server size={28} />}
                  title="Runtime API Disconnected"
                  description="Connect to the ForgeGuard backend in Settings to view active and completed execution tasks."
                  action={
                    <Button
                      component={RouterLink}
                      to="/settings"
                      variant="outlined"
                      size="small"
                      sx={{ color: tokens.colors.accentPrimary, borderColor: tokens.colors.borderSubtle }}
                    >
                      Go to Settings
                    </Button>
                  }
                />
              )}
            </Panel>

            {/* Runtime Activity Feed (Task-Derived Lifecycle) */}
            <Panel
              title="Runtime Activity"
              subtitle="Sequential lifecycle state transitions derived from persisted task records"
              actions={
                <Chip
                  label="Task-Derived"
                  size="small"
                  sx={{
                    fontFamily: tokens.fonts.mono,
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    backgroundColor: tokens.colors.surfaceElevated,
                    color: tokens.colors.textMuted,
                    border: `1px solid ${tokens.colors.borderSubtle}`,
                  }}
                />
              }
            >
              {isConnected && derivedActivity.length > 0 ? (
                <Stack spacing={1.5}>
                  {derivedActivity.map((activity) => (
                    <Box
                      key={activity.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        p: 1.5,
                        borderRadius: '6px',
                        backgroundColor: tokens.colors.surfaceElevated,
                        border: `1px solid ${tokens.colors.borderSubtle}`,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                        <StatusBadge status={activity.status} size="small" />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            component={RouterLink}
                            to={`/tasks/${activity.taskId}`}
                            sx={{
                              fontFamily: tokens.fonts.mono,
                              fontSize: '0.8125rem',
                              color: tokens.colors.accentPrimary,
                              textDecoration: 'none',
                              fontWeight: 500,
                              display: 'inline-block',
                              '&:hover': { textDecoration: 'underline' },
                            }}
                          >
                            {activity.taskId.substring(0, 12)}...
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: '0.75rem',
                              color: tokens.colors.textMuted,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: { xs: 200, sm: 380, md: 500 },
                            }}
                          >
                            {activity.action} — {activity.description}
                          </Typography>
                        </Box>
                      </Box>
                      <Typography
                        sx={{
                          fontFamily: tokens.fonts.mono,
                          fontSize: '0.75rem',
                          color: tokens.colors.textSubtle,
                          flexShrink: 0,
                          ml: 1.5,
                        }}
                      >
                        {formatTimestamp(activity.timestamp)}
                      </Typography>
                    </Box>
                  ))}
                  <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.textSubtle, pt: 0.5 }}>
                    Real-time SSE event streaming is enabled during active task runs.
                  </Typography>
                </Stack>
              ) : isConnected ? (
                <Box sx={{ py: 3, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.textMuted }}>
                    No recent task lifecycle transitions recorded.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ py: 3, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.textMuted }}>
                    Activity stream unavailable while disconnected from API.
                  </Typography>
                </Box>
              )}
            </Panel>
          </Stack>
        </Grid>

        {/* Right Column: Runtime Information & Architecture Invariants */}
        <Grid item xs={12} lg={4}>
          <Stack spacing={2.5}>
            {/* Runtime Diagnostics Information */}
            <Panel title="Runtime Information" subtitle="Current engine connectivity, dependencies & diagnostics">
              <Stack spacing={2}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ color: tokens.colors.textMuted, fontSize: '0.8125rem' }}>Endpoint</Typography>
                  <Typography
                    sx={{
                      fontFamily: tokens.fonts.mono,
                      fontSize: '0.8125rem',
                      color: tokens.colors.textPrimary,
                    }}
                  >
                    {baseUrl}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ color: tokens.colors.textMuted, fontSize: '0.8125rem' }}>Connection State</Typography>
                  <Chip
                    label={connectionState.toUpperCase()}
                    size="small"
                    sx={{
                      fontSize: '0.7rem',
                      fontFamily: tokens.fonts.mono,
                      fontWeight: 600,
                      backgroundColor:
                        connectionState === 'connected'
                          ? 'rgba(53, 201, 138, 0.15)'
                          : connectionState === 'error'
                          ? 'rgba(241, 108, 120, 0.15)'
                          : connectionState === 'degraded'
                          ? 'rgba(240, 180, 90, 0.15)'
                          : 'rgba(124, 140, 255, 0.15)',
                      color:
                        connectionState === 'connected'
                          ? tokens.colors.accentSuccess
                          : connectionState === 'error'
                          ? tokens.colors.accentError
                          : connectionState === 'degraded'
                          ? tokens.colors.accentWarning
                          : tokens.colors.accentPrimary,
                    }}
                  />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Activity size={14} color={tokens.colors.textSubtle} />
                    <Typography sx={{ color: tokens.colors.textMuted, fontSize: '0.8125rem' }}>Process Health</Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontFamily: tokens.fonts.mono,
                      fontSize: '0.8125rem',
                      color: healthQuery.isSuccess ? tokens.colors.accentSuccess : isConnected ? tokens.colors.accentWarning : tokens.colors.textSubtle,
                    }}
                  >
                    {healthQuery.isSuccess ? `OK (v${health?.version || '0.1.0'})` : isConnected ? 'Degraded' : 'Unknown'}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Server size={14} color={tokens.colors.textSubtle} />
                    <Typography sx={{ color: tokens.colors.textMuted, fontSize: '0.8125rem' }}>Runtime Readiness</Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontFamily: tokens.fonts.mono,
                      fontSize: '0.8125rem',
                      color:
                        readiness?.status === 'ready'
                          ? tokens.colors.accentSuccess
                          : readinessQuery.isSuccess
                          ? tokens.colors.accentWarning
                          : tokens.colors.textSubtle,
                    }}
                  >
                    {readiness?.status === 'ready' ? 'READY' : readinessQuery.isSuccess ? 'NOT READY' : 'UNKNOWN'}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Database size={14} color={tokens.colors.textSubtle} />
                    <Typography sx={{ color: tokens.colors.textMuted, fontSize: '0.8125rem' }}>Database State</Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontFamily: tokens.fonts.mono,
                      fontSize: '0.8125rem',
                      color: readiness?.database ? tokens.colors.accentSuccess : isConnected ? tokens.colors.accentWarning : tokens.colors.textSubtle,
                    }}
                  >
                    {readiness?.database ? 'Available' : isConnected ? 'Unavailable' : 'Unknown'}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Layers size={14} color={tokens.colors.textSubtle} />
                    <Typography sx={{ color: tokens.colors.textMuted, fontSize: '0.8125rem' }}>Engine State</Typography>
                  </Box>
                  <Typography
                    sx={{
                      fontFamily: tokens.fonts.mono,
                      fontSize: '0.8125rem',
                      color: readiness?.engine ? tokens.colors.accentSuccess : isConnected ? tokens.colors.accentWarning : tokens.colors.textSubtle,
                    }}
                  >
                    {readiness?.engine ? 'Active' : isConnected ? 'Idle' : 'Unknown'}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Clock size={14} color={tokens.colors.textSubtle} />
                    <Typography sx={{ color: tokens.colors.textMuted, fontSize: '0.8125rem' }}>API Latency</Typography>
                  </Box>
                  <Typography sx={{ fontFamily: tokens.fonts.mono, fontSize: '0.8125rem', color: tokens.colors.textPrimary }}>
                    {latencyMs ? `${latencyMs} ms` : isConnected ? '< 10 ms' : '--'}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ color: tokens.colors.textMuted, fontSize: '0.8125rem' }}>Last Synchronized</Typography>
                  <Typography sx={{ fontFamily: tokens.fonts.mono, fontSize: '0.8125rem', color: tokens.colors.textPrimary }}>
                    {lastSynchronizedAt ? formatTimestamp(lastSynchronizedAt) : isConnected ? 'Live' : '--'}
                  </Typography>
                </Box>
              </Stack>
            </Panel>

            {/* Architecture Invariants Panel */}
            <Panel title="Governance Invariants" subtitle="Runtime policies and execution limits">
              <Stack spacing={1.5}>
                <Box sx={{ p: 1.5, borderRadius: '6px', backgroundColor: tokens.colors.surfaceElevated }}>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tokens.colors.textPrimary, mb: 0.5 }}>
                    Default-Deny Policy Enforcement
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.textMuted }}>
                    LLM proposes actions; ForgeGuard authorizes and executes through explicit declarative policies.
                  </Typography>
                </Box>

                <Box sx={{ p: 1.5, borderRadius: '6px', backgroundColor: tokens.colors.surfaceElevated }}>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tokens.colors.textPrimary, mb: 0.5 }}>
                    Durable Recovery & Checkpoints
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.textMuted }}>
                    State journaling and atomic checkpoints enabled for safe resume and crash recovery without repeating completed tools.
                  </Typography>
                </Box>
              </Stack>
            </Panel>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
};
