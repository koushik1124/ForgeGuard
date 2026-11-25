import React from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Stack,
  Typography,
} from '@mui/material';
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Play,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { TaskDiagnosticsResponse, TaskResponse } from '../../api/types';
import {
  determineRecoveryAssessment,
  RecoveryAssessmentResult,
} from '../../api/recovery/extractor';

export interface RecoveryAssessmentBannerProps {
  task?: TaskResponse | null;
  diagnostics?: TaskDiagnosticsResponse | null;
  isDiagnosticsLoading?: boolean;
  onResumeClick: () => void;
  isResumePending?: boolean;
}

export const RecoveryAssessmentBanner: React.FC<RecoveryAssessmentBannerProps> = ({
  task,
  diagnostics,
  isDiagnosticsLoading = false,
  onResumeClick,
  isResumePending = false,
}) => {
  const [showReasons, setShowReasons] = React.useState(false);

  const assessment: RecoveryAssessmentResult = determineRecoveryAssessment(
    task,
    diagnostics,
    isDiagnosticsLoading
  );

  // Styling maps based on assessment state
  const config = React.useMemo(() => {
    switch (assessment.state) {
      case 'safe_to_resume':
        return {
          borderColor: 'rgba(53, 201, 138, 0.4)',
          backgroundColor: 'rgba(53, 201, 138, 0.06)',
          icon: <ShieldCheck size={22} color={tokens.colors.success} />,
          badgeColor: tokens.colors.success,
          badgeBg: tokens.colors.successSubtle,
          badgeLabel: 'SAFE TO RESUME',
        };
      case 'blocked_uncertain':
        return {
          borderColor: 'rgba(241, 108, 120, 0.4)',
          backgroundColor: 'rgba(241, 108, 120, 0.06)',
          icon: <AlertOctagon size={22} color={tokens.colors.error} />,
          badgeColor: tokens.colors.error,
          badgeBg: tokens.colors.errorSubtle,
          badgeLabel: 'RESUME BLOCKED: UNCERTAIN SIDE-EFFECTS',
        };
      case 'blocked_budget':
        return {
          borderColor: 'rgba(240, 180, 90, 0.4)',
          backgroundColor: 'rgba(240, 180, 90, 0.06)',
          icon: <AlertTriangle size={22} color={tokens.colors.warning} />,
          badgeColor: tokens.colors.warning,
          badgeBg: tokens.colors.warningSubtle,
          badgeLabel: 'RESUME BLOCKED: BUDGET EXHAUSTED',
        };
      case 'blocked_running':
        return {
          borderColor: 'rgba(124, 140, 255, 0.4)',
          backgroundColor: 'rgba(124, 140, 255, 0.06)',
          icon: <RotateCw size={22} color={tokens.colors.accentPrimary} className="spin" />,
          badgeColor: tokens.colors.accentPrimary,
          badgeBg: tokens.colors.primarySubtle,
          badgeLabel: 'TASK ACTIVE (RUNNING)',
        };
      case 'blocked_terminal':
        return {
          borderColor: tokens.colors.borderSubtle,
          backgroundColor: tokens.colors.surfaceElevated,
          icon:
            task?.status === 'completed' ? (
              <CheckCircle size={22} color={tokens.colors.success} />
            ) : (
              <XCircle size={22} color={tokens.colors.text.muted} />
            ),
          badgeColor: tokens.colors.text.secondary,
          badgeBg: 'rgba(146, 155, 172, 0.1)',
          badgeLabel: `TERMINAL: ${task?.status?.toUpperCase() || 'COMPLETED'}`,
        };
      case 'assessment_loading':
        return {
          borderColor: tokens.colors.borderSubtle,
          backgroundColor: tokens.colors.surfaceElevated,
          icon: <CircularProgress size={20} sx={{ color: tokens.colors.accentPrimary }} />,
          badgeColor: tokens.colors.text.muted,
          badgeBg: 'rgba(146, 155, 172, 0.1)',
          badgeLabel: 'EVALUATING PRECONDITIONS...',
        };
      case 'assessment_unavailable':
      case 'blocked_other':
      default:
        return {
          borderColor: 'rgba(240, 180, 90, 0.3)',
          backgroundColor: tokens.colors.surfaceElevated,
          icon: <ShieldAlert size={22} color={tokens.colors.warning} />,
          badgeColor: tokens.colors.warning,
          badgeBg: tokens.colors.warningSubtle,
          badgeLabel: 'RESUME BLOCKED',
        };
    }
  }, [assessment.state, task?.status]);

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: `${tokens.borderRadius.md}px`,
        backgroundColor: config.backgroundColor,
        border: `1px solid ${config.borderColor}`,
        transition: 'border-color 0.2s ease-in-out',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        {/* Left: Icon, Badge, Title & Rationale */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flex: 1, minWidth: 280 }}>
          <Box sx={{ mt: 0.5 }}>{config.icon}</Box>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                {assessment.title}
              </Typography>
              <Chip
                label={config.badgeLabel}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  backgroundColor: config.badgeBg,
                  color: config.badgeColor,
                  borderRadius: '4px',
                  fontFamily: tokens.typography.fontFamily.mono,
                }}
              />
            </Box>

            <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.secondary, lineHeight: 1.5 }}>
              {assessment.description}
            </Typography>

            {/* Invariant Note */}
            <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, mt: 0.5 }}>
              Governance rule: <em>LLM proposes; ForgeGuard authorizes and executes.</em> Resumption is guarded by
              precondition and side-effect verification.
            </Typography>
          </Box>
        </Box>

        {/* Right: Actions */}
        <Stack direction="row" spacing={1.5} alignItems="center">
          {assessment.reasons.length > 0 && (
            <Button
              size="small"
              variant="text"
              onClick={() => setShowReasons(!showReasons)}
              endIcon={showReasons ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              sx={{
                fontSize: '0.75rem',
                textTransform: 'none',
                color: tokens.colors.text.secondary,
              }}
            >
              {showReasons ? 'Hide Evidence' : `View Details (${assessment.reasons.length})`}
            </Button>
          )}

          {/* Resume Action Button - rendered only when strictly safe to resume */}
          {assessment.isResumable && (
            <Button
              variant="contained"
              size="small"
              onClick={onResumeClick}
              disabled={isResumePending}
              startIcon={isResumePending ? <CircularProgress size={14} color="inherit" /> : <Play size={14} />}
              sx={{
                fontSize: '0.8125rem',
                fontWeight: 600,
                textTransform: 'none',
                backgroundColor: tokens.colors.accentPrimary,
                color: '#FFFFFF',
                px: 2,
                '&:hover': {
                  backgroundColor: tokens.colors.primaryHover,
                },
              }}
            >
              {isResumePending ? 'Resuming...' : 'Resume from Checkpoint'}
            </Button>
          )}
        </Stack>
      </Box>

      {/* Expandable Reasons & Uncertain Calls details */}
      <Collapse in={showReasons && assessment.reasons.length > 0} unmountOnExit>
        <Box
          sx={{
            mt: 2,
            pt: 2,
            borderTop: `1px solid ${tokens.colors.borderSubtle}`,
          }}
        >
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: tokens.colors.text.muted, mb: 1, textTransform: 'uppercase' }}>
            Precondition Evaluation & Evidence Logs
          </Typography>
          <Stack spacing={0.75}>
            {assessment.reasons.map((reason, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <AlertCircle size={14} color={tokens.colors.text.muted} style={{ marginTop: 2, flexShrink: 0 }} />
                <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.secondary, fontFamily: tokens.typography.fontFamily.mono }}>
                  {reason}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
};
