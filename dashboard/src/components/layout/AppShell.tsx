import React from 'react';
import { Box, Drawer } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { NotificationSnackbar } from './NotificationSnackbar';
import { useUIStore } from '../../stores/uiStore';
import { tokens } from '../../theme/tokens';

export const AppShell: React.FC = () => {
  const { isSidebarCollapsed, toggleSidebar, isMobileDrawerOpen, toggleMobileDrawer } = useUIStore();

  const sidebarWidth = isSidebarCollapsed ? tokens.layout.sidebarCollapsedWidth : tokens.layout.sidebarWidth;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: tokens.colors.backgroundRoot }}>
      {/* Desktop Persistent Sidebar */}
      <Box
        component="nav"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: sidebarWidth,
          flexShrink: 0,
          transition: `width ${tokens.transitions.normal}`,
        }}
        aria-label="Desktop navigation"
      >
        <Sidebar collapsed={isSidebarCollapsed} onToggleCollapse={toggleSidebar} />
      </Box>

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={isMobileDrawerOpen}
        onClose={toggleMobileDrawer}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: tokens.layout.sidebarWidth,
            backgroundColor: tokens.colors.backgroundSidebar,
            borderRight: `1px solid ${tokens.colors.borderSubtle}`,
          },
        }}
      >
        <Sidebar onNavigate={toggleMobileDrawer} />
      </Drawer>

      {/* Main Content Area */}
      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          backgroundColor: tokens.colors.backgroundRoot,
        }}
      >
        <Topbar />

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: { xs: 2, sm: 3, md: 4 },
            maxWidth: '1600px',
            width: '100%',
            mx: 'auto',
          }}
        >
          <Outlet />
        </Box>
      </Box>

      {/* Toast Notifications */}
      <NotificationSnackbar />
    </Box>
  );
};
