import React, { useState } from 'react';
import { Box, Chip, Collapse, Grid, IconButton, Stack, Typography } from '@mui/material';
import { ChevronDown, ChevronRight, Terminal, ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { ToolCallItem } from '../../api/sse/types';
import { tokens } from '../../theme/tokens';

interface ToolCallVisualizationProps {
  toolCalls: ToolCallItem[];
}

function getStatusDetails(status: string) {
  switch (status) {
    case 'success':
      return { label: 'SUCCESS', color: tokens.colors.success, bg: tokens.colors.successSubtle, icon: <CheckCircle2 size={14} /> };
    case 'failure':
      return { label: 'FAILURE', color: tokens.colors.error, bg: tokens.colors.errorSubtle, icon: <XCircle size={14} /> };
    case 'timeout':
      return { label: 'TIMEOUT', color: tokens.colors.warning, bg: tokens.colors.warningSubtle, icon: <Clock size={14} /> };
    case 'rejected':
      return { label: 'REJECTED', color: tokens.colors.error, bg: tokens.colors.errorSubtle, icon: <ShieldAlert size={14} /> };
    case 'running':
      return { label: 'RUNNING', color: tokens.colors.primary, bg: tokens.colors.primarySubtle, icon: <Terminal size={14} /> };
    default:
      return { label: 'PENDING', color: tokens.colors.text.muted, bg: 'rgba(146, 155, 172, 0.1)', icon: <AlertTriangle size={14} /> };
  }
}

export const ToolCallVisualization: React.FC<ToolCallVisualizationProps> = ({ toolCalls }) => {
  const [expandedCalls, setExpandedCalls] = useState<Record<string, boolean>>({});

  const toggleCall = (callId: string) => {
    setExpandedCalls((prev) => ({
      ...prev,
      [callId]: !prev[callId],
    }));
  };

  if (toolCalls.length === 0) {
    return (
      <Box
        sx={{
          p: 3,
          textAlign: 'center',
          borderRadius: `${tokens.borderRadius.sm}px`,
          backgroundColor: tokens.colors.surfaceSubtle,
          border: `1px solid ${tokens.colors.borderSubtle}`,
        }}
      >
        <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.secondary }}>
          No tool executions recorded for this task.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {toolCalls.map((call) => {
        const isExpanded = Boolean(expandedCalls[call.callId]);
        const statusCfg = getStatusDetails(call.status);

        return (
          <Box
            key={call.callId}
            sx={{
              borderRadius: `${tokens.borderRadius.sm}px`,
              backgroundColor: tokens.colors.surfaceElevated,
              border: `1px solid ${isExpanded ? tokens.colors.borderActive : tokens.colors.borderSubtle}`,
              overflow: 'hidden',
              transition: 'border-color 0.15s ease',
            }}
          >
            {/* Header */}
            <Box
              onClick={() => toggleCall(call.callId)}
              sx={{
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
                '&:hover': {
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                },
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <IconButton size="small" sx={{ p: 0.25, color: tokens.colors.text.muted }}>
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </IconButton>

                <Box
                  sx={{
                    p: 0.75,
                    borderRadius: '4px',
                    backgroundColor: tokens.colors.primarySubtle,
                    color: tokens.colors.primary,
                    display: 'flex',
                  }}
                >
                  <Terminal size={16} />
                </Box>

                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography
                      sx={{
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        fontFamily: tokens.typography.fontFamily.mono,
                        color: tokens.colors.text.primary,
                      }}
                    >
                      {call.toolName}
                    </Typography>
                    {call.step !== undefined && (
                      <Chip
                        label={`Step ${call.step}`}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.6875rem',
                          fontFamily: tokens.typography.fontFamily.mono,
                          backgroundColor: tokens.colors.surfaceSubtle,
                          color: tokens.colors.text.secondary,
                        }}
                      />
                    )}
                  </Stack>
                  <Typography
                    sx={{
                      fontSize: '0.6875rem',
                      fontFamily: tokens.typography.fontFamily.mono,
                      color: tokens.colors.text.muted,
                    }}
                  >
                    Call ID: {call.callId}
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1.5} alignItems="center">
                {/* Policy decision pill if known */}
                {call.policyDecision && (
                  <Chip
                    icon={call.policyDecision.allowed ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                    label={call.policyDecision.allowed ? 'POLICY ALLOWED' : 'POLICY DENIED'}
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: '0.6875rem',
                      fontFamily: tokens.typography.fontFamily.mono,
                      fontWeight: 600,
                      backgroundColor: call.policyDecision.allowed ? tokens.colors.successSubtle : tokens.colors.errorSubtle,
                      color: call.policyDecision.allowed ? tokens.colors.success : tokens.colors.error,
                      border: `1px solid ${call.policyDecision.allowed ? 'rgba(53, 201, 138, 0.3)' : 'rgba(241, 108, 120, 0.3)'}`,
                    }}
                  />
                )}

                {/* Duration */}
                {call.durationSeconds !== undefined && (
                  <Typography
                    sx={{
                      fontSize: '0.75rem',
                      fontFamily: tokens.typography.fontFamily.mono,
                      color: tokens.colors.text.secondary,
                    }}
                  >
                    {call.durationSeconds}s
                  </Typography>
                )}

                {/* Status Pill */}
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1.25,
                    py: 0.35,
                    borderRadius: '4px',
                    backgroundColor: statusCfg.bg,
                    color: statusCfg.color,
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    fontFamily: tokens.typography.fontFamily.mono,
                  }}
                >
                  {statusCfg.icon}
                  <span>{statusCfg.label}</span>
                </Box>
              </Stack>
            </Box>

            {/* Expandable Details */}
            <Collapse in={isExpanded}>
              <Box
                sx={{
                  p: 2,
                  borderTop: `1px solid ${tokens.colors.borderSubtle}`,
                  backgroundColor: tokens.colors.surfaceSubtle,
                }}
              >
                <Grid container spacing={2}>
                  {/* Arguments / Input */}
                  <Grid item xs={12} md={6}>
                    <Typography
                      sx={{
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        fontFamily: tokens.typography.fontFamily.mono,
                        color: tokens.colors.text.muted,
                        textTransform: 'uppercase',
                        mb: 0.75,
                      }}
                    >
                      Arguments (Input)
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        p: 1.5,
                        borderRadius: `${tokens.borderRadius.xs}px`,
                        backgroundColor: tokens.colors.backgroundRoot,
                        border: `1px solid ${tokens.colors.borderSubtle}`,
                        color: tokens.colors.text.primary,
                        fontFamily: tokens.typography.fontFamily.mono,
                        fontSize: '0.75rem',
                        lineHeight: 1.5,
                        maxHeight: 220,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {call.arguments ? JSON.stringify(call.arguments, null, 2) : 'No arguments recorded'}
                    </Box>
                  </Grid>

                  {/* Output or Error */}
                  <Grid item xs={12} md={6}>
                    <Typography
                      sx={{
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        fontFamily: tokens.typography.fontFamily.mono,
                        color: call.error ? tokens.colors.error : tokens.colors.text.muted,
                        textTransform: 'uppercase',
                        mb: 0.75,
                      }}
                    >
                      {call.error ? 'Error / Failure Details' : 'Output / Result'}
                    </Typography>
                    <Box
                      component="pre"
                      sx={{
                        m: 0,
                        p: 1.5,
                        borderRadius: `${tokens.borderRadius.xs}px`,
                        backgroundColor: tokens.colors.backgroundRoot,
                        border: `1px solid ${call.error ? 'rgba(241, 108, 120, 0.4)' : tokens.colors.borderSubtle}`,
                        color: call.error ? tokens.colors.error : tokens.colors.text.primary,
                        fontFamily: tokens.typography.fontFamily.mono,
                        fontSize: '0.75rem',
                        lineHeight: 1.5,
                        maxHeight: 220,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {call.error
                        ? call.error
                        : call.output !== undefined
                        ? typeof call.output === 'object'
                          ? JSON.stringify(call.output, null, 2)
                          : String(call.output)
                        : call.status === 'running'
                        ? 'Execution in progress...'
                        : 'No output recorded'}
                    </Box>
                  </Grid>

                  {/* Policy Rationale if provided */}
                  {call.policyDecision && (
                    <Grid item xs={12}>
                      <Box
                        sx={{
                          p: 1.5,
                          borderRadius: `${tokens.borderRadius.xs}px`,
                          backgroundColor: 'rgba(255, 255, 255, 0.02)',
                          border: `1px solid ${tokens.colors.borderSubtle}`,
                        }}
                      >
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: tokens.colors.text.secondary }}>
                          Policy Engine Rationale:
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mt: 0.25 }}>
                          Rule: {call.policyDecision.matchedRule || 'default'} — {call.policyDecision.reason || 'Decision authorized by policy engine'}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </Stack>
  );
};
