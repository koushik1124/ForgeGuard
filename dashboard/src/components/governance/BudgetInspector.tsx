import React from 'react';
import {
  Alert,
  Box,
  Chip,
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import {
  AlertOctagon,
  Clock,
  Database,
  Gauge,
  ShieldAlert,
  Wrench,
  Zap,
} from 'lucide-react';
import { BudgetMetric, BudgetThresholdStatus, TaskBudgetState } from '../../api/governance/types';
import { tokens } from '../../theme/tokens';

interface BudgetInspectorProps {
  budgetState: TaskBudgetState;
  metrics: BudgetMetric[];
}

export const BudgetInspector: React.FC<BudgetInspectorProps> = ({ budgetState, metrics }) => {
  if (!budgetState.hasEvents && metrics.every((m) => m.limit === null && m.used === 0)) {
    return (
      <Box
        sx={{
          p: 4,
          textAlign: 'center',
          backgroundColor: tokens.colors.surfaceElevated,
          borderRadius: `${tokens.borderRadius.sm}px`,
          border: `1px dashed ${tokens.colors.borderSubtle}`,
        }}
      >
        <Gauge size={32} color={tokens.colors.text.disabled} style={{ marginBottom: 8 }} />
        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: tokens.colors.text.secondary }}>
          No Budget Events Recorded
        </Typography>
        <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mt: 0.5 }}>
          Execution budget limits have not been initialized or updated for this task.
        </Typography>
      </Box>
    );
  }

  const getStatusColor = (status: BudgetThresholdStatus) => {
    switch (status) {
      case 'exhausted':
        return tokens.colors.error;
      case 'critical':
        return tokens.colors.error;
      case 'warning':
        return tokens.colors.warning;
      case 'normal':
        return tokens.colors.success;
      default:
        return tokens.colors.text.muted;
    }
  };

  const getMetricIcon = (id: string) => {
    switch (id) {
      case 'tool_calls':
        return <Wrench size={16} color={tokens.colors.primaryLight} />;
      case 'execution_duration':
        return <Clock size={16} color={tokens.colors.primaryLight} />;
      case 'output_bytes':
        return <Database size={16} color={tokens.colors.primaryLight} />;
      case 'consecutive_failures':
        return <ShieldAlert size={16} color={tokens.colors.warning} />;
      default:
        return <Zap size={16} color={tokens.colors.primaryLight} />;
    }
  };

  return (
    <Box>
      {/* Exceeded Limit Alert Banner */}
      {budgetState.isExceeded && (
        <Alert
          severity="error"
          icon={<AlertOctagon size={18} />}
          sx={{
            mb: 2.5,
            backgroundColor: 'rgba(241, 108, 120, 0.1)',
            borderColor: tokens.colors.error,
            color: tokens.colors.text.primary,
            '& .MuiAlert-icon': { color: tokens.colors.error },
          }}
        >
          <Box>
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, color: tokens.colors.error }}>
              Execution Budget Exceeded ({budgetState.exceededLimit || 'Budget Limit'})
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.secondary, mt: 0.25 }}>
              {budgetState.exceededReason || 'Execution exceeded its allocated resource constraints and was halted.'}
            </Typography>
          </Box>
        </Alert>
      )}

      {/* 4 Primary Metric Cards */}
      <Grid container spacing={2}>
        {metrics.map((metric) => {
          const statusColor = getStatusColor(metric.status);
          const percent = metric.percentUsed ?? 0;

          return (
            <Grid item xs={12} sm={6} md={3} key={metric.id}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: `${tokens.borderRadius.sm}px`,
                  backgroundColor: tokens.colors.surfaceElevated,
                  border: `1px solid ${
                    metric.status === 'exhausted' || metric.status === 'critical'
                      ? 'rgba(241, 108, 120, 0.4)'
                      : tokens.colors.borderSubtle
                  }`,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  height: '100%',
                }}
              >
                {/* Metric Title & Status Badge */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {getMetricIcon(metric.id)}
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: tokens.colors.text.secondary }}>
                      {metric.name}
                    </Typography>
                  </Stack>

                  <Chip
                    label={metric.status.toUpperCase()}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      backgroundColor:
                        metric.status === 'exhausted' || metric.status === 'critical'
                          ? tokens.colors.errorSubtle
                          : metric.status === 'warning'
                          ? tokens.colors.warningSubtle
                          : tokens.colors.successSubtle,
                      color: statusColor,
                      border: `1px solid ${statusColor}40`,
                    }}
                  />
                </Box>

                {/* Used vs Limit Numbers */}
                <Box sx={{ mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                    <Typography
                      sx={{
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        fontFamily: tokens.typography.fontFamily.mono,
                        color: tokens.colors.text.primary,
                      }}
                    >
                      {metric.formattedUsed}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: '0.75rem',
                        fontFamily: tokens.typography.fontFamily.mono,
                        color: tokens.colors.text.muted,
                      }}
                    >
                      / {metric.formattedLimit}
                    </Typography>
                  </Box>

                  <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, mt: 0.25 }}>
                    Remaining: {metric.formattedRemaining}
                  </Typography>
                </Box>

                {/* Linear Progress Bar */}
                <Box sx={{ mt: 'auto' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography sx={{ fontSize: '0.625rem', color: tokens.colors.text.muted }}>
                      Consumption
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: '0.625rem',
                        fontFamily: tokens.typography.fontFamily.mono,
                        fontWeight: 600,
                        color: statusColor,
                      }}
                    >
                      {metric.percentUsed !== null ? `${metric.percentUsed}%` : '--'}
                    </Typography>
                  </Box>

                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, percent)}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: tokens.colors.backgroundRoot,
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: statusColor,
                        borderRadius: 3,
                      },
                    }}
                  />

                  {/* Sub-details */}
                  {metric.details && (
                    <Typography
                      sx={{
                        fontSize: '0.6875rem',
                        color: tokens.colors.text.muted,
                        mt: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={metric.details}
                    >
                      {metric.details}
                    </Typography>
                  )}
                </Box>
              </Box>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};
