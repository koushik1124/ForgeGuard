import React, { useState, useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
  Alert,
} from '@mui/material';
import {
  Search,
  RotateCw,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ListTodo,
  AlertCircle,
  PlusCircle,
} from 'lucide-react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { DataTable, Column } from '../components/common/DataTable';
import { StatusBadge } from '../components/common/StatusBadge';
import { ErrorState } from '../components/common/ErrorState';
import { CreateTaskDialog } from '../components/task/CreateTaskDialog';
import { useConnectionStore } from '../stores/connectionStore';
import { useTasks } from '../api/hooks';
import { TaskResponse } from '../api/types';
import { tokens } from '../theme/tokens';

const STATUS_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Created', value: 'created' },
  { label: 'Running', value: 'running' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Cancelled', value: 'cancelled' },
] as const;

function formatDuration(startedAt?: string | null, finishedAt?: string | null, status?: string): string {
  if (startedAt && finishedAt) {
    const start = new Date(startedAt).getTime();
    const end = new Date(finishedAt).getTime();
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      const diffMs = end - start;
      if (diffMs < 1000) return `${diffMs}ms`;
      const diffSecs = (diffMs / 1000).toFixed(2);
      if (Number(diffSecs) < 60) return `${diffSecs}s`;
      const mins = Math.floor(diffMs / 60000);
      const remainingSecs = Math.floor((diffMs % 60000) / 1000);
      return `${mins}m ${remainingSecs}s`;
    }
  }
  if (startedAt && status === 'running') {
    const start = new Date(startedAt).getTime();
    if (!isNaN(start)) {
      const elapsedSecs = Math.max(0, Math.floor((Date.now() - start) / 1000));
      return `${elapsedSecs}s (running)`;
    }
  }
  if (status === 'created') {
    return 'Pending';
  }
  return '--';
}

