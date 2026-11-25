import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { Link } from 'react-router-dom';
import { ConnectionState, ConnectionTestResult } from '../../api/types';
import { tokens } from '../../theme/tokens';

interface ConnectionIndicatorProps {
  state: ConnectionState;
  lastResult?: ConnectionTestResult | null;
  interactive?: boolean;
}

export const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({
  state,
  lastResult,
  interactive = true,
}) => {
  const getConfig = () => {
    switch (state) {
      case 'connected':
        return {
          label: 'Connected',
          color: tokens.colors.success,
          bg: tokens.colors.successSubtle,
          border: 'rgba(53, 201, 138, 0.3)',
          description: lastResult?.latencyMs
            ? `Connected to ForgeGuard API (${lastResult.latencyMs}ms)`
            : 'Connected to ForgeGuard runtime API',
        };
      case 'degraded':
        return {
          label: 'Degraded',
          color: tokens.colors.warning,
          bg: tokens.colors.warningSubtle,
          border: 'rgba(240, 180, 90, 0.3)',
          description: 'API reachable but persistence or engine reports degraded status',
        };
      case 'testing':
        return {
          label: 'Testing...',
          color: tokens.colors.info,
          bg: tokens.colors.infoSubtle,
          border: 'rgba(89, 176, 246, 0.3)',
          description: 'Validating connection to runtime...',
        };
      case 'error':
        return {
          label: 'Connection Error',
          color: tokens.colors.error,
          bg: tokens.colors.errorSubtle,
          border: 'rgba(241, 108, 120, 0.3)',
          description: lastResult?.errorMessage || 'Failed to reach ForgeGuard runtime',
        };
      case 'disconnected':
      default:
        return {
          label: 'Disconnected',
          color: tokens.colors.text.muted,
          bg: 'rgba(146, 155, 172, 0.08)',
          border: tokens.colors.border,
          description: 'Not connected to ForgeGuard API. Configure connection in Settings.',
        };
    }
  };

  const config = getConfig();

  const content = (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        px: 1.25,
        py: 0.5,
        borderRadius: `${tokens.borderRadius.full}px`,
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
        transition: tokens.transitions.fast,
        cursor: interactive ? 'pointer' : 'default',
        textDecoration: 'none',
        '&:hover': interactive
          ? {
              borderColor: config.color,
            }
          : undefined,
      }}
    >
      {/* Indicator Dot */}
      <Box
        sx={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          backgroundColor: config.color,
          boxShadow: state === 'connected' ? `0 0 6px ${config.color}` : 'none',
        }}
      />
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          color: config.color,
          lineHeight: 1,
          letterSpacing: '0.02em',
        }}
      >
        {config.label}
      </Typography>
    </Box>
  );

  return (
    <Tooltip title={config.description} arrow>
      {interactive ? (
        <Box component={Link} to="/settings" sx={{ textDecoration: 'none', display: 'inline-flex' }}>
          {content}
        </Box>
      ) : (
        content
      )}
    </Tooltip>
  );
};
