import React from 'react';
import { Box, Typography } from '@mui/material';
import { tokens } from '../../theme/tokens';

interface BrandLogoProps {
  collapsed?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ collapsed = false }) => {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, userSelect: 'none' }}>
      {/* Custom ForgeGuard Shield SVG */}
      <Box
        component="svg"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        sx={{
          width: 28,
          height: 28,
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="8" fill="#151922" />
        <path
          d="M16 4L6 8.5V16C6 22.5 10.3 28.1 16 30C21.7 28.1 26 22.5 26 16V8.5L16 4Z"
          fill="#1B202B"
          stroke="#262D39"
          strokeWidth="1.5"
        />
        <path
          d="M16 8L9 11.2V16.5C9 21.2 12 25.3 16 26.8C20 25.3 23 21.2 23 16.5V11.2L16 8Z"
          fill="#10131A"
          stroke={tokens.colors.primary}
          strokeWidth="1.2"
        />
        <path
          d="M13 16.5L15.5 19L19.5 14"
          stroke={tokens.colors.primary}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Box>

      {!collapsed && (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Typography
            variant="h6"
            component="span"
            sx={{
              fontWeight: 700,
              fontSize: '1rem',
              letterSpacing: '-0.02em',
              color: tokens.colors.text.primary,
              lineHeight: 1.1,
            }}
          >
            ForgeGuard
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.6875rem',
              color: tokens.colors.text.muted,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              fontWeight: 600,
              mt: 0.25,
            }}
          >
            Runtime Console
          </Typography>
        </Box>
      )}
    </Box>
  );
};
