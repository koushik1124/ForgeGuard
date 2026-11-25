import React, { useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Stack,
  Typography,
} from '@mui/material';
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Clock,
  Gauge,
  RotateCw,
  AlertCircle,
  FlaskConical,
  Activity,
  Layers,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { MetricCard } from '../components/common/MetricCard';
import { EmptyState } from '../components/common/EmptyState';
import { useConnectionStore } from '../stores/connectionStore';
import { useTasks, useEvaluationReports } from '../api/hooks';
import { tokens } from '../theme/tokens';

export const MetricsPage: React.FC = () => {
  const { connectionState } = useConnectionStore();
  const isDisconnected = connectionState === 'disconnected' || connectionState === 'error';

  // Fetch real backend tasks and evaluation reports
  const { data: taskData, refetch: refetchTasks, isFetching: isFetchingTasks } = useTasks({
    limit: 100,
  });
  const {
    data: reportsData,
    refetch: refetchReports,
    isFetching: isFetchingReports,
  } = useEvaluationReports();

  const isFetching = isFetchingTasks || isFetchingReports;

  const handleRefresh = () => {
    refetchTasks();
    refetchReports();
  };

  const tasks = taskData?.items ?? [];
  const reports = reportsData?.reports ?? [];

  // Compute Task Metrics
  const taskMetrics = useMemo(() => {
    const total = tasks.length;
    let completed = 0;
    let failed = 0;
    let cancelled = 0;
    let running = 0;
    let created = 0;
    let totalToolCalls = 0;
    let totalIterations = 0;
    const durationsSec: number[] = [];

    for (const t of tasks) {
      const s = t.status?.toLowerCase();
      if (s === 'completed') completed++;
      else if (s === 'failed') failed++;
      else if (s === 'cancelled') cancelled++;
      else if (s === 'running') running++;
      else if (s === 'created') created++;

      if (t.tool_call_count) totalToolCalls += t.tool_call_count;
      if (t.iteration_count) totalIterations += t.iteration_count;

      if (t.started_at && t.finished_at) {
        const start = new Date(t.started_at).getTime();
        const end = new Date(t.finished_at).getTime();
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          durationsSec.push((end - start) / 1000);
        }
      }
    }

    const terminalCount = completed + failed + cancelled;
    const successRatePct = terminalCount > 0 ? ((completed / terminalCount) * 100).toFixed(1) : null;

    let avgDuration = '--';
    let minDuration = '--';
    let maxDuration = '--';

    if (durationsSec.length > 0) {
      durationsSec.sort((a, b) => a - b);
      const sum = durationsSec.reduce((acc, d) => acc + d, 0);
      avgDuration = `${(sum / durationsSec.length).toFixed(2)}s`;
      minDuration = `${durationsSec[0].toFixed(2)}s`;
      maxDuration = `${durationsSec[durationsSec.length - 1].toFixed(2)}s`;
    }

    return {
      total,
      completed,
      failed,
      cancelled,
      running,
      created,
      terminalCount,
      successRatePct,
      totalToolCalls,
      totalIterations,
      durationsCount: durationsSec.length,
      avgDuration,
      minDuration,
      maxDuration,
    };
  }, [tasks]);

  // Compute Evaluation Metrics
  const evalMetrics = useMemo(() => {
    const totalRuns = reports.length;
    let totalScenarios = 0;
    let passedScenarios = 0;
    let failedScenarios = 0;

    for (const r of reports) {
      totalScenarios += r.total_scenarios || 0;
      passedScenarios += r.passed || 0;
      failedScenarios += r.failed || 0;
    }

    const passRatePct = totalScenarios > 0 ? ((passedScenarios / totalScenarios) * 100).toFixed(1) : null;

    return {
      totalRuns,
      totalScenarios,
      passedScenarios,
      failedScenarios,
      passRatePct,
    };
  }, [reports]);

  return (
    <Box>
      <PageHeader
        title="Metrics & Telemetry"
        description="Authoritative runtime performance, execution counts, and evaluation metrics computed from live backend records."
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              variant="outlined"
              size="small"
              onClick={handleRefresh}
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
          Runtime backend is disconnected. Displaying cached metrics.
        </Alert>
      )}

      {tasks.length === 0 && reports.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={32} color={tokens.colors.text.muted} />}
          title="No Telemetry Data Available"
          description="ForgeGuard computes metrics strictly from recorded executions and evaluation reports. Run a task or launch an evaluation benchmark to generate telemetry."
        />
      ) : (
        <Stack spacing={3}>
          {/* Section 1: Execution Throughput & Success Rate */}
          <Box>
            <Typography variant="h6" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: tokens.colors.text.primary, mb: 1.5 }}>
              Task Execution Telemetry ({taskMetrics.total} tasks)
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
                gap: 2,
              }}
            >
              <MetricCard
                label="Total Tasks Executed"
                value={taskMetrics.total.toString()}
                subtitle={`${taskMetrics.running} currently running`}
                icon={<Activity size={20} color={tokens.colors.accentPrimary} />}
              />
              <MetricCard
                label="Task Success Rate"
                value={taskMetrics.successRatePct !== null ? `${taskMetrics.successRatePct}%` : '--'}
                subtitle={`${taskMetrics.completed} of ${taskMetrics.terminalCount} terminal tasks`}
                icon={<CheckCircle2 size={20} color={tokens.colors.success} />}
              />
              <MetricCard
                label="Average Execution Time"
                value={taskMetrics.avgDuration}
                subtitle={`Min: ${taskMetrics.minDuration} | Max: ${taskMetrics.maxDuration}`}
                icon={<Clock size={20} color={tokens.colors.accentWarning} />}
              />
              <MetricCard
                label="Total Governed Tool Calls"
                value={taskMetrics.totalToolCalls.toLocaleString()}
                subtitle={`Across ${taskMetrics.totalIterations.toLocaleString()} agent iterations`}
                icon={<Gauge size={20} color={tokens.colors.accentSecondary} />}
              />
            </Box>
          </Box>

          {/* Section 2: Task Status Distribution */}
          <Panel sx={{ p: 2.5 }}>
            <Typography variant="h6" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: tokens.colors.text.primary, mb: 2 }}>
              Execution Lifecycle Breakdown
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(5, 1fr)' },
                gap: 2,
              }}
            >
              <Box sx={{ p: 1.5, borderRadius: '6px', backgroundColor: tokens.colors.surfaceElevated }}>
                <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mb: 0.5 }}>Completed</Typography>
                <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: tokens.colors.success }}>
                  {taskMetrics.completed}
                </Typography>
              </Box>
              <Box sx={{ p: 1.5, borderRadius: '6px', backgroundColor: tokens.colors.surfaceElevated }}>
                <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mb: 0.5 }}>Failed</Typography>
                <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: tokens.colors.error }}>
                  {taskMetrics.failed}
                </Typography>
              </Box>
              <Box sx={{ p: 1.5, borderRadius: '6px', backgroundColor: tokens.colors.surfaceElevated }}>
                <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mb: 0.5 }}>Cancelled</Typography>
                <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: tokens.colors.text.muted }}>
                  {taskMetrics.cancelled}
                </Typography>
              </Box>
              <Box sx={{ p: 1.5, borderRadius: '6px', backgroundColor: tokens.colors.surfaceElevated }}>
                <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mb: 0.5 }}>Running</Typography>
                <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: tokens.colors.warning }}>
                  {taskMetrics.running}
                </Typography>
              </Box>
              <Box sx={{ p: 1.5, borderRadius: '6px', backgroundColor: tokens.colors.surfaceElevated }}>
                <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mb: 0.5 }}>Queued / Created</Typography>
                <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: tokens.colors.text.primary }}>
                  {taskMetrics.created}
                </Typography>
              </Box>
            </Box>
          </Panel>

          {/* Section 3: Evaluation Benchmark Metrics */}
          <Box>
            <Typography variant="h6" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: tokens.colors.text.primary, mb: 1.5 }}>
              Evaluation Benchmark Telemetry ({evalMetrics.totalRuns} reports)
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
                gap: 2,
              }}
            >
              <MetricCard
                label="Benchmark Pass Rate"
                value={evalMetrics.passRatePct !== null ? `${evalMetrics.passRatePct}%` : '--'}
                subtitle={`${evalMetrics.passedScenarios} of ${evalMetrics.totalScenarios} scenarios passed`}
                icon={<FlaskConical size={20} color={tokens.colors.accentPrimary} />}
              />
              <MetricCard
                label="Total Scenarios Evaluated"
                value={evalMetrics.totalScenarios.toLocaleString()}
                subtitle={`Across ${evalMetrics.totalRuns} historical runs`}
                icon={<Layers size={20} color={tokens.colors.accentSuccess} />}
              />
              <MetricCard
                label="Benchmark Failures"
                value={evalMetrics.failedScenarios.toLocaleString()}
                subtitle="Identified policy, budget, or reliability faults"
                icon={<XCircle size={20} color={evalMetrics.failedScenarios > 0 ? tokens.colors.error : tokens.colors.text.muted} />}
              />
            </Box>
          </Box>
        </Stack>
      )}
    </Box>
  );
};

export default MetricsPage;
