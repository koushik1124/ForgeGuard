import React, { useState } from 'react';
import {
  Box,
  Breadcrumbs,
  Chip,
  IconButton,
  Link,
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
import {
  ChevronRight,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  Home,
  RefreshCw,
} from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { useWorkspaceFiles } from '../../api/hooks';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { EmptyState } from '../common/EmptyState';
import { ErrorState } from '../common/ErrorState';
import { FilePreviewModal } from './FilePreviewModal';

interface FileBrowserProps {
  workspaceId: string;
}

const formatBytes = (bytes?: number | null): string => {
  if (bytes === undefined || bytes === null) return '--';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileIcon = (fileName: string, isDirectory: boolean) => {
  if (isDirectory) {
    return <Folder size={18} color={tokens.colors.accentPrimary} />;
  }
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'json', 'yaml', 'yml', 'toml', 'sql', 'sh', 'html', 'css'].includes(ext || '')) {
    return <FileCode size={18} color={tokens.colors.accentSecondary} />;
  }
  return <FileText size={18} color={tokens.colors.text.secondary} />;
};

export const FileBrowser: React.FC<FileBrowserProps> = ({ workspaceId }) => {
  const [subpath, setSubpath] = useState<string>('');
  const [previewFile, setPreviewFile] = useState<string | null>(null);

  const {
    data: dirData,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useWorkspaceFiles(workspaceId, subpath);

  // Parse path segments for breadcrumbs
  const pathSegments = subpath ? subpath.split('/').filter(Boolean) : [];

  const handleNavigateBreadcrumb = (index: number) => {
    if (index === -1) {
      setSubpath('');
    } else {
      const target = pathSegments.slice(0, index + 1).join('/');
      setSubpath(target);
    }
  };

  const handleDirectoryClick = (dirRelativePath: string) => {
    setSubpath(dirRelativePath);
  };

  const handleFileClick = (fileRelativePath: string) => {
    setPreviewFile(fileRelativePath);
  };

  return (
    <Box>
      {/* Header bar with breadcrumbs and actions */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          p: 2,
          borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
          backgroundColor: tokens.colors.surfacePrimary,
        }}
      >
        <Breadcrumbs
          separator={<ChevronRight size={14} color={tokens.colors.text.muted} />}
          sx={{
            '& .MuiBreadcrumbs-ol': { alignItems: 'center' },
            fontFamily: tokens.typography.fontFamily.mono,
            fontSize: '0.85rem',
          }}
        >
          <Link
            component="button"
            underline="hover"
            onClick={() => handleNavigateBreadcrumb(-1)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              color: pathSegments.length === 0 ? tokens.colors.accentPrimary : tokens.colors.text.secondary,
              cursor: 'pointer',
              fontWeight: pathSegments.length === 0 ? 600 : 400,
            }}
          >
            <Home size={15} />
            <span>root</span>
          </Link>
          {pathSegments.map((segment, index) => {
            const isLast = index === pathSegments.length - 1;
            return (
              <Link
                key={segment}
                component="button"
                underline={isLast ? 'none' : 'hover'}
                onClick={() => !isLast && handleNavigateBreadcrumb(index)}
                sx={{
                  color: isLast ? tokens.colors.text.primary : tokens.colors.text.secondary,
                  fontWeight: isLast ? 600 : 400,
                  cursor: isLast ? 'default' : 'pointer',
                }}
              >
                {segment}
              </Link>
            );
          })}
        </Breadcrumbs>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <Chip
            label="Hidden dotfiles excluded"
            size="small"
            sx={{
              height: 22,
              fontSize: '0.7rem',
              backgroundColor: tokens.colors.surfaceElevated,
              color: tokens.colors.text.muted,
            }}
          />
          <Tooltip title="Refresh directory">
            <span>
              <IconButton
                size="small"
                onClick={() => refetch()}
                disabled={isFetching}
                sx={{ color: tokens.colors.text.secondary }}
              >
                <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      {/* Content Area */}
      <Box sx={{ p: 0 }}>
        {isLoading && (
          <Box sx={{ p: 2 }}>
            <LoadingSkeleton variant="table" rows={6} />
          </Box>
        )}

        {error && (
          <Box sx={{ p: 3 }}>
            <ErrorState
              title="Failed to Load Directory"
              message={error.message || 'Unable to read workspace directory contents.'}
              onRetry={() => refetch()}
            />
          </Box>
        )}

        {!isLoading && !error && dirData && dirData.entries.length === 0 && (
          <Box sx={{ p: 4 }}>
            <EmptyState
              icon={<FolderOpen size={40} color={tokens.colors.text.muted} />}
              title="This directory is empty"
              description="No files or subdirectories exist in this folder."
            />
          </Box>
        )}

        {!isLoading && !error && dirData && dirData.entries.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.2)' }}>
                  <TableCell sx={{ color: tokens.colors.text.muted, fontWeight: 600, py: 1.25 }}>Name</TableCell>
                  <TableCell sx={{ color: tokens.colors.text.muted, fontWeight: 600, width: 140 }}>Type</TableCell>
                  <TableCell sx={{ color: tokens.colors.text.muted, fontWeight: 600, width: 120, textAlign: 'right' }}>Size</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {/* Parent navigation row if inside subdirectory */}
                {pathSegments.length > 0 && (
                  <TableRow
                    hover
                    onClick={() => handleNavigateBreadcrumb(pathSegments.length - 2)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell colSpan={3} sx={{ py: 1.25, color: tokens.colors.text.secondary }}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Folder size={18} color={tokens.colors.accentPrimary} />
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: tokens.typography.fontFamily.mono,
                            fontSize: '0.8125rem',
                            color: tokens.colors.accentPrimary,
                          }}
                        >
                          .. (Parent Directory)
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                )}

                {dirData.entries.map((entry) => (
                  <TableRow
                    key={entry.relative_path}
                    hover
                    onClick={() => {
                      if (entry.is_directory) {
                        handleDirectoryClick(entry.relative_path);
                      } else {
                        handleFileClick(entry.relative_path);
                      }
                    }}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': {
                        backgroundColor: tokens.colors.surfaceElevated,
                      },
                    }}
                  >
                    <TableCell sx={{ py: 1.25 }}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        {getFileIcon(entry.name, entry.is_directory)}
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: tokens.typography.fontFamily.mono,
                            fontSize: '0.8125rem',
                            color: entry.is_directory ? tokens.colors.text.primary : tokens.colors.text.secondary,
                            fontWeight: entry.is_directory ? 500 : 400,
                          }}
                        >
                          {entry.name}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ py: 1.25 }}>
                      <Chip
                        label={entry.is_directory ? 'Directory' : entry.extension || 'file'}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.7rem',
                          fontFamily: tokens.typography.fontFamily.mono,
                          backgroundColor: entry.is_directory
                            ? 'rgba(124, 140, 255, 0.12)'
                            : tokens.colors.surfacePrimary,
                          color: entry.is_directory
                            ? tokens.colors.accentPrimary
                            : tokens.colors.text.muted,
                        }}
                      />
                    </TableCell>
                    <TableCell
                      sx={{
                        py: 1.25,
                        textAlign: 'right',
                        fontFamily: tokens.typography.fontFamily.mono,
                        fontSize: '0.775rem',
                        color: tokens.colors.text.muted,
                      }}
                    >
                      {formatBytes(entry.size_bytes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* File Preview Modal */}
      <FilePreviewModal
        open={Boolean(previewFile)}
        workspaceId={workspaceId}
        filePath={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </Box>
  );
};
