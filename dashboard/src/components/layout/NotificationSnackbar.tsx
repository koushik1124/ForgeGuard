import React from 'react';
import { Alert, Snackbar } from '@mui/material';
import { useUIStore } from '../../stores/uiStore';
import { tokens } from '../../theme/tokens';

export const NotificationSnackbar: React.FC = () => {
  const toast = useUIStore((state) => state.toast);
  const hideToast = useUIStore((state) => state.hideToast);

  return (
    <Snackbar
      open={toast.open}
      autoHideDuration={4000}
      onClose={hideToast}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      <Alert
        onClose={hideToast}
        severity={toast.severity}
        variant="filled"
        sx={{
          borderRadius: `${tokens.borderRadius.sm}px`,
          boxShadow: tokens.shadows.elevated,
          fontSize: '0.8125rem',
          fontWeight: 500,
          border: `1px solid ${tokens.colors.border}`,
        }}
      >
        {toast.message}
      </Alert>
    </Snackbar>
  );
};
