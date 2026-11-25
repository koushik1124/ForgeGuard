import React from 'react';
import {
  Alert,
  Box,
  Chip,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import {
  AlertOctagon,
  AlertTriangle,
  Bookmark,
  CheckCircle,
  Database,
  Layers,
} from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { CheckpointForensics } from '../../api/recovery/types';

export interface CheckpointForensicsCardProps {
  forensics: CheckpointForensics;
}

export const CheckpointForensicsCard: React.FC<CheckpointForensicsCardProps> = ({
  forensics,
}) => {
  return (
    <Box>
      {/* Primary Checkpoint Metrics Grid */}
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {/* Metric 1: Reconstructed Position */}
        <Grid item xs={12} sm={6} md={3}>
          <Box
            sx={{
              p: 2,
              borderRadius: `${tokens.borderRadius.sm}px`,
              backgroundColor: tokens.colors.surfaceElevated,
              border: `1px solid ${tokens.colors.borderSubtle}`,
            }}
          >
            <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600, textTransform: 'uppercase' }}>
              Reconstructed Position
            </Typography>
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.text.primary, mt: 0.5 }}>
              Step {forensics.reconstructed_position}
            </Typography>
            <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, mt: 0.25 }}>
              {forensics.completed_call_count} completed calls preserved
            </Typography>
          </Box>
        </Grid>

        {/* Metric 2: Continuation Target */}
        <Grid item xs={12} sm={6} md={3}>
          <Box
            sx={{
              p: 2,
              borderRadius: `${tokens.borderRadius.sm}px`,
              backgroundColor: tokens.colors.surfaceElevated,
              border: `1px solid ${tokens.colors.borderSubtle}`,
            }}
          >
            <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600, textTransform: 'uppercase' }}>
              Continuation Target
            </Typography>
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, fontFamily: tokens.typography.fontFamily.mono, color: tokens.colors.accentPrimary, mt: 0.5 }}>
              Step {forensics.reconstructed_position}
            </Typography>
            <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, mt: 0.25 }}>
              Resumes remaining plan from this index
            </Typography>
          </Box>
        </Grid>

        {/* Metric 3: State Source & Integrity */}
        <Grid item xs={12} sm={6} md={6}>
          <Box
            sx={{
              p: 2,
              borderRadius: `${tokens.borderRadius.sm}px`,
              backgroundColor: tokens.colors.surfaceElevated,
              border: `1px solid ${tokens.colors.borderSubtle}`,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted, fontWeight: 600, textTransform: 'uppercase' }}>
              State Reconstruction Source
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.75 }}>
              {forensics.reconstruction_source === 'checkpoint' ? (
                <Chip
                  icon={<Database size={14} color={tokens.colors.success} />}
                  label="Verified SQLite Checkpoint"
                  size="small"
                  sx={{
                    height: 24,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    backgroundColor: tokens.colors.successSubtle,
                    color: tokens.colors.success,
                    border: '1px solid rgba(53, 201, 138, 0.3)',
                  }}
                />
              ) : forensics.reconstruction_source === 'tool_records' ? (
                <Chip
                  icon={<Layers size={14} color={tokens.colors.warning} />}
                  label="Inferred from Tool Execution Records"
                  size="small"
                  sx={{
                    height: 24,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    backgroundColor: tokens.colors.warningSubtle,
                    color: tokens.colors.warning,
                    border: '1px solid rgba(240, 180, 90, 0.3)',
                  }}
                />
              ) : (
                <Chip
                  label="No Prior State Available"
                  size="small"
                  sx={{
                    height: 24,
                    fontSize: '0.75rem',
                    backgroundColor: 'rgba(146, 155, 172, 0.1)',
                    color: tokens.colors.text.muted,
                  }}
                />
              )}

              <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.secondary }}>
                {forensics.reconstruction_source === 'checkpoint'
                  ? 'Complete state restored from durable SQLite checkpoint.'
                  : forensics.reconstruction_source === 'tool_records'
                  ? 'Reconstructed from persistent tool execution tables without snapshot.'
                  : 'Fresh execution without checkpoint recovery.'}
              </Typography>
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* Uncertain Tool Executions Warning Banner */}
      {forensics.uncertain_calls.length > 0 && (
        <Alert
          severity="error"
          icon={<AlertOctagon size={20} color={tokens.colors.error} />}
          sx={{
            mb: 2.5,
            backgroundColor: tokens.colors.errorSubtle,
            border: '1px solid rgba(241, 108, 120, 0.4)',
            color: tokens.colors.text.primary,
          }}
        >
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, mb: 0.5 }}>
            Uncertain Side-Effects Detected ({forensics.uncertain_calls.length} Incomplete Call
            {forensics.uncertain_calls.length > 1 ? 's' : ''})
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.secondary, mb: 1 }}>
            The process was interrupted while the following tool invocations were in RUNNING status. ForgeGuard
            classifies them as UNCERTAIN because external real-world side effects may have taken place. Resumption is
            strictly blocked to prevent duplicate non-idempotent operations.
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {forensics.uncertain_calls.map((callId) => (
              <Chip
                key={callId}
                label={callId}
                size="small"
                sx={{
                  fontFamily: tokens.typography.fontFamily.mono,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: 'rgba(241, 108, 120, 0.2)',
                  color: tokens.colors.error,
                  border: '1px solid rgba(241, 108, 120, 0.4)',
                }}
              />
            ))}
          </Stack>
        </Alert>
      )}

      {/* Recovery Warnings */}
      {forensics.warnings.length > 0 && (
        <Box sx={{ mb: 2.5 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: tokens.colors.text.muted, mb: 1, textTransform: 'uppercase' }}>
            Recovery Assessment Advisories
          </Typography>
          <Stack spacing={1}>
            {forensics.warnings.map((warn, i) => (
              <Box
                key={i}
                sx={{
                  p: 1.25,
                  borderRadius: `${tokens.borderRadius.sm}px`,
                  backgroundColor: tokens.colors.surfaceElevated,
                  border: '1px solid rgba(240, 180, 90, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                }}
              >
                <AlertTriangle size={16} color={tokens.colors.warning} />
                <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.secondary, fontFamily: tokens.typography.fontFamily.mono }}>
                  {warn}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {/* Completed Tool Calls Ledger */}
      <Box
        sx={{
          p: 2,
          borderRadius: `${tokens.borderRadius.sm}px`,
          backgroundColor: tokens.colors.surfaceElevated,
          border: `1px solid ${tokens.colors.borderSubtle}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Bookmark size={16} color={tokens.colors.accentPrimary} />
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tokens.colors.text.primary }}>
              Preserved Completed Tool Calls ({forensics.completed_call_count})
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.6875rem', color: tokens.colors.text.muted }}>
            Will NOT be re-executed on resume
          </Typography>
        </Box>

        {forensics.completed_calls.length === 0 ? (
          <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, fontStyle: 'italic' }}>
            No tool calls were completed prior to interruption.
          </Typography>
        ) : (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {forensics.completed_calls.map((callId, idx) => (
              <Chip
                key={callId}
                icon={<CheckCircle size={12} color={tokens.colors.success} />}
                label={`#${idx + 1}: ${callId}`}
                size="small"
                sx={{
                  fontFamily: tokens.typography.fontFamily.mono,
                  fontSize: '0.75rem',
                  backgroundColor: tokens.colors.surfaceSubtle,
                  borderColor: tokens.colors.borderSubtle,
                  color: tokens.colors.text.secondary,
                }}
                variant="outlined"
              />
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
};
