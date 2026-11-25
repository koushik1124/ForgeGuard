import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Box, Tooltip, Typography } from '@mui/material';
import { tokens } from '../../theme/tokens';

interface NavigationItemProps {
  to: string;
  label: string;
  icon: React.ReactNode;
  collapsed?: boolean;
  badge?: string | number;
  onClick?: () => void;
}

export const NavigationItem: React.FC<NavigationItemProps> = ({
  to,
  label,
  icon,
  collapsed = false,
  badge,
  onClick,
}) => {
  const location = useLocation();
  const isActive = location.pathname === to || (to !== '/dashboard' && location.pathname.startsWith(`${to}/`));

  const linkContent = (
    <Box
      component={NavLink}
      to={to}
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: collapsed ? 1.75 : 1.5,
        py: 0.9,
        borderRadius: `${tokens.borderRadius.sm}px`,
        textDecoration: 'none',
        color: isActive ? tokens.colors.primary : tokens.colors.text.secondary,
        backgroundColor: isActive ? tokens.colors.primarySubtle : 'transparent',
        border: `1px solid ${isActive ? 'rgba(124, 140, 255, 0.25)' : 'transparent'}`,
        transition: tokens.transitions.fast,
        position: 'relative',
        '&:hover': {
          color: tokens.colors.text.primary,
          backgroundColor: isActive ? tokens.colors.primarySubtle : 'rgba(255, 255, 255, 0.04)',
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isActive ? tokens.colors.primary : tokens.colors.text.muted,
          '& svg': {
            width: 18,
            height: 18,
          },
        }}
      >
        {icon}
      </Box>

      {!collapsed && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, overflow: 'hidden' }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: isActive ? 600 : 500,
              fontSize: '0.84375rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </Typography>

          {badge !== undefined && (
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 600,
                color: isActive ? tokens.colors.primary : tokens.colors.text.muted,
                backgroundColor: isActive ? 'rgba(124, 140, 255, 0.2)' : tokens.colors.surfaceElevated,
                px: 0.75,
                py: 0.1,
                borderRadius: `${tokens.borderRadius.xs}px`,
                border: `1px solid ${tokens.colors.borderSubtle}`,
                fontFamily: tokens.typography.fontFamily.mono,
              }}
            >
              {badge}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );

  return collapsed ? (
    <Tooltip title={label} placement="right" arrow>
      {linkContent}
    </Tooltip>
  ) : (
    linkContent
  );
};
