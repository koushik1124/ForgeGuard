import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  X,
  ShieldCheck,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { tokens } from '../../theme/tokens';
import { useEvaluationRun, queryKeys } from '../../api/hooks';

export interface ActiveEvaluationBannerProps {
  runId: string;
  onDismiss?: () => void;
}

export const ActiveEvaluationBanner: React.FC<ActiveEvaluationBannerProps> = ({
  runId,
  onDismiss,
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lastTerminalRunId = useRef<string | null>(null);

  const { data: run, isLoading, error } = useEvaluationRun(runId, !!runId);

  const status = run?.status || 'queued';
  const isTerminal = status === 'completed' || status === 'failed';
  const isRunning = status === 'running' || status === 'queued';

  // Automatically refresh historical evaluation reports when run completes
  useEffect(() => {
    if (isTerminal && run?.run_id && lastTerminalRunId.current !== run.run_id) {
      lastTerminalRunId.current = run.run_id;
      queryClient.invalidateQueries({ queryKey: queryKeys.evaluationReports });
      queryClient.invalidateQueries({ queryKey: queryKeys.evaluationRuns });
    }
  }, [isTerminal, run?.run_id, queryClient]);

  if (isLoading && !run) {
    return (
      <Box
        sx={{
          mb: 3,
          p: 2,
          borderRadius: 1.5,
          backgroundColor: tokens.colors.surfaceElevated,
          border: `1px solid ${tokens.colors.border}`,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <RefreshCw size={16} className="animate-spin" color={tokens.colors.primary} />
          <Typography sx={{ fontSize: tokens.typography.fontSize.sm, color: tokens.colors.textMuted }}>
            Connecting to evaluation runner...
          </Typography>
        </Stack>
      </Box>
    );
  }

  if (error || !run) {
    return (
      <Alert
        severity="error"
        action={
          onDismiss && (
            <Button color="inherit" size="small" onClick={onDismiss}>
              Dismiss
            </Button>
          )
        }
        sx={{
          mb: 3,
          backgroundColor: tokens.colors.errorSubtle,
          color: tokens.colors.error,
          border: `1px solid rgba(241, 108, 120, 0.3)`,
        }}
      >
        Failed to fetch evaluation run state: {error?.message || 'Run not found'}
      </Alert>
    );
  }

  const total = run.total_scenarios || 1;
  const completed = run.completed_scenarios || 0;
  const progressPct = Math.min(100, Math.round((completed / total) * 100));

  const formatDuration = (ms: number) => {
    if (ms <= 0) return '0 ms';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'running':
        return (
          <Chip
            size="small"
            icon={<RefreshCw size={12} className="animate-spin" />}
            label="RUNNING"
            sx={{
              backgroundColor: tokens.colors.primarySubtle,
              color: tokens.colors.primaryLight,
              borderColor: tokens.colors.primary,
              fontWeight: 700,
              fontSize: '0.7rem',
              height: 22,
            }}
            variant="outlined"
          />
        );
      case 'queued':
        return (
          <Chip
            size="small"
            label="QUEUED"
            sx={{
              backgroundColor: 'rgba(240, 180, 90, 0.12)',
              color: tokens.colors.warning,
              borderColor: tokens.colors.warning,
              fontWeight: 700,
              fontSize: '0.7rem',
              height: 22,
            }}
            variant="outlined"
          />
        );
      case 'completed':
        const hasFailures = run.failed > 0 || run.errors > 0;
        return (
          <Chip
            size="small"
            icon={hasFailures ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
            label={hasFailures ? 'COMPLETED WITH FAILURES' : 'COMPLETED'}
            sx={{
              backgroundColor: hasFailures ? tokens.colors.errorSubtle : tokens.colors.successSubtle,
              color: hasFailures ? tokens.colors.error : tokens.colors.success,
              borderColor: hasFailures ? tokens.colors.error : tokens.colors.success,
              fontWeight: 700,
              fontSize: '0.7rem',
              height: 22,
            }}
            variant="outlined"
          />
        );
      case 'failed':
        return (
          <Chip
            size="small"
            icon={<AlertTriangle size={12} />}
            label="FAILED"
            sx={{
              backgroundColor: tokens.colors.errorSubtle,
              color: tokens.colors.error,
              borderColor: tokens.colors.error,
              fontWeight: 700,
              fontSize: '0.7rem',
              height: 22,
            }}
            variant="outlined"
          />
        );
      default:
        return <Chip size="small" label={status.toUpperCase()} />;
    }
  };

  return (
    <Box
      sx={{
        mb: 3,
        p: 2.5,
        borderRadius: 2,
        backgroundColor: tokens.colors.surfaceElevated,
        border: `1px solid ${isRunning ? tokens.colors.primary : tokens.colors.border}`,
        boxShadow: isRunning ? `0 0 16px ${tokens.colors.primaryGlow}` : 'none',
        transition: 'all 0.2s ease-in-out',
      }}
    >
      {/* Top Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1,
              backgroundColor: isRunning ? tokens.colors.primarySubtle : tokens.colors.surfacePrimary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isRunning ? tokens.colors.primary : tokens.colors.textMuted,
            }}
          >
            <Activity size={18} />
          </Box>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ fontWeight: 600, fontSize: tokens.typography.fontSize.base, color: tokens.colors.textPrimary }}>
                {run.name}
              </Typography>
              {getStatusBadge()}
            </Stack>
            <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textMuted, fontFamily: tokens.fonts.mono }}>
              Run ID: {run.run_id}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          <Typography
            sx={{
              fontSize: tokens.typography.fontSize.xs,
              fontFamily: tokens.fonts.mono,
              color: tokens.colors.textMuted,
            }}
          >
            Duration: {formatDuration(run.duration_ms)}
          </Typography>
          {isTerminal && onDismiss && (
            <Button
              size="small"
              onClick={onDismiss}
              sx={{
                minWidth: 'auto',
                p: 0.5,
                color: tokens.colors.textMuted,
                '&:hover': { color: tokens.colors.textPrimary },
              }}
            >
              <X size={16} />
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Progress Bar */}
      <Box sx={{ mb: 1.5 }}>
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textMuted }}>
            Execution Progress: <strong>{completed}</strong> / <strong>{total}</strong> scenarios ({progressPct}%)
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.success, fontWeight: 600 }}>
              Passed: {run.passed}
            </Typography>
            <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.error, fontWeight: 600 }}>
              Failed: {run.failed}
            </Typography>
            {run.errors > 0 && (
              <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.warning, fontWeight: 600 }}>
                Errors: {run.errors}
              </Typography>
            )}
          </Stack>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={progressPct}
          sx={{
            height: 6,
            borderRadius: 3,
            backgroundColor: tokens.colors.surfacePrimary,
            '& .MuiLinearProgress-bar': {
              backgroundColor: run.failed > 0 ? tokens.colors.warning : tokens.colors.primary,
              borderRadius: 3,
            },
          }}
        />
      </Box>

      {/* Live Active Scenario Indicator */}
      {isRunning && run.current_scenario_id && (
        <Box
          sx={{
            p: 1.25,
            mb: 1.5,
            borderRadius: 1,
            backgroundColor: tokens.colors.surfacePrimary,
            border: `1px solid ${tokens.colors.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: tokens.colors.primary,
                boxShadow: `0 0 8px ${tokens.colors.primary}`,
                animation: 'pulse 1.5s infinite',
                '@keyframes pulse': {
                  '0%': { opacity: 0.4 },
                  '50%': { opacity: 1 },
                  '100%': { opacity: 0.4 },
                },
              }}
            />
            <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textMuted }}>
              Currently Executing:
            </Typography>
            <Typography sx={{ fontSize: tokens.typography.fontSize.xs, fontFamily: tokens.fonts.mono, color: tokens.colors.primaryLight }}>
              {run.current_scenario_id}
            </Typography>
            {run.current_scenario_name && (
              <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textPrimary }}>
                — {run.current_scenario_name}
              </Typography>
            )}
          </Stack>
        </Box>
      )}

      {/* Terminal Completed Callout & Action */}
      {isTerminal && (
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          spacing={1.5}
          sx={{
            pt: 1,
            borderTop: `1px solid ${tokens.colors.borderSubtle}`,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <ShieldCheck size={16} color={run.failed > 0 ? tokens.colors.warning : tokens.colors.success} />
            <Typography sx={{ fontSize: tokens.typography.fontSize.sm, color: tokens.colors.textPrimary }}>
              {run.status === 'completed'
                ? `Evaluation Run Complete. Generated report ${run.report_id || run.run_id}.`
                : `Evaluation Run Terminated: ${run.error_summary || 'Unknown failure'}`}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              size="small"
              onClick={() => navigate(`/evaluations/${run.report_id || run.run_id}`)}
              endIcon={<ExternalLink size={14} />}
              sx={{
                backgroundColor: tokens.colors.primary,
                color: '#0B0D12',
                fontWeight: 600,
                textTransform: 'none',
                fontSize: tokens.typography.fontSize.xs,
                '&:hover': {
                  backgroundColor: tokens.colors.primaryHover,
                },
              }}
            >
              View Full Report
            </Button>
            {onDismiss && (
              <Button
                variant="outlined"
                size="small"
                onClick={onDismiss}
                sx={{
                  borderColor: tokens.colors.border,
                  color: tokens.colors.textMuted,
                  textTransform: 'none',
                  fontSize: tokens.typography.fontSize.xs,
                  '&:hover': {
                    borderColor: tokens.colors.borderHover,
                    color: tokens.colors.textPrimary,
                  },
                }}
              >
                Dismiss
              </Button>
            )}
          </Stack>
        </Stack>
      )}
    </Box>
  );
};
