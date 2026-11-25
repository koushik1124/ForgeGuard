import React from 'react';
import { Box, Typography, IconButton, Tooltip, Breadcrumbs, Link, useTheme } from '@mui/material';
import { Menu, RefreshCw, KeyRound, ExternalLink } from 'lucide-react';
import { useLocation, Link as RouterLink } from 'react-router-dom';
import { ConnectionIndicator } from '../common/ConnectionIndicator';
import { useConnectionStore } from '../../stores/connectionStore';
import { useUIStore } from '../../stores/uiStore';
import { tokens } from '../../theme/tokens';
import { apiClient } from '../../api/client';

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Overview',
  '/tasks': 'Execution Tasks',
  '/live': 'Live Runs',
  '/policies': 'Security Policies',
  '/budgets': 'Resource Budgets',
  '/recovery': 'Crash Recovery',
  '/workspaces': 'Workspaces',
  '/evaluations': 'Evaluations',
  '/metrics': 'Metrics & Diagnostics',
  '/settings': 'Console Settings',
};

export const Topbar: React.FC = () => {
  const location = useLocation();
  const theme = useTheme();
  const { toggleMobileDrawer } = useUIStore();
  const { connectionState, apiKey, setConnectionState, setTestResult } = useConnectionStore();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const currentPath = location.pathname;
  const pageLabel = ROUTE_LABELS[currentPath] || (currentPath.startsWith('/tasks/') ? 'Task Detail' : 'Page');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await apiClient.testConnection();
      setTestResult(result);
      setConnectionState(result.success ? (result.readiness?.status === 'ready' ? 'connected' : 'degraded') : 'error');
    } catch {
      setConnectionState('error');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Box
      component="header"
      sx={{
        height: tokens.layout.topbarHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: { xs: 2, md: 3 },
        backgroundColor: tokens.colors.backgroundSidebar,
        borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
        position: 'sticky',
        top: 0,
        zIndex: theme.zIndex.appBar,
      }}
    >
      {/* Left: Mobile menu toggle + breadcrumbs */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <IconButton
          color="inherit"
          aria-label="Open mobile navigation"
          onClick={toggleMobileDrawer}
          edge="start"
          sx={{ display: { xs: 'flex', md: 'none' }, color: tokens.colors.textMuted }}
        >
          <Menu size={20} />
        </IconButton>

        <Breadcrumbs
          aria-label="breadcrumb"
          separator={<Typography sx={{ color: tokens.colors.textSubtle, fontSize: '0.8rem' }}>/</Typography>}
          sx={{ '& .MuiBreadcrumbs-separator': { mx: 1 } }}
        >
          <Link
            component={RouterLink}
            to="/dashboard"
            underline="hover"
            sx={{
              color: tokens.colors.textMuted,
              fontSize: '0.875rem',
              fontWeight: 500,
              '&:hover': { color: tokens.colors.textPrimary },
            }}
          >
            ForgeGuard
          </Link>
          <Typography sx={{ color: tokens.colors.textPrimary, fontSize: '0.875rem', fontWeight: 600 }}>
            {pageLabel}
          </Typography>
        </Breadcrumbs>
      </Box>

      {/* Right: Runtime connection indicator + actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {apiKey && (
          <Tooltip title="API key configured" arrow>
            <Box
              sx={{
                display: { xs: 'none', sm: 'flex' },
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                py: 0.5,
                borderRadius: '6px',
                border: `1px solid ${tokens.colors.borderSubtle}`,
                backgroundColor: tokens.colors.surfaceCard,
              }}
            >
              <KeyRound size={13} color={tokens.colors.accentPrimary} />
              <Typography sx={{ fontSize: '0.75rem', fontFamily: tokens.fonts.mono, color: tokens.colors.textMuted }}>
                Authenticated
              </Typography>
            </Box>
          </Tooltip>
        )}

        <ConnectionIndicator state={connectionState} />

        <Tooltip title="Test & refresh connection" arrow>
          <span>
            <IconButton
              size="small"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh connection"
              sx={{
                color: tokens.colors.textMuted,
                border: `1px solid ${tokens.colors.borderSubtle}`,
                borderRadius: '6px',
                '&:hover': {
                  color: tokens.colors.textPrimary,
                  backgroundColor: tokens.colors.surfaceCard,
                  borderColor: tokens.colors.borderInteractive,
                },
              }}
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="API Documentation (Swagger UI)" arrow>
          <IconButton
            size="small"
            component="a"
            href={`${apiClient.getBaseUrl()}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="API Documentation"
            sx={{
              color: tokens.colors.textMuted,
              border: `1px solid ${tokens.colors.borderSubtle}`,
              borderRadius: '6px',
              display: { xs: 'none', sm: 'inline-flex' },
              '&:hover': {
                color: tokens.colors.textPrimary,
                backgroundColor: tokens.colors.surfaceCard,
                borderColor: tokens.colors.borderInteractive,
              },
            }}
          >
            <ExternalLink size={15} />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};
