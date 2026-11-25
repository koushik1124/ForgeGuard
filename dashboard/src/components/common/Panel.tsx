import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { tokens } from '../../theme/tokens';

interface PanelProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  action?: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  variant?: 'primary' | 'elevated' | 'subtle';
  noPadding?: boolean;
  sx?: Record<string, unknown>;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  subtitle,
  actions,
  action,
  headerRight,
  children,
  variant = 'primary',
  noPadding = false,
  sx,
}) => {
  const rightSlot = actions || action || headerRight;

  const getBg = () => {
    switch (variant) {
      case 'elevated':
        return tokens.colors.surfaceElevated;
      case 'subtle':
        return tokens.colors.surfaceSubtle;
      case 'primary':
      default:
        return tokens.colors.surfacePrimary;
    }
  };

  return (
    <Paper
      sx={{
        backgroundColor: getBg(),
        border: `1px solid ${tokens.colors.border}`,
        borderRadius: `${tokens.borderRadius.md}px`,
        overflow: 'hidden',
        boxShadow: tokens.shadows.subtle,
        ...sx,
      }}
    >
      {(title || rightSlot) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2.5,
            py: 2,
            borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
          }}
        >
          <Box>
            {title && (
              <Typography
                variant="h6"
                component="h2"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  letterSpacing: '-0.01em',
                  color: tokens.colors.text.primary,
                }}
              >
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography
                variant="body2"
                sx={{
                  color: tokens.colors.text.muted,
                  fontSize: '0.8125rem',
                  mt: 0.25,
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          {rightSlot && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{rightSlot}</Box>}
        </Box>
      )}

      <Box sx={{ p: noPadding ? 0 : 2.5 }}>{children}</Box>
    </Paper>
  );
};
