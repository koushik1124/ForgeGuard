import React from 'react';
import { Box, Paper, Skeleton, Tooltip, Typography } from '@mui/material';
import { tokens } from '../../theme/tokens';

interface MetricCardProps {
  label: string;
  value?: string | number | null;
  subtitle?: string;
  icon?: React.ReactNode;
  statusColor?: string;
  isUnavailable?: boolean;
  unavailableReason?: string;
  loading?: boolean;
  tooltip?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtitle,
  icon,
  statusColor = tokens.colors.primary,
  isUnavailable = false,
  unavailableReason,
  loading = false,
  tooltip,
}) => {
  const effectiveUnavailable =
    isUnavailable || (Boolean(unavailableReason) && (value === '--' || value === null || value === undefined));
  const effectiveReason = unavailableReason || 'Connect runtime API in Settings to stream live metrics';

  const cardContent = (
    <Paper
      sx={{
        p: 2.25,
        backgroundColor: tokens.colors.surfacePrimary,
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: `${tokens.borderRadius.md}px`,
        transition: tokens.transitions.fast,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        minHeight: 110,
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          borderColor: tokens.colors.borderHover,
          backgroundColor: tokens.colors.surfaceElevated,
        },
      }}
    >
      {/* Top row: Label and Icon */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: tokens.colors.text.muted,
            fontSize: '0.6875rem',
          }}
        >
          {label}
        </Typography>
        {icon && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              color: statusColor,
              opacity: effectiveUnavailable ? 0.4 : 0.85,
            }}
          >
            {icon}
          </Box>
        )}
      </Box>

      {/* Main value or Unavailable state */}
      <Box sx={{ my: 'auto' }}>
        {loading ? (
          <Skeleton variant="text" width="60%" height={38} sx={{ bgcolor: tokens.colors.borderSubtle }} />
        ) : effectiveUnavailable ? (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 600,
                color: tokens.colors.text.disabled,
                fontFamily: tokens.typography.fontFamily.mono,
                fontSize: '1.5rem',
              }}
            >
              --
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: tokens.colors.text.muted,
                fontSize: '0.75rem',
                backgroundColor: 'rgba(146, 155, 172, 0.08)',
                px: 1,
                py: 0.25,
                borderRadius: `${tokens.borderRadius.xs}px`,
                border: `1px solid ${tokens.colors.borderSubtle}`,
              }}
            >
              Unavailable
            </Typography>
          </Box>
        ) : (
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              fontSize: '1.75rem',
              color: tokens.colors.text.primary,
              fontFamily: tokens.typography.fontFamily.mono,
              letterSpacing: '-0.02em',
            }}
          >
            {value}
          </Typography>
        )}
      </Box>

      {/* Subtitle / Context note */}
      <Box sx={{ mt: 1 }}>
        {loading ? (
          <Skeleton variant="text" width="40%" height={16} sx={{ bgcolor: tokens.colors.borderSubtle }} />
        ) : effectiveUnavailable ? (
          <Typography
            variant="caption"
            sx={{
              color: tokens.colors.text.muted,
              fontSize: '0.6875rem',
              display: 'block',
            }}
          >
            {effectiveReason}
          </Typography>
        ) : subtitle ? (
          <Typography
            variant="caption"
            sx={{
              color: tokens.colors.text.secondary,
              fontSize: '0.75rem',
            }}
          >
            {subtitle}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} placement="top" arrow>
        {cardContent}
      </Tooltip>
    );
  }

  return cardContent;
};
