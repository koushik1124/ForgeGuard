import { createTheme } from '@mui/material/styles';
import { tokens } from './tokens';

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: tokens.colors.background,
      paper: tokens.colors.surfacePrimary,
    },
    primary: {
      main: tokens.colors.primary,
      light: tokens.colors.primaryLight,
      dark: tokens.colors.primaryHover,
      contrastText: '#0B0D12',
    },
    success: {
      main: tokens.colors.success,
      contrastText: '#0B0D12',
    },
    warning: {
      main: tokens.colors.warning,
      contrastText: '#0B0D12',
    },
    error: {
      main: tokens.colors.error,
      contrastText: '#FFFFFF',
    },
    info: {
      main: tokens.colors.info,
      contrastText: '#0B0D12',
    },
    text: {
      primary: tokens.colors.text.primary,
      secondary: tokens.colors.text.secondary,
      disabled: tokens.colors.text.disabled,
    },
    divider: tokens.colors.border,
  },
  typography: {
    fontFamily: tokens.typography.fontFamily.sans,
    h1: {
      fontSize: tokens.typography.fontSize.xxxl,
      fontWeight: tokens.typography.fontWeight.bold,
      lineHeight: 1.25,
      color: tokens.colors.text.primary,
    },
    h2: {
      fontSize: tokens.typography.fontSize.xxl,
      fontWeight: tokens.typography.fontWeight.semibold,
      lineHeight: 1.3,
      color: tokens.colors.text.primary,
    },
    h3: {
      fontSize: tokens.typography.fontSize.xl,
      fontWeight: tokens.typography.fontWeight.semibold,
      lineHeight: 1.35,
      color: tokens.colors.text.primary,
    },
    h4: {
      fontSize: tokens.typography.fontSize.lg,
      fontWeight: tokens.typography.fontWeight.semibold,
      lineHeight: 1.4,
      color: tokens.colors.text.primary,
    },
    h5: {
      fontSize: tokens.typography.fontSize.md,
      fontWeight: tokens.typography.fontWeight.medium,
      lineHeight: 1.45,
      color: tokens.colors.text.primary,
    },
    h6: {
      fontSize: tokens.typography.fontSize.base,
      fontWeight: tokens.typography.fontWeight.medium,
      lineHeight: 1.5,
      color: tokens.colors.text.primary,
    },
    body1: {
      fontSize: tokens.typography.fontSize.base,
      fontWeight: tokens.typography.fontWeight.regular,
      lineHeight: 1.5,
      color: tokens.colors.text.primary,
    },
    body2: {
      fontSize: tokens.typography.fontSize.sm,
      fontWeight: tokens.typography.fontWeight.regular,
      lineHeight: 1.45,
      color: tokens.colors.text.secondary,
    },
    caption: {
      fontSize: tokens.typography.fontSize.xs,
      fontWeight: tokens.typography.fontWeight.regular,
      lineHeight: 1.4,
      color: tokens.colors.text.muted,
    },
    button: {
      textTransform: 'none',
      fontWeight: tokens.typography.fontWeight.medium,
      fontSize: tokens.typography.fontSize.sm,
    },
  },
  shape: {
    borderRadius: tokens.borderRadius.sm,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: tokens.colors.background,
          color: tokens.colors.text.primary,
          scrollbarWidth: 'thin',
          scrollbarColor: `${tokens.colors.border} ${tokens.colors.background}`,
          '&::-webkit-scrollbar': {
            width: 8,
            height: 8,
          },
          '&::-webkit-scrollbar-track': {
            background: tokens.colors.background,
          },
          '&::-webkit-scrollbar-thumb': {
            background: tokens.colors.border,
            borderRadius: 4,
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: tokens.colors.borderHover,
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: tokens.colors.surfacePrimary,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: tokens.borderRadius.md,
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: tokens.borderRadius.sm,
          padding: '6px 14px',
          fontWeight: tokens.typography.fontWeight.medium,
          transition: tokens.transitions.fast,
        },
        containedPrimary: {
          backgroundColor: tokens.colors.primary,
          color: '#0B0D12',
          '&:hover': {
            backgroundColor: tokens.colors.primaryHover,
          },
        },
        outlinedPrimary: {
          borderColor: tokens.colors.border,
          color: tokens.colors.text.primary,
          backgroundColor: 'transparent',
          '&:hover': {
            borderColor: tokens.colors.borderHover,
            backgroundColor: tokens.colors.surfaceElevated,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
          padding: '12px 16px',
          fontSize: tokens.typography.fontSize.sm,
        },
        head: {
          fontWeight: tokens.typography.fontWeight.semibold,
          color: tokens.colors.text.muted,
          backgroundColor: tokens.colors.surfaceElevated,
          borderBottom: `1px solid ${tokens.colors.border}`,
          textTransform: 'uppercase',
          fontSize: tokens.typography.fontSize.xs,
          letterSpacing: '0.05em',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: tokens.transitions.fast,
          '&:hover': {
            backgroundColor: `${tokens.colors.surfaceElevated} !important`,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.colors.sidebar,
          borderRadius: tokens.borderRadius.sm,
          fontSize: tokens.typography.fontSize.sm,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.colors.border,
            transition: tokens.transitions.fast,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.colors.borderHover,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: tokens.colors.primary,
            borderWidth: 1.5,
          },
        },
        input: {
          padding: '10px 14px',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: tokens.borderRadius.xs,
          fontWeight: tokens.typography.fontWeight.medium,
          fontSize: tokens.typography.fontSize.xs,
          height: 24,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: tokens.colors.surfaceElevated,
          color: tokens.colors.text.primary,
          border: `1px solid ${tokens.colors.border}`,
          fontSize: tokens.typography.fontSize.xs,
          borderRadius: tokens.borderRadius.xs,
          padding: '4px 8px',
          boxShadow: tokens.shadows.subtle,
        },
        arrow: {
          color: tokens.colors.surfaceElevated,
          '&::before': {
            border: `1px solid ${tokens.colors.border}`,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: tokens.colors.surfaceElevated,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: tokens.borderRadius.md,
          boxShadow: tokens.shadows.elevated,
        },
      },
    },
  },
});
