import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Chip,
  Stack,
  Tab,
  Tabs,
} from '@mui/material';
import { RefreshCw, ShieldCheck, History, BookOpen, Play } from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';
import { EvaluationOverviewCards } from '../components/evaluation/EvaluationOverviewCards';
import { HistoricalReportsTable } from '../components/evaluation/HistoricalReportsTable';
import { ScenarioCatalogAccordion } from '../components/evaluation/ScenarioCatalogAccordion';
import { RunEvaluationDialog } from '../components/evaluation/RunEvaluationDialog';
import { ActiveEvaluationBanner } from '../components/evaluation/ActiveEvaluationBanner';
import { tokens } from '../theme/tokens';
import { useEvaluationReports, useEvaluationRuns, useEvaluationScenarios } from '../api/hooks';

export const EvaluationCenterPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [isRunDialogOpen, setIsRunDialogOpen] = useState<boolean>(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const {
    data: catalog,
    isLoading: isCatalogLoading,
    error: catalogError,
    refetch: refetchCatalog,
  } = useEvaluationScenarios();

  const {
    data: reportsData,
    isLoading: isReportsLoading,
    error: reportsError,
    refetch: refetchReports,
    isFetching: isReportsFetching,
  } = useEvaluationReports();

  const { data: runsData, refetch: refetchRuns } = useEvaluationRuns();

  // If backend reports an active run and we aren't tracking one yet, track it
  useEffect(() => {
    if (runsData?.active_run_id && !activeRunId) {
      setActiveRunId(runsData.active_run_id);
    }
  }, [runsData?.active_run_id, activeRunId]);

  const isAnyRunActive = !!runsData?.active_run_id;

  const isLoading = isCatalogLoading && isReportsLoading;
  const isRefreshing = isReportsFetching;

  const handleRefresh = async () => {
    await Promise.allSettled([refetchCatalog(), refetchReports(), refetchRuns()]);
  };

  const handleRunSuccess = (newRunId: string) => {
    setActiveRunId(newRunId);
  };

  if (isLoading) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <LoadingSkeleton variant="card" rows={3} />
      </Box>
    );
  }

  if (catalogError && reportsError) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <ErrorState
          title="Evaluation Center Unavailable"
          message={reportsError.message || catalogError.message}
          onRetry={handleRefresh}
        />
      </Box>
    );
  }

  const reports = reportsData?.reports || [];
  const totalScenarios = catalog?.total_scenarios ?? 20;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Page Header */}
      <PageHeader
        title="Evaluation Center"
        description="Deterministic Scenarios & Historical Benchmark Reports"
        action={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Chip
              icon={<ShieldCheck size={14} color={tokens.colors.primary} />}
              label="Control. Recover. Observe. Evaluate."
              size="small"
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                backgroundColor: tokens.colors.primarySubtle,
                color: tokens.colors.primaryLight,
                borderColor: 'rgba(124, 140, 255, 0.25)',
                fontWeight: 600,
                fontSize: tokens.typography.fontSize.xs,
              }}
              variant="outlined"
            />
            <Button
              variant="outlined"
              size="small"
              onClick={handleRefresh}
              disabled={isRefreshing}
              startIcon={
                <RefreshCw
                  size={14}
                  className={isRefreshing ? 'animate-spin' : undefined}
                />
              }
              sx={{
                borderColor: tokens.colors.border,
                color: tokens.colors.textPrimary,
                textTransform: 'none',
                fontSize: tokens.typography.fontSize.xs,
                '&:hover': {
                  borderColor: tokens.colors.primary,
                  backgroundColor: tokens.colors.surfaceElevated,
                },
              }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={() => setIsRunDialogOpen(true)}
              startIcon={<Play size={14} />}
              sx={{
                backgroundColor: tokens.colors.primary,
                color: '#0B0D12',
                fontWeight: 600,
                textTransform: 'none',
                fontSize: tokens.typography.fontSize.xs,
                px: 2,
                '&:hover': {
                  backgroundColor: tokens.colors.primaryHover,
                },
              }}
            >
              Run Evaluation
            </Button>
          </Stack>
        }
      />

      {/* Active Evaluation Banner */}
      {activeRunId && (
        <ActiveEvaluationBanner
          runId={activeRunId}
          onDismiss={() => setActiveRunId(null)}
        />
      )}

      {/* Top Metric Cards */}
      <EvaluationOverviewCards
        catalog={catalog}
        reports={reports}
        loading={isReportsLoading}
      />

      {/* Main Tabs Panel */}
      <Panel
        title=""
        action={
          <Tabs
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            sx={{
              minHeight: 44,
              '& .MuiTab-root': {
                minHeight: 44,
                py: 1,
                px: 2.5,
                fontSize: tokens.typography.fontSize.sm,
                fontWeight: 500,
                color: tokens.colors.textMuted,
                textTransform: 'none',
                gap: 1,
                '&.Mui-selected': {
                  color: tokens.colors.primary,
                  fontWeight: 600,
                },
              },
              '& .MuiTabs-indicator': {
                backgroundColor: tokens.colors.primary,
              },
            }}
          >
            <Tab
              icon={<History size={16} />}
              iconPosition="start"
              label={`Historical Runs (${reports.length})`}
            />
            <Tab
              icon={<BookOpen size={16} />}
              iconPosition="start"
              label={`Scenario Catalog (${totalScenarios})`}
            />
          </Tabs>
        }
      >
        <Box sx={{ mt: 1 }}>
          {activeTab === 0 ? (
            <HistoricalReportsTable
              reports={reports}
              loading={isReportsLoading || isRefreshing}
            />
          ) : (
            <ScenarioCatalogAccordion
              catalog={catalog}
              loading={isCatalogLoading}
            />
          )}
        </Box>
      </Panel>

      {/* Run Evaluation Dialog */}
      <RunEvaluationDialog
        open={isRunDialogOpen}
        onClose={() => setIsRunDialogOpen(false)}
        onSuccess={handleRunSuccess}
        catalog={catalog}
        isAnyRunActive={isAnyRunActive}
      />
    </Box>
  );
};
