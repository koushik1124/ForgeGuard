/**
 * ForgeGuard Design Tokens
 * Centralized design system constants for dark-first AI infrastructure console.
 */

export const tokens = {
  colors: {
    background: '#0B0D12',
    backgroundRoot: '#0B0D12',
    sidebar: '#10131A',
    backgroundSidebar: '#10131A',
    surfacePrimary: '#151922',
    surfaceCard: '#151922',
    surfaceElevated: '#1B202B',
    surfaceSubtle: '#121620',
    
    border: '#262D39',
    borderSubtle: '#1E242E',
    borderHover: '#374254',
    borderActive: '#7C8CFF',
    borderInteractive: '#7C8CFF',

    primary: '#7C8CFF',
    accentPrimary: '#7C8CFF',
    primaryHover: '#6978E6',
    accentPrimaryHover: '#6978E6',
    primaryLight: '#9AA7FF',
    primarySubtle: 'rgba(124, 140, 255, 0.12)',
    primaryGlow: 'rgba(124, 140, 255, 0.25)',

    secondary: '#ADB5C2',
    accentSecondary: '#ADB5C2',

    success: '#35C98A',
    accentSuccess: '#35C98A',
    successHover: '#2EB57B',
    successSubtle: 'rgba(53, 201, 138, 0.12)',

    warning: '#F0B45A',
    accentWarning: '#F0B45A',
    warningHover: '#DCA34B',
    warningSubtle: 'rgba(240, 180, 90, 0.12)',

    error: '#F16C78',
    accentError: '#F16C78',
    errorHover: '#DB5966',
    errorSubtle: 'rgba(241, 108, 120, 0.12)',

    info: '#59B0F6',
    infoSubtle: 'rgba(89, 176, 246, 0.12)',

    textPrimary: '#E6E8EC',
    textMuted: '#929BAC',
    textSubtle: '#5B6473',

    text: {
      primary: '#E6E8EC',
      secondary: '#ADB5C2',
      muted: '#929BAC',
      disabled: '#5B6473',
      inverse: '#0B0D12',
    },
  },
  fonts: {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', 'Roboto Mono', Menlo, monospace",
  },
  typography: {
    fontFamily: {
      sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      mono: "'JetBrains Mono', 'Fira Code', 'Roboto Mono', Menlo, monospace",
    },
    fontWeight: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.8125rem',  // 13px
      base: '0.875rem',  // 14px
      md: '1rem',       // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      xxl: '1.5rem',    // 24px
      xxxl: '1.875rem', // 30px
    },
  },
  layout: {
    sidebarWidth: 240,
    sidebarCollapsedWidth: 68,
    topbarHeight: 56,
    contentMaxWidth: 1440,
  },
  borderRadius: {
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    full: 9999,
  },
  shadows: {
    subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.35)',
    card: '0 4px 12px 0 rgba(0, 0, 0, 0.4)',
    elevated: '0 8px 24px 0 rgba(0, 0, 0, 0.5)',
  },
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

export type ThemeTokens = typeof tokens;
