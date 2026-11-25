import React from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { Panel } from '../components/common/Panel';
import { tokens } from '../theme/tokens';

export const NotFoundPage: React.FC = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
      }}
    >
      <Panel sx={{ maxWidth: '480px', width: '100%', textAlign: 'center', p: 4 }}>
        <Stack spacing={2.5} alignItems="center">
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              backgroundColor: 'rgba(241, 108, 120, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={28} color={tokens.colors.accentError} />
          </Box>

          <Typography
            sx={{
              fontSize: '2rem',
              fontWeight: 700,
              fontFamily: tokens.fonts.mono,
              color: tokens.colors.textPrimary,
              lineHeight: 1,
            }}
          >
            404
          </Typography>

          <Typography variant="h6" sx={{ fontWeight: 600, color: tokens.colors.textPrimary }}>
            Route Not Found
          </Typography>

          <Typography sx={{ fontSize: '0.875rem', color: tokens.colors.textMuted }}>
            The requested console path does not exist in the ForgeGuard navigation hierarchy.
          </Typography>

          <Button
            component={RouterLink}
            to="/dashboard"
            variant="contained"
            startIcon={<ArrowLeft size={16} />}
            sx={{
              backgroundColor: tokens.colors.accentPrimary,
              color: '#fff',
              '&:hover': { backgroundColor: tokens.colors.accentPrimaryHover },
              mt: 1,
            }}
          >
            Back to Dashboard
          </Button>
        </Stack>
      </Panel>
    </Box>
  );
};