function formatTimestamp(isoString?: string | null): string {
  if (!isoString) return '--';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const TaskExplorerPage: React.FC = () => {
  const navigate = useNavigate();
  const { connectionState } = useConnectionStore();
  const isDisconnected = connectionState === 'disconnected' || connectionState === 'error';

  // Server-side query state
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [pageSize, setPageSize] = useState<number>(20);
  const [pageOffset, setPageOffset] = useState<number>(0);

  // Client-side search within current page
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Task creation dialog
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState<boolean>(false);

  // Server-side status param
  const statusParam = selectedStatus === 'all' ? undefined : selectedStatus;

  const tasksQuery = useTasks({
    status: statusParam,
    limit: pageSize,
    offset: pageOffset,
  });

  const { data: taskData, isLoading, isError, error, refetch, isFetching } = tasksQuery;

  // Handle status filter change
  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    setPageOffset(0); // Reset to first page
  };

  // Handle page size change
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPageOffset(0);
  };

  // Raw items from API
  const items = taskData?.items ?? [];

  // Client-side search filtering on current page
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    const term = searchTerm.toLowerCase().trim();
    return items.filter(
      (task) =>
        task.task_id.toLowerCase().includes(term) ||
        task.description.toLowerCase().includes(term) ||
        (task.workspace_id && task.workspace_id.toLowerCase().includes(term))
    );
  }, [items, searchTerm]);

  // Status counts scoped to current result set
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: items.length,
      created: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };
    for (const item of items) {
      const s = item.status?.toLowerCase();
      if (s && counts[s] !== undefined) {
        counts[s]++;
      }
    }
    return counts;
  }, [items]);

  // Current page number (1-based)
  const currentPage = Math.floor(pageOffset / pageSize) + 1;
  const hasNextPage = items.length === pageSize;
  const hasPrevPage = pageOffset > 0;

  // Table columns definition
  const columns: Column<TaskResponse>[] = [
    {
      id: 'task_id',
      label: 'Task ID',
      width: '180px',
      isMono: true,
      render: (task) => (
        <Tooltip title={`View execution detail for ${task.task_id}`} arrow>
          <Box
            component={RouterLink}
            to={`/tasks/${task.task_id}`}
            onClick={(e) => e.stopPropagation()}
            sx={{
              color: tokens.colors.accentPrimary,
              textDecoration: 'none',
              fontFamily: tokens.typography.fontFamily.mono,
              fontWeight: 600,
              fontSize: '0.8125rem',
              '&:hover': {
                textDecoration: 'underline',
              },
            }}
          >
            {task.task_id}
          </Box>
        </Tooltip>
      ),
    },
    {
      id: 'description',
      label: 'Prompt / Description',
      render: (task) => (
        <Tooltip title={task.description} arrow placement="top-start">
          <Typography
            sx={{
              fontSize: '0.8125rem',
              color: tokens.colors.text.primary,
              maxWidth: { xs: '200px', sm: '320px', md: '450px' },
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {task.description}
          </Typography>
        </Tooltip>
      ),
    },
    {
      id: 'status',
      label: 'Status',
      width: '140px',
      render: (task) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StatusBadge status={task.status} />
          {task.error_summary && (
            <Tooltip title={`Error: ${task.error_summary}`} arrow>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: tokens.colors.error,
                  flexShrink: 0,
                }}
              />
            </Tooltip>
          )}
        </Box>
      ),
    },
    {
      id: 'workspace',
      label: 'Workspace',
      width: '130px',
      render: (task) => {
        const wsId =
          task.workspace_id ||
          (task.metadata?.workspace_id as string | undefined) ||
          'default';
        return (
          <Chip
            size="small"
            label={wsId}
            sx={{
              height: 20,
              fontSize: '0.6875rem',
              fontFamily: tokens.typography.fontFamily.mono,
              backgroundColor: tokens.colors.surfaceElevated,
              color: tokens.colors.text.secondary,
              border: `1px solid ${tokens.colors.borderSubtle}`,
            }}
          />
        );
      },
    },
    {
      id: 'created_at',
      label: 'Created',
      width: '160px',
      render: (task) => (
        <Typography
          sx={{
            fontSize: '0.75rem',
            color: tokens.colors.text.secondary,
            fontFamily: tokens.typography.fontFamily.mono,
          }}
        >
          {formatTimestamp(task.created_at)}
        </Typography>
      ),
    },
    {
      id: 'duration',
      label: 'Duration',
      width: '110px',
      render: (task) => (
        <Typography
          sx={{
            fontSize: '0.75rem',
            color: tokens.colors.text.secondary,
            fontFamily: tokens.typography.fontFamily.mono,
          }}
        >
          {formatDuration(task.started_at, task.finished_at, task.status)}
        </Typography>
      ),
    },
    {
      id: 'actions',
      label: '',
      width: '70px',
      align: 'right',
      render: (task) => (
        <Tooltip title="Open task detail" arrow>
          <IconButton
            size="small"
            component={RouterLink}
            to={`/tasks/${task.task_id}`}
            onClick={(e) => e.stopPropagation()}
            sx={{
              color: tokens.colors.text.muted,
              '&:hover': {
                color: tokens.colors.accentPrimary,
                backgroundColor: tokens.colors.surfaceElevated,
              },
            }}
          >
            <ExternalLink size={15} />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Task Explorer"
        description="Inspect, filter, search, and audit all governed AI agent executions across their lifecycle."
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              variant="contained"
              size="small"
              onClick={() => setIsCreateDialogOpen(true)}
              startIcon={<PlusCircle size={14} />}
              sx={{
                backgroundColor: tokens.colors.accentPrimary,
                color: '#ffffff',
                fontSize: '0.8125rem',
                fontWeight: 600,
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: tokens.colors.accentPrimaryHover,
                },
              }}
            >
              Create Task
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => refetch()}
              disabled={isFetching}
              startIcon={
                <RotateCw
                  size={14}
                  style={{
                    animation: isFetching ? 'spin 1s linear infinite' : undefined,
                  }}
                />
              }
              sx={{
                color: tokens.colors.text.primary,
                borderColor: tokens.colors.border,
                fontSize: '0.8125rem',
                textTransform: 'none',
                minWidth: 100,
              }}
            >
              {isFetching ? 'Refreshing' : 'Refresh'}
            </Button>
          </Stack>
        }
      />

      {/* Disconnected Warning Banner */}
      {isDisconnected && (
        <Alert
          severity="warning"
          icon={<AlertCircle size={18} />}
          sx={{
            mb: 3,
            backgroundColor: tokens.colors.warningSubtle,
            border: `1px solid rgba(240, 180, 90, 0.3)`,
            color: tokens.colors.text.primary,
          }}
          action={
            <Button
              component={RouterLink}
              to="/settings"
              size="small"
              sx={{ color: tokens.colors.warning, textTransform: 'none', fontWeight: 600 }}
            >
              Settings
            </Button>
          }
        >
          ForgeGuard runtime API is disconnected. Displaying offline or cached task records.
        </Alert>
      )}

      {/* Control Panel: Search & Status Filters */}
      <Panel sx={{ mb: 3, p: 2 }}>
        <Stack spacing={2}>
          {/* Top Row: Search Input */}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Filter current page by Task ID or prompt..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} color={tokens.colors.text.muted} />
                  </InputAdornment>
                ),
                endAdornment: searchTerm ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchTerm('')}>
                      <X size={14} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
              sx={{
                maxWidth: { xs: '100%', sm: 450 },
                '& .MuiOutlinedInput-root': {
                  backgroundColor: tokens.colors.surfaceElevated,
                  fontSize: '0.8125rem',
                },
              }}
            />
            {searchTerm && (
              <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.secondary }}>
                Filtering current page ({filteredItems.length} of {items.length} tasks)
              </Typography>
            )}
          </Box>

          {/* Bottom Row: Status Filter Chips */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, fontWeight: 600, mr: 0.5 }}>
              STATUS:
            </Typography>
            {STATUS_FILTERS.map((filter) => {
              const isSelected = selectedStatus === filter.value;
              const count = statusCounts[filter.value];

              return (
                <Chip
                  key={filter.value}
                  label={
                    items.length > 0 && count !== undefined
                      ? `${filter.label} (${count})`
                      : filter.label
                  }
                  size="small"
                  clickable
                  onClick={() => handleStatusChange(filter.value)}
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: isSelected ? 600 : 500,
                    backgroundColor: isSelected
                      ? tokens.colors.primarySubtle
                      : tokens.colors.surfaceElevated,
                    color: isSelected
                      ? tokens.colors.accentPrimary
                      : tokens.colors.text.secondary,
                    border: `1px solid ${
                      isSelected ? tokens.colors.accentPrimary : tokens.colors.borderSubtle
                    }`,
                    '&:hover': {
                      backgroundColor: isSelected
                        ? tokens.colors.primarySubtle
                        : tokens.colors.surfaceElevated,
                    },
                  }}
                />
              );
            })}
          </Box>
        </Stack>
      </Panel>

      {/* Main Task Records View */}
      {isError ? (
        <ErrorState
          title="Failed to retrieve execution records"
          message={error?.message || 'An unexpected error occurred while contacting the ForgeGuard task API.'}
          onRetry={() => refetch()}
        />
      ) : (
        <Panel sx={{ overflow: 'hidden' }}>
          <DataTable<TaskResponse>
            columns={columns}
            data={filteredItems}
            loading={isLoading}
            onRowClick={(task) => navigate(`/tasks/${task.task_id}`)}
            emptyTitle={searchTerm ? 'No matching tasks' : 'No execution tasks found'}
            emptyDescription={
              searchTerm
                ? `No tasks match search term "${searchTerm}" on the current page.`
                : selectedStatus !== 'all'
                ? `No tasks currently have status '${selectedStatus}'.`
                : 'No governed agent executions have been recorded yet.'
            }
            emptyIcon={<ListTodo size={32} color={tokens.colors.accentPrimary} />}
            emptyAction={
              searchTerm || selectedStatus !== 'all' ? (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedStatus('all');
                  }}
                  sx={{ textTransform: 'none', color: tokens.colors.text.primary }}
                >
                  Clear Filters
                </Button>
              ) : undefined
            }
          />

          {/* Pagination Controls */}
          {!isLoading && items.length > 0 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2.5,
                py: 1.5,
                borderTop: `1px solid ${tokens.colors.borderSubtle}`,
                backgroundColor: tokens.colors.surfacePrimary,
                flexWrap: 'wrap',
                gap: 2,
              }}
            >
              {/* Left: Scope & offset disclosure */}
              <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.secondary }}>
                Showing tasks {pageOffset + 1}–{pageOffset + items.length} (Page {currentPage})
              </Typography>

              {/* Right: Page Size & Nav Buttons */}
              <Stack direction="row" spacing={2} alignItems="center">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted }}>
                    Per page:
                  </Typography>
                  <Select
                    size="small"
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    sx={{
                      fontSize: '0.75rem',
                      height: 28,
                      color: tokens.colors.text.primary,
                      backgroundColor: tokens.colors.surfaceElevated,
                      '& .MuiSelect-select': { py: 0.5, px: 1 },
                    }}
                  >
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={20}>20</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                  </Select>
                </Box>

                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!hasPrevPage || isFetching}
                    onClick={() => setPageOffset(Math.max(0, pageOffset - pageSize))}
                    startIcon={<ChevronLeft size={14} />}
                    sx={{
                      fontSize: '0.75rem',
                      textTransform: 'none',
                      py: 0.25,
                      px: 1,
                      borderColor: tokens.colors.borderSubtle,
                      color: tokens.colors.text.primary,
                    }}
                  >
                    Previous
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!hasNextPage || isFetching}
                    onClick={() => setPageOffset(pageOffset + pageSize)}
                    endIcon={<ChevronRight size={14} />}
                    sx={{
                      fontSize: '0.75rem',
                      textTransform: 'none',
                      py: 0.25,
                      px: 1,
                      borderColor: tokens.colors.borderSubtle,
                      color: tokens.colors.text.primary,
                    }}
                  >
                    Next
                  </Button>
                </Stack>
              </Stack>
            </Box>
          )}
        </Panel>
      )}

      {/* Task Creation Dialog */}
      <CreateTaskDialog
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSuccess={(newTask) => {
          refetch();
          navigate(`/tasks/${newTask.task_id}`);
        }}
      />
    </Box>
  );
};

export default TaskExplorerPage;
