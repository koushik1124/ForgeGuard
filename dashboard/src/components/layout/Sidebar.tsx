import React from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import {
  BarChart3,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  FolderGit2,
  Gauge,
  LayoutDashboard,
  Radio,
  RefreshCw,
  Settings,
  Shield,
} from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';
import { NavigationItem } from './NavigationItem';
import { SidebarSection } from './SidebarSection';
import { tokens } from '../../theme/tokens';

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed = false,
  onToggleCollapse,
  onNavigate,
}) => {
  return (
    <Box
      sx={{
        width: collapsed ? tokens.layout.sidebarCollapsedWidth : tokens.layout.sidebarWidth,
        height: '100%',
        backgroundColor: tokens.colors.sidebar,
        borderRight: `1px solid ${tokens.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        transition: tokens.transitions.normal,
        flexShrink: 0,
        zIndex: 100,
        overflow: 'hidden',
      }}
    >
      {/* Branding Header */}
      <Box
        sx={{
          height: tokens.layout.topbarHeight,
          display: 'flex',
          alignItems: 'center',
          px: collapsed ? 1.75 : 2.5,
          borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
          transition: tokens.transitions.fast,
        }}
      >
        <BrandLogo collapsed={collapsed} />
      </Box>

      {/* Navigation List */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          px: 1.25,
          py: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.25,
        }}
      >
        {/* OVERVIEW */}
        <SidebarSection title="Overview" collapsed={collapsed} />
        <NavigationItem
          to="/dashboard"
          label="Dashboard"
          icon={<LayoutDashboard />}
          collapsed={collapsed}
          onClick={onNavigate}
        />

        {/* EXECUTION */}
        <SidebarSection title="Execution" collapsed={collapsed} />
        <NavigationItem
          to="/tasks"
          label="Tasks"
          icon={<CheckSquare />}
          collapsed={collapsed}
          onClick={onNavigate}
        />
        <NavigationItem
          to="/live"
          label="Live Runs"
          icon={<Radio />}
          collapsed={collapsed}
          onClick={onNavigate}
        />

        {/* GOVERNANCE */}
        <SidebarSection title="Governance" collapsed={collapsed} />
        <NavigationItem
          to="/policies"
          label="Policies"
          icon={<Shield />}
          collapsed={collapsed}
          onClick={onNavigate}
        />
        <NavigationItem
          to="/budgets"
          label="Budgets"
          icon={<Gauge />}
          collapsed={collapsed}
          onClick={onNavigate}
        />
        <NavigationItem
          to="/recovery"
          label="Recovery"
          icon={<RefreshCw />}
          collapsed={collapsed}
          onClick={onNavigate}
        />

        {/* PLATFORM */}
        <SidebarSection title="Platform" collapsed={collapsed} />
        <NavigationItem
          to="/workspaces"
          label="Workspaces"
          icon={<FolderGit2 />}
          collapsed={collapsed}
          onClick={onNavigate}
        />
        <NavigationItem
          to="/evaluations"
          label="Evaluations"
          icon={<FlaskConical />}
          collapsed={collapsed}
          onClick={onNavigate}
        />
        <NavigationItem
          to="/metrics"
          label="Metrics"
          icon={<BarChart3 />}
          collapsed={collapsed}
          onClick={onNavigate}
        />

        {/* SYSTEM */}
        <SidebarSection title="System" collapsed={collapsed} />
        <NavigationItem
          to="/settings"
          label="Settings"
          icon={<Settings />}
          collapsed={collapsed}
          onClick={onNavigate}
        />
      </Box>

      {/* Footer Collapse Toggle */}
      {onToggleCollapse && (
        <Box
          sx={{
            p: 1.25,
            borderTop: `1px solid ${tokens.colors.borderSubtle}`,
            display: 'flex',
            justifyContent: collapsed ? 'center' : 'flex-end',
          }}
        >
          <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
            <IconButton
              size="small"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              sx={{
                color: tokens.colors.text.muted,
                border: `1px solid ${tokens.colors.borderSubtle}`,
                borderRadius: `${tokens.borderRadius.sm}px`,
                p: 0.75,
                '&:hover': {
                  color: tokens.colors.text.primary,
                  borderColor: tokens.colors.border,
                  backgroundColor: tokens.colors.surfaceElevated,
                },
              }}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
};
