import React from 'react';
import { Box, Grid } from '@mui/material';
import { MetricCard } from '../common/MetricCard';
import { tokens } from '../../theme/tokens';
import { EvaluationReportSummary, ScenarioCatalogResponse } from '../../api/types';

interface EvaluationOverviewCardsProps {
  catalog?: ScenarioCatalogResponse;
  reports?: EvaluationReportSummary[];
  loading?: boolean;
}

export const EvaluationOverviewCards: React.FC<EvaluationOverviewCardsProps> = ({
  catalog,
  reports = [],
  loading = false,
}) => {
  const totalScenarios = catalog?.total_scenarios ?? 20;
  const suitesCount = catalog ? Object.keys(catalog.suites).length : 5;
  const totalRuns = reports.length;

  const latestReport = reports.length > 0 ? reports[0] : null;
  const latestStatus = latestReport ? latestReport.overall_status.toUpperCase() : '--';
  const latestPassRate = latestReport ? `${latestReport.pass_rate_pct.toFixed(1)}%` : '--';
  const latestDate = latestReport?.timestamp
    ? new Date(latestReport.timestamp).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'No historical runs';

  const statusColor =
    latestReport?.overall_status === 'pass'
      ? tokens.colors.success
      : latestReport?.overall_status === 'fail'
      ? tokens.colors.error
      : tokens.colors.primary;

  return (
    <Box sx={{ mb: 3 }}>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Registered Scenarios"
            value={totalScenarios}
            subtitle={`${suitesCount} Governed Suites`}
            statusColor={tokens.colors.primary}
            loading={loading}
            tooltip="Deterministic test scenarios covering reliability, recovery, security, agent, and benchmarks"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Historical Reports"
            value={totalRuns}
            subtitle={totalRuns > 0 ? 'Saved Evaluation Artifacts' : 'No runs recorded'}
            statusColor={tokens.colors.primaryLight}
            loading={loading}
            tooltip="Total experiment evaluation reports stored in eval_reports directory"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Latest Run Status"
            value={latestStatus}
            subtitle={latestReport ? `Pass rate: ${latestPassRate}` : latestDate}
            statusColor={statusColor}
            loading={loading}
            tooltip="Overall status and pass rate of the most recently recorded evaluation experiment"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Latest Run Date"
            value={latestReport ? latestDate : '--'}
            subtitle={latestReport ? `Duration: ${(latestReport.duration_ms / 1000).toFixed(2)}s` : 'Awaiting evaluation'}
            statusColor={tokens.colors.accentSecondary}
            loading={loading}
            tooltip="Execution timestamp and total duration of the latest evaluation run"
          />
        </Grid>
      </Grid>
    </Box>
  );
};
