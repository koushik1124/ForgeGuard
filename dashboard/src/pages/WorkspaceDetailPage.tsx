import React from 'react';
import {
  Box,
  Breadcrumbs,
  Button,
  Chip,
  Grid,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  FolderKanban,
  HardDrive,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { MetricCard } from '../components/common/MetricCard';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ErrorState } from '../components/common/ErrorState';
import { FileBrowser } from '../components/workspace/FileBrowser';
import { tokens } from '../theme/tokens';
import { useWorkspace } from '../api/hooks';

export const WorkspaceDetailPage: React.FC = () => {
  const { workspaceId = '' } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();

  const { data: workspace, isLoading, error, refetch } = useWorkspace(workspaceId);

  if (isLoading) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <LoadingSkeleton variant="card" rows={3} />
      </Box>
    );
  }

  if (error || !workspace) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Button
          startIcon={<ArrowLeft size={16} />}
          onClick={() => navigate('/workspaces')}
          sx={{ mb: 2, color: tokens.colors.text.secondary }}
        >
          Back to Workspaces
        </Button>
        <ErrorState
          title="Workspace Not Found"
          message={error?.message || `Workspace "${workspaceId}" does not exist in the ForgeGuard registry.`}
          onRetry={() => refetch()}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Top Breadcrumb Navigation */}
      <Breadcrumbs
        separator={<ChevronRight size={14} color={tokens.colors.text.muted} />}
        sx={{ mb: 2, fontSize: '0.875rem' }}
      >
        <Link
          component={RouterLink}
          to="/workspaces"
          underline="hover"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: tokens.colors.text.secondary }}
        >
          <FolderKanban size={16} />
          <span>Workspaces</span>
        </Link>
        <Typography color={tokens.colors.text.primary} sx={{ fontWeight: 600 }}>
          {workspace.name}
        </Typography>
      </Breadcrumbs>

      {/* Page Header */}
      <PageHeader
        title={workspace.name}
        description={workspace.description || 'Approved directory tree sandbox for governed agent tasks.'}
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Chip
              icon={<ShieldCheck size={14} color={tokens.colors.accentSuccess} />}
              label="Contained Sandbox"
              size="small"
              sx={{
                backgroundColor: 'rgba(53, 201, 138, 0.1)',
                color: tokens.colors.accentSuccess,
                border: `1px solid rgba(53, 201, 138, 0.3)`,
                fontWeight: 500,
              }}
            />
          </Stack>
        }
      />

      {/* Workspace Metadata Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            label="Workspace ID"
            value={workspace.workspace_id}
            subtitle="Registry Key"
            icon={<Layers size={20} color={tokens.colors.accentPrimary} />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={5}>
          <MetricCard
            label="Filesystem Root"
            value={workspace.root_path}
            subtitle="Local Path Containment"
            icon={<HardDrive size={20} color={tokens.colors.accentSecondary} />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            label="Registered"
            value={new Date(workspace.created_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
            subtitle={new Date(workspace.created_at).toLocaleTimeString()}
            icon={<Calendar size={20} color={tokens.colors.text.muted} />}
          />
        </Grid>
      </Grid>

      {/* File Browser Panel */}
      <Panel
        title="Filesystem Explorer"
        subtitle="Browse files and directories within this approved workspace root."
        sx={{ overflow: 'hidden' }}
      >
        <FileBrowser workspaceId={workspace.workspace_id} />
      </Panel>
    </Box>
  );
};
