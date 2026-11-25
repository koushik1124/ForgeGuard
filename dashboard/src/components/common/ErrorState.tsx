import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { AlertCircle, RotateCw } from 'lucide-react';
import { tokens } from '../../theme/tokens';

interface ErrorStateProps {
  title?: string;
  message: string;
  code?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to load data',
  message,
  code,
  onRetry,
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
        py: compact ? 3 : 5,
        px: 2.5,
        backgroundColor: tokens.colors.errorSubtle,
        border: '1px solid rgba(241, 108, 120, 0.25)',
        borderRadius: `${tokens.borderRadius.md}px`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: `${tokens.borderRadius.sm}px`,
          backgroundColor: 'rgba(241, 108, 120, 0.15)',
          color: tokens.colors.error,
          mb: 1.5,
        }}
      >
        <AlertCircle size={20} />
      </Box>

      <Typography
        variant="subtitle2"
        sx={{
          fontWeight: 600,
          color: tokens.colors.text.primary,
          mb: 0.5,
        }}
      >
        {title}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          color: tokens.colors.text.secondary,
          maxWidth: 480,
          fontSize: '0.8125rem',
          mb: 1,
        }}
      >
        {message}
      </Typography>

      {code && (
        <Typography
          variant="caption"
          sx={{
            fontFamily: tokens.typography.fontFamily.mono,
            color: tokens.colors.error,
            fontSize: '0.6875rem',
            backgroundColor: 'rgba(241, 108, 120, 0.1)',
            px: 1,
            py: 0.25,
            borderRadius: `${tokens.borderRadius.xs}px`,
            mb: onRetry ? 2 : 0,
          }}
        >
          {code}
        </Typography>
      )}

      {onRetry && (
        <Button
          variant="outlined"
          size="small"
          onClick={onRetry}
          startIcon={<RotateCw size={14} />}
          sx={{
            borderColor: 'rgba(241, 108, 120, 0.4)',
            color: tokens.colors.text.primary,
            '&:hover': {
              borderColor: tokens.colors.error,
              backgroundColor: 'rgba(241, 108, 120, 0.1)',
            },
          }}
        >
          Retry Connection
        </Button>
      )}
    </Box>
  );
};
