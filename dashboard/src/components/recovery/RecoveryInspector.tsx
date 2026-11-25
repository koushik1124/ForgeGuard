import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Activity,
  AlertOctagon,
  Bookmark,
  Check,
  Copy,
  LifeBuoy,
  RotateCw,
  ShieldCheck,
} from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { Panel } from '../common/Panel';
import { TaskDiagnosticsResponse } from '../../api/types';
import {
  extractCheckpointForensics,
  extractDiagnostics,
  extractRecoveryTimeline,
} from '../../api/recovery/extractor';
import { FailureDiagnosticsCard } from './FailureDiagnosticsCard';
import { RecoveryTimeline } from './RecoveryTimeline';
import { CheckpointForensicsCard } from './CheckpointForensicsCard';

export interface RecoveryInspectorProps {
  diagnostics?: TaskDiagnosticsResponse | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  taskStatus?: string | null;
}

type RecoveryViewTab = 'overview' | 'diagnostics' | 'timeline' | 'checkpoints';

export const RecoveryInspector: React.FC<RecoveryInspectorProps> = ({
  diagnostics,
  isLoading = false,
  onRefresh,
  taskStatus,
}) => {
  const [activeTab, setActiveTab] = useState<RecoveryViewTab>('overview');
  const [copiedTrace, setCopiedTrace] = useState<boolean>(false);

  const diagnosticItems = React.useMemo(
    () => extractDiagnostics(diagnostics?.diagnostics),
    [diagnostics?.diagnostics]
  );

  const timelineEntries = React.useMemo(
    () => extractRecoveryTimeline(diagnostics?.timeline),
    [diagnostics?.timeline]
  );

  const checkpointForensics = React.useMemo(
    () => extractCheckpointForensics(diagnostics, taskStatus),
    [diagnostics, taskStatus]
  );

  const criticalCount = diagnosticItems.filter((d) => d.severity === 'critical' || d.severity === 'error').length;

  const handleCopyTrace = async () => {
    if (diagnostics?.trace_id && navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(diagnostics.trace_id);
      setCopiedTrace(true);
      setTimeout(() => setCopiedTrace(false), 2000);
    }
  };

  return (
    <Panel sx={{ p: 2.5 }}>
      {/* Header with Title, Trace ID, Refresh, and Tab Switcher */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          mb: 2.5,
          borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
          pb: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <LifeBuoy size={20} color={tokens.colors.accentPrimary} />
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: tokens.colors.text.primary }}>
                Recovery & Failure Diagnostics
              </Typography>
              <Chip
                label="Diagnostics & Forensics"
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  backgroundColor: 'rgba(146, 155, 172, 0.1)',
                  color: tokens.colors.text.muted,
                }}
              />
              {diagnostics?.trace_id && (
                <Tooltip title="Click to copy Trace ID" arrow>
                  <Chip
                    icon={copiedTrace ? <Check size={12} /> : <Copy size={12} />}
                    label={diagnostics.trace_id}
                    size="small"
                    onClick={handleCopyTrace}
                    sx={{
                      height: 22,
                      fontSize: '0.6875rem',
                      fontFamily: tokens.typography.fontFamily.mono,
                      backgroundColor: 'rgba(124, 140, 255, 0.1)',
                      color: tokens.colors.accentPrimary,
                      cursor: 'pointer',
                      borderRadius: '4px',
                    }}
                  />
                </Tooltip>
              )}
              {diagnostics?.recovery_info?.can_resume_safely === false && (
                <Chip
                  label="Unrecoverable Side Effects"
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    backgroundColor: tokens.colors.errorSubtle,
                    color: tokens.colors.error,
                  }}
                />
              )}
            </Box>
            <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mt: 0.25 }}>
              Durable execution state, crash recovery assessments, and failure root-cause analysis
            </Typography>
          </Box>
        </Box>

        {/* Tab Switcher */}
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Button
            size="small"
            variant={activeTab === 'overview' ? 'contained' : 'outlined'}
            onClick={() => setActiveTab('overview')}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              borderRadius: `${tokens.borderRadius.sm}px`,
              borderColor: tokens.colors.borderSubtle,
              backgroundColor: activeTab === 'overview' ? tokens.colors.primarySubtle : 'transparent',
              color: activeTab === 'overview' ? tokens.colors.accentPrimary : tokens.colors.text.secondary,
            }}
          >
            Overview
          </Button>

          <Button
            size="small"
            variant={activeTab === 'diagnostics' ? 'contained' : 'outlined'}
            onClick={() => setActiveTab('diagnostics')}
            startIcon={
              criticalCount > 0 ? (
                <AlertOctagon size={12} color={tokens.colors.error} />
              ) : (
                <ShieldCheck size={12} color={tokens.colors.success} />
              )
            }
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              borderRadius: `${tokens.borderRadius.sm}px`,
              borderColor: tokens.colors.borderSubtle,
              backgroundColor: activeTab === 'diagnostics' ? tokens.colors.primarySubtle : 'transparent',
              color: activeTab === 'diagnostics' ? tokens.colors.accentPrimary : tokens.colors.text.secondary,
            }}
          >
            Diagnostics ({diagnosticItems.length})
          </Button>

          <Button
            size="small"
            variant={activeTab === 'timeline' ? 'contained' : 'outlined'}
            onClick={() => setActiveTab('timeline')}
            startIcon={<Activity size={12} color={tokens.colors.accentPrimary} />}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              borderRadius: `${tokens.borderRadius.sm}px`,
              borderColor: tokens.colors.borderSubtle,
              backgroundColor: activeTab === 'timeline' ? tokens.colors.primarySubtle : 'transparent',
              color: activeTab === 'timeline' ? tokens.colors.accentPrimary : tokens.colors.text.secondary,
            }}
          >
            Timeline ({timelineEntries.length})
          </Button>

          <Button
            size="small"
            variant={activeTab === 'checkpoints' ? 'contained' : 'outlined'}
            onClick={() => setActiveTab('checkpoints')}
            startIcon={<Bookmark size={12} color={tokens.colors.accentPrimary} />}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              borderRadius: `${tokens.borderRadius.sm}px`,
              borderColor: tokens.colors.borderSubtle,
              backgroundColor: activeTab === 'checkpoints' ? tokens.colors.primarySubtle : 'transparent',
              color: activeTab === 'checkpoints' ? tokens.colors.accentPrimary : tokens.colors.text.secondary,
            }}
          >
            Checkpoints ({checkpointForensics.completed_call_count})
          </Button>

          {onRefresh && (
            <Button
              size="small"
              variant="outlined"
              onClick={onRefresh}
              disabled={isLoading}
              startIcon={
                isLoading ? (
                  <CircularProgress size={12} color="inherit" />
                ) : (
                  <RotateCw size={12} />
                )
              }
              sx={{
                fontSize: '0.75rem',
                textTransform: 'none',
                height: 30,
                borderColor: tokens.colors.borderSubtle,
                color: tokens.colors.text.secondary,
              }}
            >
              Refresh
            </Button>
          )}
        </Stack>
      </Box>

      {/* Tab Content */}
      {isLoading && !diagnostics ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <CircularProgress size={24} sx={{ color: tokens.colors.accentPrimary, mb: 1 }} />
          <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.secondary }}>
            Loading diagnostics & recovery data...
          </Typography>
        </Box>
      ) : activeTab === 'overview' ? (
        <Stack spacing={3}>
          {/* Checkpoint Forensics Summary */}
          <CheckpointForensicsCard forensics={checkpointForensics} />

          {/* Failure Diagnostics preview (if any anomalies recorded) */}
          {diagnosticItems.length > 0 && (
            <Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: tokens.colors.text.muted, mb: 1.5, textTransform: 'uppercase' }}>
                Active Diagnostic Anomalies ({diagnosticItems.length})
              </Typography>
              <FailureDiagnosticsCard diagnostics={diagnosticItems} />
            </Box>
          )}
        </Stack>
      ) : activeTab === 'diagnostics' ? (
        <FailureDiagnosticsCard diagnostics={diagnosticItems} />
      ) : activeTab === 'timeline' ? (
        <RecoveryTimeline entries={timelineEntries} />
      ) : (
        <CheckpointForensicsCard forensics={checkpointForensics} />
      )}
    </Panel>
  );
};
