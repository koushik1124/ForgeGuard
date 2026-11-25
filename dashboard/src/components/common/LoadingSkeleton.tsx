import React from 'react';
import { Box, Skeleton } from '@mui/material';
import { tokens } from '../../theme/tokens';

interface LoadingSkeletonProps {
  variant?: 'card' | 'table' | 'text' | 'panel';
  rows?: number;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  variant = 'text',
  rows = 3,
}) => {
  if (variant === 'card') {
    return (
      <Box
        sx={{
          p: 2.25,
          backgroundColor: tokens.colors.surfacePrimary,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: `${tokens.borderRadius.md}px`,
        }}
      >
        <Skeleton variant="text" width="40%" height={16} sx={{ bgcolor: tokens.colors.borderSubtle }} />
        <Skeleton variant="text" width="60%" height={38} sx={{ bgcolor: tokens.colors.borderSubtle, my: 1.5 }} />
        <Skeleton variant="text" width="50%" height={14} sx={{ bgcolor: tokens.colors.borderSubtle }} />
      </Box>
    );
  }

  if (variant === 'table') {
    return (
      <Box sx={{ width: '100%' }}>
        {Array.from({ length: rows }).map((_, idx) => (
          <Box
            key={idx}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              py: 1.5,
              borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
            }}
          >
            <Skeleton variant="text" width="20%" height={20} sx={{ bgcolor: tokens.colors.borderSubtle }} />
            <Skeleton variant="text" width="45%" height={20} sx={{ bgcolor: tokens.colors.borderSubtle }} />
            <Skeleton variant="text" width="15%" height={20} sx={{ bgcolor: tokens.colors.borderSubtle }} />
            <Skeleton variant="text" width="20%" height={20} sx={{ bgcolor: tokens.colors.borderSubtle }} />
          </Box>
        ))}
      </Box>
    );
  }

  if (variant === 'panel') {
    return (
      <Box
        sx={{
          p: 3,
          backgroundColor: tokens.colors.surfacePrimary,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: `${tokens.borderRadius.md}px`,
        }}
      >
        <Skeleton variant="text" width="30%" height={28} sx={{ bgcolor: tokens.colors.borderSubtle, mb: 1 }} />
        <Skeleton variant="text" width="60%" height={18} sx={{ bgcolor: tokens.colors.borderSubtle, mb: 3 }} />
        <Skeleton variant="rectangular" height={140} sx={{ bgcolor: tokens.colors.borderSubtle, borderRadius: 1 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      {Array.from({ length: rows }).map((_, idx) => (
        <Skeleton
          key={idx}
          variant="text"
          height={20}
          sx={{ bgcolor: tokens.colors.borderSubtle, mb: 1 }}
        />
      ))}
    </Box>
  );
};
