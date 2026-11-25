import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AlertTriangle,
  Binary,
  Check,
  Copy,
  FileText,
  Lock,
  X,
} from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { useWorkspaceFilePreview } from '../../api/hooks';
import { APIClientError } from '../../api/client';

interface FilePreviewModalProps {
  open: boolean;
  workspaceId: string;
  filePath: string | null;
  onClose: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  open,
  workspaceId,
  filePath,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  const {
    data: preview,
    isLoading,
    error,
  } = useWorkspaceFilePreview(workspaceId, filePath || '', 50000, open && Boolean(filePath));

  const handleCopy = () => {
    if (!preview?.content) return;
    navigator.clipboard.writeText(preview.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isForbiddenError =
    error instanceof APIClientError && (error.status === 403 || error.code === 'FG-WORKSPACE-403');

  return (
    <Dialog
      open={open && Boolean(filePath)}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: tokens.colors.surfaceElevated,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: 2,
          maxHeight: '85vh',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pt: 2.5,
          px: 3,
          pb: 1.5,
          borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minWidth: 0 }}>
          <FileText size={20} color={tokens.colors.accentPrimary} />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                color: tokens.colors.text.primary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {preview?.name || filePath?.split('/').pop() || 'File Preview'}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: tokens.colors.text.muted,
                fontFamily: tokens.typography.fontFamily.mono,
                fontSize: '0.75rem',
              }}
            >
              {filePath}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1}>
          {preview && !preview.is_binary && preview.content && (
            <Tooltip title={copied ? 'Copied!' : 'Copy file contents'}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleCopy}
                startIcon={copied ? <Check size={14} color={tokens.colors.accentSuccess} /> : <Copy size={14} />}
                sx={{
                  fontSize: '0.75rem',
                  py: 0.25,
                  px: 1,
                  borderColor: copied ? tokens.colors.accentSuccess : tokens.colors.border,
                  color: copied ? tokens.colors.accentSuccess : tokens.colors.text.secondary,
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </Tooltip>
          )}
          <IconButton size="small" onClick={onClose} sx={{ color: tokens.colors.text.muted }}>
            <X size={18} />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {isLoading && (
          <Stack spacing={1.5}>
            <Skeleton variant="rectangular" height={24} width="40%" sx={{ borderRadius: 1 }} />
            <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 1 }} />
          </Stack>
        )}

        {isForbiddenError && (
          <Box
            sx={{
              py: 5,
              px: 3,
              textAlign: 'center',
              backgroundColor: 'rgba(241, 108, 120, 0.06)',
              borderRadius: 1.5,
              border: `1px solid rgba(241, 108, 120, 0.25)`,
            }}
          >
            <Lock size={36} color={tokens.colors.error} style={{ marginBottom: 12 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: tokens.colors.error, mb: 1 }}>
              Access Denied: Sensitive File Protected
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.colors.text.secondary, maxWidth: 460, mx: 'auto' }}>
              ForgeGuard security policy blocks read-only previews of secret-bearing files, credentials, private keys,
              and environment configs to prevent credential leakage.
            </Typography>
          </Box>
        )}

        {error && !isForbiddenError && (
          <Alert severity="error" sx={{ my: 2 }}>
            {error.message || 'Failed to read file preview.'}
          </Alert>
        )}

        {preview && !isLoading && !error && (
          <Stack spacing={2}>
            {/* Metadata Chips Bar */}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip
                label={`Size: ${formatBytes(preview.size_bytes)}`}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.75rem',
                  fontFamily: tokens.typography.fontFamily.mono,
                  backgroundColor: tokens.colors.surfacePrimary,
                  color: tokens.colors.text.secondary,
                }}
              />
              <Chip
                label={preview.mime_type}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.75rem',
                  fontFamily: tokens.typography.fontFamily.mono,
                  backgroundColor: tokens.colors.surfacePrimary,
                  color: tokens.colors.text.muted,
                }}
              />
              {preview.is_truncated && (
                <Chip
                  icon={<AlertTriangle size={12} color={tokens.colors.accentWarning} />}
                  label={`Showing first ${formatBytes(preview.read_bytes)}`}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.75rem',
                    backgroundColor: 'rgba(240, 180, 90, 0.12)',
                    color: tokens.colors.accentWarning,
                    border: `1px solid rgba(240, 180, 90, 0.3)`,
                  }}
                />
              )}
            </Stack>

            {/* Binary File Alert */}
            {preview.is_binary ? (
              <Box
                sx={{
                  py: 6,
                  px: 3,
                  textAlign: 'center',
                  backgroundColor: tokens.colors.surfacePrimary,
                  borderRadius: 1.5,
                  border: `1px solid ${tokens.colors.borderSubtle}`,
                }}
              >
                <Binary size={36} color={tokens.colors.accentPrimary} style={{ marginBottom: 12 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: tokens.colors.text.primary, mb: 1 }}>
                  Binary File Detected
                </Typography>
                <Typography variant="body2" sx={{ color: tokens.colors.text.muted, maxWidth: 440, mx: 'auto' }}>
                  Raw binary file content cannot be safely previewed as text.
                </Typography>
              </Box>
            ) : (
              /* Plain Text Viewer */
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 2,
                  backgroundColor: tokens.colors.background,
                  border: `1px solid ${tokens.colors.borderSubtle}`,
                  borderRadius: 1.5,
                  color: tokens.colors.text.primary,
                  fontFamily: tokens.typography.fontFamily.mono,
                  fontSize: '0.8125rem',
                  lineHeight: 1.6,
                  overflowX: 'auto',
                  maxHeight: '52vh',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  userSelect: 'text',
                }}
              >
                {preview.content || '(File is empty)'}
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
        <Button onClick={onClose} variant="outlined" size="small">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
