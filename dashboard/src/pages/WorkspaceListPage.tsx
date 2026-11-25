import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
  ExternalLink,
  FolderKanban,
  FolderPlus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorState } from '../components/common/ErrorState';
import { ConfirmationDialog } from '../components/dialogs/ConfirmationDialog';
import { RegisterWorkspaceDialog } from '../components/workspace/RegisterWorkspaceDialog';
import { tokens } from '../theme/tokens';
import { useWorkspaces, useUnregisterWorkspace } from '../api/hooks';
import { WorkspaceResponse } from '../api/types';
import { useUIStore } from '../stores/uiStore';

export const WorkspaceListPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useUIStore();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [unregisterTarget, setUnregisterTarget] = useState<WorkspaceResponse | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useWorkspaces();
  const unregisterMutation = useUnregisterWorkspace();

  const handleConfirmUnregister = async () => {
    if (!unregisterTarget) return;

    try {
      await unregisterMutation.mutateAsync(unregisterTarget.workspace_id);
      showToast(`Workspace "${unregisterTarget.name}" unregistered successfully.`, 'info');
      setUnregisterTarget(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to unregister workspace.';
      showToast(`Unregister failed: ${msg}`, 'error');
    }
  };

  const workspaces = data?.workspaces || [];

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <PageHeader
        title="Workspace Explorer"
        description="Manage approved host directory sandboxes and inspect runtime filesystem boundaries."
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Tooltip title="Refresh workspaces">
              <span>
                <IconButton
                  size="small"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  sx={{ color: tokens.colors.text.secondary }}
                >
                  <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
                </IconButton>
              </span>
            </Tooltip>
            <Button
              variant="contained"
              size="small"
              startIcon={<FolderPlus size={16} />}
              onClick={() => setRegisterOpen(true)}
            >
              Register Workspace
            </Button>
          </Stack>
        }
      />

      {/* Security Invariant Banner */}
      <Panel sx={{ mb: 3, p: 2, backgroundColor: tokens.colors.surfacePrimary }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <ShieldCheck size={24} color={tokens.colors.accentPrimary} style={{ flexShrink: 0 }} />
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: tokens.colors.text.primary, mb: 0.25 }}>
              Strict Directory Containment Invariant
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.colors.text.secondary, fontSize: '0.85rem' }}>
              Workspaces define authorized directory trees for autonomous agent tasks. ForgeGuard strictly prevents
              path traversal, symlink escapes, and unauthorized filesystem access outside these registered roots.
            </Typography>
          </Box>
        </Stack>
      </Panel>

      {/* Main Content Area */}
      {isLoading && <LoadingSkeleton variant="table" rows={4} />}

      {error && !isLoading && (
        <ErrorState
          title="Failed to Load Workspaces"
          message={error.message || 'Unable to retrieve workspace list from API.'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !error && workspaces.length === 0 && (
        <EmptyState
          icon={<FolderKanban size={48} color={tokens.colors.text.muted} />}
          title="No registered workspaces"
          description="Register an existing directory on the host machine to allow agent tasks to safely inspect files."
          action={
            <Button
              variant="contained"
              size="small"
              startIcon={<FolderPlus size={16} />}
              onClick={() => setRegisterOpen(true)}
            >
              Register First Workspace
            </Button>
          }
        />
      )}

      {!isLoading && !error && workspaces.length > 0 && (
        <Panel title={`Registered Workspaces (${workspaces.length})`} sx={{ overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                  <TableCell sx={{ color: tokens.colors.text.muted, fontWeight: 600 }}>Workspace Name</TableCell>
                  <TableCell sx={{ color: tokens.colors.text.muted, fontWeight: 600 }}>Workspace ID</TableCell>
                  <TableCell sx={{ color: tokens.colors.text.muted, fontWeight: 600 }}>Filesystem Root</TableCell>
                  <TableCell sx={{ color: tokens.colors.text.muted, fontWeight: 600 }}>Description</TableCell>
                  <TableCell sx={{ color: tokens.colors.text.muted, fontWeight: 600, textAlign: 'right' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {workspaces.map((ws) => (
                  <TableRow
                    key={ws.workspace_id}
                    hover
                    sx={{
                      '&:hover': {
                        backgroundColor: tokens.colors.surfaceElevated,
                      },
                    }}
                  >
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <FolderKanban size={18} color={tokens.colors.accentPrimary} />
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color: tokens.colors.text.primary,
                            cursor: 'pointer',
                            '&:hover': { color: tokens.colors.accentPrimary },
                          }}
                          onClick={() => navigate(`/workspaces/${ws.workspace_id}`)}
                        >
                          {ws.name}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={ws.workspace_id}
                        size="small"
                        sx={{
                          height: 22,
                          fontFamily: tokens.typography.fontFamily.mono,
                          fontSize: '0.75rem',
                          backgroundColor: tokens.colors.surfaceElevated,
                          color: tokens.colors.accentPrimary,
                          border: `1px solid ${tokens.colors.borderSubtle}`,
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: tokens.typography.fontFamily.mono,
                          fontSize: '0.8rem',
                          color: tokens.colors.text.secondary,
                          maxWidth: 320,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={ws.root_path}
                      >
                        {ws.root_path}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.8rem',
                          color: tokens.colors.text.muted,
                          maxWidth: 240,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ws.description || '--'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right' }}>
                      <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                        <Button
                          variant="outlined"
                          size="small"
                          endIcon={<ExternalLink size={14} />}
                          onClick={() => navigate(`/workspaces/${ws.workspace_id}`)}
                          sx={{ fontSize: '0.75rem', py: 0.5 }}
                        >
                          Explore
                        </Button>
                        <Tooltip title="Unregister workspace">
                          <IconButton
                            size="small"
                            onClick={() => setUnregisterTarget(ws)}
                            sx={{
                              color: tokens.colors.text.muted,
                              '&:hover': { color: tokens.colors.error },
                            }}
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Panel>
      )}

      {/* Registration Modal Dialog */}
      <RegisterWorkspaceDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSuccess={(newWs) => {
          showToast(`Workspace "${newWs.name}" registered successfully.`, 'success');
        }}
      />

      {/* Unregistration Confirmation Dialog */}
      <ConfirmationDialog
        open={Boolean(unregisterTarget)}
        title="Unregister Workspace"
        message={`Are you sure you want to unregister workspace "${unregisterTarget?.name}" (${unregisterTarget?.workspace_id})? Unregistering removes the workspace from ForgeGuard's registry. It does not delete files from disk.`}
        confirmLabel="Unregister Workspace"
        cancelLabel="Cancel"
        isDestructive
        onConfirm={handleConfirmUnregister}
        onCancel={() => setUnregisterTarget(null)}
      />
    </Box>
  );
};
