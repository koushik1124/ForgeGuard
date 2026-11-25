import React from 'react';
import { Box, Typography } from '@mui/material';
import { tokens } from '../../theme/tokens';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  compact = false,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        py: compact ? 4 : 7,
        px: 3,
      }}
    >
      {icon && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: `${tokens.borderRadius.md}px`,
            backgroundColor: tokens.colors.surfaceElevated,
            border: `1px solid ${tokens.colors.border}`,
            color: tokens.colors.text.muted,
            mb: 2,
          }}
        >
          {icon}
        </Box>
      )}

      <Typography
        variant="h6"
        sx={{
          fontWeight: 600,
          fontSize: '0.9375rem',
          color: tokens.colors.text.primary,
          mb: 0.75,
        }}
      >
        {title}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          color: tokens.colors.text.muted,
          maxWidth: 420,
          fontSize: '0.8125rem',
          mb: action ? 2.5 : 0,
          lineHeight: 1.5,
        }}
      >
        {description}
      </Typography>

      {action && <Box sx={{ mt: 1 }}>{action}</Box>}
    </Box>
  );
};
