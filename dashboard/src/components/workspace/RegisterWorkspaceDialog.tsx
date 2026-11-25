import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { FolderPlus, ShieldCheck } from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { useRegisterWorkspace } from '../../api/hooks';
import { APIClientError } from '../../api/client';
import { WorkspaceResponse } from '../../api/types';

interface RegisterWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (workspace: WorkspaceResponse) => void;
}

export const RegisterWorkspaceDialog: React.FC<RegisterWorkspaceDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [description, setDescription] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const registerMutation = useRegisterWorkspace();

  const handleClose = () => {
    if (registerMutation.isPending) return;
    setErrorMessage(null);
    setName('');
    setRootPath('');
    setDescription('');
    setWorkspaceId('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !rootPath.trim()) return;

    setErrorMessage(null);

    try {
      const result = await registerMutation.mutateAsync({
        name: name.trim(),
        root_path: rootPath.trim(),
        description: description.trim() || undefined,
        workspace_id: workspaceId.trim() || undefined,
      });

      handleClose();
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to register workspace. Please verify directory path.');
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: tokens.colors.surfaceElevated,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: 2,
        },
      }}
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            pt: 2.5,
            px: 3,
            pb: 1,
            fontWeight: 600,
            fontSize: '1.125rem',
            color: tokens.colors.text.primary,
          }}
        >
          <FolderPlus size={22} color={tokens.colors.accentPrimary} />
          Register Workspace Directory
        </DialogTitle>

        <DialogContent sx={{ px: 3, py: 2 }}>
          <Stack spacing={2.5}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                backgroundColor: 'rgba(124, 140, 255, 0.08)',
                border: `1px solid rgba(124, 140, 255, 0.25)`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5,
              }}
            >
              <ShieldCheck size={20} color={tokens.colors.accentPrimary} style={{ flexShrink: 0, marginTop: 2 }} />
              <Typography variant="caption" sx={{ color: tokens.colors.text.secondary, lineHeight: 1.5 }}>
                ForgeGuard confines agent filesystem access strictly within this approved root directory.
                Files are evaluated locally on disk and are never uploaded or copied.
              </Typography>
            </Box>

            {errorMessage && (
              <Alert severity="error" sx={{ py: 0.5, fontSize: '0.85rem' }}>
                {errorMessage}
              </Alert>
            )}

            <TextField
              label="Workspace Name"
              required
              fullWidth
              size="small"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Payment Risk Service"
              disabled={registerMutation.isPending}
              inputProps={{ maxLength: 128 }}
            />

            <TextField
              label="Root Directory Path"
              required
              fullWidth
              size="small"
              value={rootPath}
              onChange={(e) => setRootPath(e.target.value)}
              placeholder="e.g. /home/user/projects/service or E:\Projects\service"
              disabled={registerMutation.isPending}
              inputProps={{ maxLength: 1024 }}
              helperText="Must be an existing directory on the host machine. System root directories are prohibited."
            />

            <TextField
              label="Description (Optional)"
              fullWidth
              size="small"
              multiline
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief context regarding workspace boundaries and purpose"
              disabled={registerMutation.isPending}
              inputProps={{ maxLength: 512 }}
            />

            <TextField
              label="Custom Workspace ID (Optional)"
              fullWidth
              size="small"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              placeholder="e.g. ws-payment-risk"
              disabled={registerMutation.isPending}
              inputProps={{ maxLength: 64 }}
              helperText="Leave empty to automatically generate a unique workspace identifier."
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, gap: 1 }}>
          <Button onClick={handleClose} variant="outlined" size="small" disabled={registerMutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            size="small"
            disabled={!name.trim() || !rootPath.trim() || registerMutation.isPending}
          >
            {registerMutation.isPending ? 'Registering...' : 'Register Workspace'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
