import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  PlusCircle,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Gauge,
  AlertCircle,
  RotateCw,
} from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { useSubmitTask, useWorkspaces } from '../../api/hooks';
import { APIClientError } from '../../api/client';
import { TaskResponse, TaskSubmitRequest, WorkspaceResponse } from '../../api/types';
import { useConnectionStore } from '../../stores/connectionStore';

export interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (task: TaskResponse) => void;
  initialWorkspaceId?: string;
}

export const CreateTaskDialog: React.FC<CreateTaskDialogProps> = ({
  open,
  onClose,
  onSuccess,
  initialWorkspaceId,
}) => {
  const { connectionState } = useConnectionStore();
  const isDisconnected = connectionState === 'disconnected' || connectionState === 'error';

  // Form fields
  const [prompt, setPrompt] = useState('');
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId || '');
  const [executionMode, setExecutionMode] = useState<'agent' | 'tool_calls'>('agent');

  // Advanced Budget Overrides
  const [showBudgets, setShowBudgets] = useState(false);
  const [maxToolCalls, setMaxToolCalls] = useState<string>('');
  const [maxExecutionSeconds, setMaxExecutionSeconds] = useState<string>('');
  const [maxOutputBytes, setMaxOutputBytes] = useState<string>('');
  const [maxToolDurationSeconds, setMaxToolDurationSeconds] = useState<string>('');

  // UI state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Queries & Mutations
  const { data: workspacesData, isLoading: isLoadingWorkspaces } = useWorkspaces(open);
  const submitMutation = useSubmitTask();

  const handleClose = () => {
    if (submitMutation.isPending) return;
    setErrorMessage(null);
    setPrompt('');
    setWorkspaceId(initialWorkspaceId || '');
    setExecutionMode('agent');
    setMaxToolCalls('');
    setMaxExecutionSeconds('');
    setMaxOutputBytes('');
    setMaxToolDurationSeconds('');
    setShowBudgets(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setErrorMessage('Task prompt is required.');
      return;
    }

    if (trimmedPrompt.length > 50000) {
      setErrorMessage('Task prompt exceeds the 50,000 character limit.');
      return;
    }

    setErrorMessage(null);

    // Build budget override if any values were specified
    let budgetOverride: TaskSubmitRequest['budget'] = undefined;
    const numToolCalls = maxToolCalls.trim() ? parseInt(maxToolCalls.trim(), 10) : undefined;
    const numExecSecs = maxExecutionSeconds.trim() ? parseFloat(maxExecutionSeconds.trim()) : undefined;
    const numOutputBytes = maxOutputBytes.trim() ? parseInt(maxOutputBytes.trim(), 10) : undefined;
    const numToolDuration = maxToolDurationSeconds.trim() ? parseFloat(maxToolDurationSeconds.trim()) : undefined;

    if (
      numToolCalls !== undefined ||
      numExecSecs !== undefined ||
      numOutputBytes !== undefined ||
      numToolDuration !== undefined
    ) {
      budgetOverride = {
        max_tool_calls: numToolCalls,
        max_execution_seconds: numExecSecs,
        max_output_bytes: numOutputBytes,
        max_tool_duration_seconds: numToolDuration,
      };
    }

    const payload: TaskSubmitRequest = {
      prompt: trimmedPrompt,
      workspace_id: workspaceId.trim() ? workspaceId.trim() : null,
      execution_mode: executionMode,
      budget: budgetOverride,
    };

    try {
      const createdTask = await submitMutation.mutateAsync(payload);
      handleClose();
      onSuccess(createdTask);
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to submit task. Please verify backend connection.');
      }
    }
  };

  const workspaces: WorkspaceResponse[] = workspacesData?.workspaces ?? [];

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: tokens.colors.surfaceCard,
          backgroundImage: 'none',
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: `${tokens.borderRadius.md}px`,
        },
      }}
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle
          sx={{
            px: 3,
            py: 2.5,
            borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              p: 1,
              borderRadius: `${tokens.borderRadius.sm}px`,
              backgroundColor: 'rgba(124, 140, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: tokens.colors.accentPrimary,
            }}
          >
            <PlusCircle size={20} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, color: tokens.colors.text.primary }}>
              Create Governed Task
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted }}>
              Submit an agent task governed by runtime policies and execution budgets
            </Typography>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <Stack spacing={2.5}>
            {/* Disconnected Warning */}
            {isDisconnected && (
              <Alert
                severity="warning"
                icon={<AlertCircle size={18} />}
                sx={{
                  backgroundColor: tokens.colors.warningSubtle,
                  border: `1px solid rgba(240, 180, 90, 0.3)`,
                  color: tokens.colors.text.primary,
                  fontSize: '0.8125rem',
                }}
              >
                Runtime backend is disconnected. Task submission may fail until connection is restored.
              </Alert>
            )}

            {/* Error Message */}
            {errorMessage && (
              <Alert
                severity="error"
                onClose={() => setErrorMessage(null)}
                sx={{
                  backgroundColor: tokens.colors.errorSubtle,
                  border: `1px solid rgba(255, 99, 132, 0.3)`,
                  color: tokens.colors.text.primary,
                  fontSize: '0.8125rem',
                }}
              >
                {errorMessage}
              </Alert>
            )}

            {/* Prompt / Instruction */}
            <Box>
              <TextField
                label="Task Prompt / Objective"
                required
                fullWidth
                multiline
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what the agent should accomplish (e.g. Inspect the workspace directory, review payment risk logs, and summarize anomalies)..."
                helperText={`${prompt.length.toLocaleString()} / 50,000 characters`}
                disabled={submitMutation.isPending}
                autoFocus
                sx={{
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: tokens.colors.surfaceElevated,
                    fontFamily: 'inherit',
                  },
                }}
              />
            </Box>

            {/* Target Workspace */}
            <FormControl fullWidth size="small">
              <InputLabel id="task-workspace-label">Execution Workspace</InputLabel>
              <Select
                labelId="task-workspace-label"
                value={workspaceId}
                label="Execution Workspace"
                onChange={(e) => setWorkspaceId(e.target.value)}
                disabled={submitMutation.isPending || isLoadingWorkspaces}
                sx={{ backgroundColor: tokens.colors.surfaceElevated }}
              >
                <MenuItem value="">
                  <em>None (Unscoped / Temporary Workspace)</em>
                </MenuItem>
                {workspaces.map((ws) => (
                  <MenuItem key={ws.workspace_id} value={ws.workspace_id}>
                    {ws.name} ({ws.workspace_id})
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText sx={{ color: tokens.colors.text.muted }}>
                Constrains agent file and tool execution within the selected directory boundary
              </FormHelperText>
            </FormControl>

            {/* Execution Mode */}
            <FormControl fullWidth size="small">
              <InputLabel id="task-mode-label">Execution Mode</InputLabel>
              <Select
                labelId="task-mode-label"
                value={executionMode}
                label="Execution Mode"
                onChange={(e) => setExecutionMode(e.target.value as 'agent' | 'tool_calls')}
                disabled={submitMutation.isPending}
                sx={{ backgroundColor: tokens.colors.surfaceElevated }}
              >
                <MenuItem value="agent">Agent (Autonomous LLM loop with policy authorization)</MenuItem>
                <MenuItem value="tool_calls">Direct Tool Invocations</MenuItem>
              </Select>
              <FormHelperText sx={{ color: tokens.colors.text.muted }}>
                ForgeGuard authorizes every proposed tool call prior to execution
              </FormHelperText>
            </FormControl>

            {/* Collapsible Budget Overrides */}
            <Box
              sx={{
                border: `1px solid ${tokens.colors.borderSubtle}`,
                borderRadius: `${tokens.borderRadius.sm}px`,
                backgroundColor: tokens.colors.surfaceElevated,
                overflow: 'hidden',
              }}
            >
              <Box
                onClick={() => setShowBudgets(!showBudgets)}
                sx={{
                  p: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  userSelect: 'none',
                  '&:hover': {
                    backgroundColor: tokens.colors.surfaceSubtle,
                  },
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Gauge size={16} color={tokens.colors.accentPrimary} />
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                    Resource Budget Overrides (Optional)
                  </Typography>
                </Stack>
                {showBudgets ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </Box>

              <Collapse in={showBudgets}>
                <Divider sx={{ borderColor: tokens.colors.borderSubtle }} />
                <Box sx={{ p: 2 }}>
                  <Stack spacing={2}>
                    <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted }}>
                      Configure custom execution guardrails. Server-enforced maxima apply if values exceed policy limits.
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                      <TextField
                        size="small"
                        label="Max Tool Calls"
                        placeholder="50"
                        type="number"
                        inputProps={{ min: 1, max: 100 }}
                        value={maxToolCalls}
                        onChange={(e) => setMaxToolCalls(e.target.value)}
                        disabled={submitMutation.isPending}
                        fullWidth
                      />
                      <TextField
                        size="small"
                        label="Max Duration (sec)"
                        placeholder="300"
                        type="number"
                        inputProps={{ min: 1, max: 600, step: 1 }}
                        value={maxExecutionSeconds}
                        onChange={(e) => setMaxExecutionSeconds(e.target.value)}
                        disabled={submitMutation.isPending}
                        fullWidth
                      />
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                      <TextField
                        size="small"
                        label="Max Output Bytes"
                        placeholder="1000000"
                        type="number"
                        inputProps={{ min: 1000, max: 10000000 }}
                        value={maxOutputBytes}
                        onChange={(e) => setMaxOutputBytes(e.target.value)}
                        disabled={submitMutation.isPending}
                        fullWidth
                      />
                      <TextField
                        size="small"
                        label="Per-Tool Timeout (sec)"
                        placeholder="30"
                        type="number"
                        inputProps={{ min: 1, max: 120, step: 0.5 }}
                        value={maxToolDurationSeconds}
                        onChange={(e) => setMaxToolDurationSeconds(e.target.value)}
                        disabled={submitMutation.isPending}
                        fullWidth
                      />
                    </Stack>
                  </Stack>
                </Box>
              </Collapse>
            </Box>

            {/* Policy Invariant Notice */}
            <Box
              sx={{
                p: 1.5,
                borderRadius: `${tokens.borderRadius.sm}px`,
                backgroundColor: 'rgba(74, 222, 128, 0.05)',
                border: '1px solid rgba(74, 222, 128, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <ShieldCheck size={18} color={tokens.colors.success} style={{ flexShrink: 0 }} />
              <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, lineHeight: 1.4 }}>
                <strong>Invariant:</strong> LLM proposes; ForgeGuard authorizes and executes. All tool calls evaluate
                against default-deny policy rules before execution.
              </Typography>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions
          sx={{
            px: 3,
            py: 2,
            borderTop: `1px solid ${tokens.colors.borderSubtle}`,
            justifyContent: 'space-between',
          }}
        >
          <Button
            onClick={handleClose}
            disabled={submitMutation.isPending}
            sx={{
              color: tokens.colors.text.muted,
              textTransform: 'none',
              fontSize: '0.8125rem',
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitMutation.isPending || !prompt.trim()}
            startIcon={
              submitMutation.isPending ? (
                <RotateCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <PlusCircle size={14} />
              )
            }
            sx={{
              backgroundColor: tokens.colors.accentPrimary,
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.8125rem',
              textTransform: 'none',
              px: 2.5,
              '&:hover': {
                backgroundColor: tokens.colors.accentPrimaryHover,
              },
            }}
          >
            {submitMutation.isPending ? 'Submitting Task...' : 'Submit Task'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
