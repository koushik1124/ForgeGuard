import React from 'react';
import { Chip } from '@mui/material';
import { tokens } from '../../theme/tokens';

interface StatusBadgeProps {
  status: string;
  size?: 'small' | 'medium';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'small' }) => {
  const norm = status.toLowerCase();

  const getStyle = () => {
    switch (norm) {
      case 'completed':
      case 'ready':
      case 'active':
      case 'pass':
        return {
          color: tokens.colors.success,
          bg: tokens.colors.successSubtle,
          border: 'rgba(53, 201, 138, 0.25)',
        };
      case 'running':
        return {
          color: tokens.colors.primary,
          bg: tokens.colors.primarySubtle,
          border: 'rgba(124, 140, 255, 0.3)',
        };
      case 'failed':
      case 'error':
      case 'fail':
        return {
          color: tokens.colors.error,
          bg: tokens.colors.errorSubtle,
          border: 'rgba(241, 108, 120, 0.25)',
        };
      case 'cancelled':
      case 'degraded':
      case 'skipped':
        return {
          color: tokens.colors.warning,
          bg: tokens.colors.warningSubtle,
          border: 'rgba(240, 180, 90, 0.25)',
        };
      case 'created':
      case 'pending':
      default:
        return {
          color: tokens.colors.text.secondary,
          bg: 'rgba(146, 155, 172, 0.08)',
          border: tokens.colors.border,
        };
    }
  };

  const style = getStyle();

  return (
    <Chip
      size={size}
      label={status}
      sx={{
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        fontWeight: 600,
        textTransform: 'uppercase',
        fontSize: '0.6875rem',
        letterSpacing: '0.04em',
        height: size === 'small' ? 22 : 26,
        fontFamily: tokens.typography.fontFamily.mono,
      }}
    />
  );
};
