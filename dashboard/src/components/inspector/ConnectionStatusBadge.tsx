import React from 'react';
import { Box, Typography } from '@mui/material';
import { SSEConnectionStatus } from '../../api/sse/types';
import { tokens } from '../../theme/tokens';

interface ConnectionStatusBadgeProps {
  status: SSEConnectionStatus;
  size?: 'small' | 'medium';
}

interface StatusConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  pulse?: boolean;
}

const statusConfigs: Record<SSEConnectionStatus, StatusConfig> = {
  connected: {
    label: 'LIVE / CONNECTED',
    color: tokens.colors.success,
    bgColor: tokens.colors.successSubtle,
    borderColor: 'rgba(53, 201, 138, 0.4)',
    pulse: true,
  },
  connecting: {
    label: 'CONNECTING...',
    color: tokens.colors.info,
    bgColor: tokens.colors.infoSubtle,
    borderColor: 'rgba(89, 176, 246, 0.4)',
    pulse: true,
  },
  reconnecting: {
    label: 'RECONNECTING...',
    color: tokens.colors.warning,
    bgColor: tokens.colors.warningSubtle,
    borderColor: 'rgba(240, 180, 90, 0.4)',
    pulse: true,
  },
  polling: {
    label: 'POLLING FALLBACK',
    color: tokens.colors.info,
    bgColor: tokens.colors.infoSubtle,
    borderColor: 'rgba(89, 176, 246, 0.4)',
    pulse: false,
  },
  disconnected: {
    label: 'DISCONNECTED',
    color: tokens.colors.text.muted,
    bgColor: 'rgba(146, 155, 172, 0.12)',
    borderColor: tokens.colors.borderSubtle,
    pulse: false,
  },
  closed: {
    label: 'STREAM CLOSED',
    color: tokens.colors.text.secondary,
    bgColor: 'rgba(146, 155, 172, 0.08)',
    borderColor: tokens.colors.borderSubtle,
    pulse: false,
  },
};

export const ConnectionStatusBadge: React.FC<ConnectionStatusBadgeProps> = ({
  status,
  size = 'small',
}) => {
  const cfg = statusConfigs[status] || statusConfigs.disconnected;

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        px: size === 'small' ? 1.25 : 1.75,
        py: size === 'small' ? 0.375 : 0.625,
        borderRadius: '9999px',
        backgroundColor: cfg.bgColor,
        border: `1px solid ${cfg.borderColor}`,
      }}
    >
      <Box
        sx={{
          width: size === 'small' ? 6 : 8,
          height: size === 'small' ? 6 : 8,
          borderRadius: '50%',
          backgroundColor: cfg.color,
          boxShadow: cfg.pulse ? `0 0 8px ${cfg.color}` : 'none',
          animation: cfg.pulse ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.4 },
          },
        }}
      />
      <Typography
        sx={{
          fontSize: size === 'small' ? '0.6875rem' : '0.75rem',
          fontWeight: 700,
          fontFamily: tokens.typography.fontFamily.mono,
          color: cfg.color,
          letterSpacing: '0.05em',
          userSelect: 'none',
        }}
      >
        {cfg.label}
      </Typography>
    </Box>
  );
};
