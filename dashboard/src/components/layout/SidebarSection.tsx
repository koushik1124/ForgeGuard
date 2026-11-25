import React from 'react';
import { Box, Divider, Typography } from '@mui/material';
import { tokens } from '../../theme/tokens';

interface SidebarSectionProps {
  title: string;
  collapsed?: boolean;
}

export const SidebarSection: React.FC<SidebarSectionProps> = ({ title, collapsed = false }) => {
  if (collapsed) {
    return (
      <Box sx={{ my: 1.25, px: 1 }}>
        <Divider sx={{ borderColor: tokens.colors.borderSubtle }} />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2.25, mb: 0.75, px: 1.5 }}>
      <Typography
        variant="caption"
        sx={{
          color: tokens.colors.text.muted,
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          display: 'block',
        }}
      >
        {title}
      </Typography>
    </Box>
  );
};
