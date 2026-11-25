import React, { useState } from 'react';
import {
  Box,
  Breadcrumbs,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Link,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { MetricCard } from '../components/common/MetricCard';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';
import { StatusBadge } from '../components/common/StatusBadge';
import { ScenarioResultsList } from '../components/evaluation/ScenarioResultsList';
import { BenchmarkMetricsTable } from '../components/evaluation/BenchmarkMetricsTable';
import { tokens } from '../theme/tokens';
import { useEvaluationReport } from '../api/hooks';
import { apiClient } from '../api/client';

export const EvaluationReportDetailPage: React.FC = () => {
  const { experimentId = '' } = useParams<{ experimentId: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<number>(0);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewFormat, setPreviewFormat] = useState<'json' | 'markdown'>('markdown');
  const [previewContent, setPreviewContent] = useState<string>('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const {
    data: report,
    isLoading,
    error,
    refetch,
  } = useEvaluationReport(experimentId);

  const handleDownload = async (format: 'json' | 'markdown') => {
    try {
      const ext = format === 'markdown' ? 'md' : 'json';
      const text = await apiClient.getEvaluationArtifact(experimentId, format);
      const blob = new Blob([text], {
        type: format === 'markdown' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report_${experimentId}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download report artifact:', err);
    }
  };

  const handleOpenPreview = async (format: 'json' | 'markdown') => {
    setPreviewFormat(format);
    setPreviewModalOpen(true);
    setIsPreviewLoading(true);
    try {
      const content = await apiClient.getEvaluationArtifact(experimentId, format);
      setPreviewContent(content);
    } catch {
      setPreviewContent(`Unable to load ${format} artifact.`);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <LoadingSkeleton variant="card" rows={3} />
      </Box>
    );
  }

  if (error || !report) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Button
          startIcon={<ArrowLeft size={16} />}
          onClick={() => navigate('/evaluations')}
          sx={{
            mb: 2,
            color: tokens.colors.textMuted,
            textTransform: 'none',
            fontSize: tokens.typography.fontSize.sm,
            '&:hover': { color: tokens.colors.primary },
          }}
        >
          Back to Evaluations
        </Button>
        <ErrorState
          title="Evaluation Report Not Found"
          message={error?.message || `The evaluation report '${experimentId}' was not found or could not be loaded.`}
          onRetry={refetch}
        />
      </Box>
    );
  }

  const passRate = report.summary_metrics.pass_rate_pct ?? (
    report.total_scenarios > 0 ? (report.passed / report.total_scenarios) * 100 : 0
  );

  const formattedDate = report.timestamp
    ? new Date(report.timestamp).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      })
    : '--';

  const statusColor =
    report.overall_status === 'pass'
      ? tokens.colors.success
      : report.overall_status === 'fail'
      ? tokens.colors.error
      : tokens.colors.primary;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Breadcrumbs */}
      <Breadcrumbs
        separator={<ChevronRight size={14} color={tokens.colors.textSubtle} />}
        sx={{ mb: 2 }}
      >
        <Link
          component={RouterLink}
          to="/evaluations"
          underline="hover"
          sx={{
            color: tokens.colors.textMuted,
            fontSize: tokens.typography.fontSize.xs,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            '&:hover': { color: tokens.colors.primary },
          }}
        >
          Evaluations
        </Link>
        <Typography
          sx={{
            color: tokens.colors.textPrimary,
            fontSize: tokens.typography.fontSize.xs,
            fontWeight: 600,
            fontFamily: tokens.typography.fontFamily.mono,
          }}
        >
          {report.experiment_id}
        </Typography>
      </Breadcrumbs>

      {/* Back button */}
      <Button
        startIcon={<ArrowLeft size={16} />}
        onClick={() => navigate('/evaluations')}
        sx={{
          mb: 2,
          color: tokens.colors.textMuted,
          textTransform: 'none',
          fontSize: tokens.typography.fontSize.xs,
          p: 0,
          '&:hover': { color: tokens.colors.primary, backgroundColor: 'transparent' },
        }}
      >
        Back to Evaluations
      </Button>

      {/* Header */}
      <PageHeader
        title={`Evaluation Report: ${report.experiment_id}`}
        description={`${report.name} — executed at ${formattedDate}`}
        action={
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <StatusBadge status={report.overall_status} size="medium" />

            <Button
              variant="outlined"
              size="small"
              startIcon={<FileText size={14} />}
              onClick={() => handleOpenPreview('markdown')}
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
              View Markdown
            </Button>

            <Button
              variant="outlined"
              size="small"
              startIcon={<Download size={14} />}
              onClick={() => handleDownload('json')}
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
              JSON
            </Button>

            <Button
              variant="contained"
              size="small"
              startIcon={<Download size={14} />}
              onClick={() => handleDownload('markdown')}
              sx={{
                backgroundColor: tokens.colors.primary,
                color: tokens.colors.backgroundRoot,
                fontWeight: 600,
                textTransform: 'none',
                fontSize: tokens.typography.fontSize.xs,
                '&:hover': { backgroundColor: tokens.colors.primaryHover },
              }}
            >
              Markdown
            </Button>
          </Stack>
        }
      />

      {/* Summary Cards */}
      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              label="Overall Outcome"
              value={report.overall_status.toUpperCase()}
              subtitle={report.overall_status === 'pass' ? 'All assertions satisfied' : 'Failures detected'}
              statusColor={statusColor}
              tooltip="Consolidated result of all evaluated scenarios"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              label="Pass Rate"
              value={`${passRate.toFixed(1)}%`}
              subtitle={`${report.passed} of ${report.total_scenarios} scenarios passed`}
              statusColor={passRate === 100 ? tokens.colors.success : tokens.colors.warning}
              tooltip="Percentage of deterministic scenarios that passed successfully"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              label="Assertions Summary"
              value={`${report.summary_metrics.assertions_passed ?? report.passed} / ${report.summary_metrics.total_assertions ?? report.total_scenarios}`}
              subtitle={
                report.summary_metrics.assertions_failed
                  ? `${report.summary_metrics.assertions_failed} assertions failed`
                  : 'Zero assertion failures'
              }
              statusColor={tokens.colors.primaryLight}
              tooltip="Total assertion checks across all scenarios"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              label="Total Duration"
              value={`${(report.duration_ms / 1000).toFixed(2)}s`}
              subtitle={`${report.duration_ms.toFixed(0)} ms total runtime`}
              statusColor={tokens.colors.secondary}
              tooltip="End-to-end execution time for the complete evaluation suite"
            />
          </Grid>
        </Grid>
      </Box>

      {/* Content Tabs */}
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
              icon={<ShieldCheck size={16} />}
              iconPosition="start"
              label={`Scenario Results (${report.scenario_results.length})`}
            />
            {report.benchmarks.length > 0 && (
              <Tab
                icon={<Clock size={16} />}
                iconPosition="start"
                label={`Performance Benchmarks (${report.benchmarks.length})`}
              />
            )}
            <Tab
              icon={<Server size={16} />}
              iconPosition="start"
              label="Environment Info"
            />
          </Tabs>
        }
      >
        <Box sx={{ mt: 2 }}>
          {activeTab === 0 && (
            <ScenarioResultsList scenarioResults={report.scenario_results} />
          )}

          {activeTab === 1 && report.benchmarks.length > 0 && (
            <BenchmarkMetricsTable benchmarks={report.benchmarks} />
          )}

          {(activeTab === 2 || (activeTab === 1 && report.benchmarks.length === 0)) && (
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: tokens.typography.fontSize.md, color: tokens.colors.textPrimary, mb: 2 }}>
                Runtime Execution Environment
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <Box
                    sx={{
                      p: 2,
                      backgroundColor: tokens.colors.surfaceSubtle,
                      borderRadius: `${tokens.borderRadius.md}px`,
                      border: `1px solid ${tokens.colors.border}`,
                    }}
                  >
                    <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textMuted, textTransform: 'uppercase', mb: 0.5 }}>
                      Host Platform
                    </Typography>
                    <Typography sx={{ fontFamily: tokens.typography.fontFamily.mono, fontSize: tokens.typography.fontSize.sm, color: tokens.colors.textPrimary }}>
                      {String(report.environment_info.platform || 'Unknown')}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Box
                    sx={{
                      p: 2,
                      backgroundColor: tokens.colors.surfaceSubtle,
                      borderRadius: `${tokens.borderRadius.md}px`,
                      border: `1px solid ${tokens.colors.border}`,
                    }}
                  >
                    <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textMuted, textTransform: 'uppercase', mb: 0.5 }}>
                      Python Engine Version
                    </Typography>
                    <Typography sx={{ fontFamily: tokens.typography.fontFamily.mono, fontSize: tokens.typography.fontSize.sm, color: tokens.colors.textPrimary }}>
                      {String(report.environment_info.python_version || 'Python 3.10+')}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <Box
                    sx={{
                      p: 2,
                      backgroundColor: tokens.colors.surfaceSubtle,
                      borderRadius: `${tokens.borderRadius.md}px`,
                      border: `1px solid ${tokens.colors.border}`,
                    }}
                  >
                    <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textMuted, textTransform: 'uppercase', mb: 0.5 }}>
                      CPU Architecture
                    </Typography>
                    <Typography sx={{ fontFamily: tokens.typography.fontFamily.mono, fontSize: tokens.typography.fontSize.sm, color: tokens.colors.textPrimary }}>
                      {String(report.environment_info.architecture || 'x86_64')}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}
        </Box>
      </Panel>

      {/* Artifact Preview Dialog */}
      <Dialog
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: tokens.colors.surfacePrimary,
            border: `1px solid ${tokens.colors.border}`,
            borderRadius: `${tokens.borderRadius.lg}px`,
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${tokens.colors.border}`,
            py: 1.5,
            px: 2.5,
          }}
        >
          <Typography sx={{ fontWeight: 600, fontSize: tokens.typography.fontSize.md, color: tokens.colors.textPrimary }}>
            Artifact Preview: report_{report.experiment_id}.{previewFormat === 'markdown' ? 'md' : 'json'}
          </Typography>
          <IconButton size="small" onClick={() => setPreviewModalOpen(false)} sx={{ color: tokens.colors.textMuted }}>
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 2.5 }}>
          {isPreviewLoading ? (
            <LoadingSkeleton variant="text" rows={5} />
          ) : (
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 2,
                backgroundColor: tokens.colors.surfaceSubtle,
                borderRadius: `${tokens.borderRadius.sm}px`,
                border: `1px solid ${tokens.colors.border}`,
                color: tokens.colors.textPrimary,
                fontFamily: tokens.typography.fontFamily.mono,
                fontSize: tokens.typography.fontSize.xs,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: '65vh',
                overflowY: 'auto',
              }}
            >
              {previewContent}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};
