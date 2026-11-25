import React, { useState, useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  RotateCw,
  FolderLock,
  FileCheck,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { EmptyState } from '../components/common/EmptyState';
import { PolicyInspector } from '../components/governance/PolicyInspector';
import { useConnectionStore } from '../stores/connectionStore';
import { useTasks, useTaskDiagnostics } from '../api/hooks';
import { useTaskEvents } from '../api/sse/useTaskEvents';
import { extractPolicyDecisions } from '../api/governance/extractor';
import { tokens } from '../theme/tokens';

const RUNTIME_GUARDRAILS = [
  {
    title: 'Default-Deny Tool Authorization',
    category: 'Core Invariant',
    description: 'Every proposed tool call is blocked by default until explicitly evaluated and approved by policy rules.',
    icon: <ShieldCheck size={20} color={tokens.colors.success} />,
  },
  {
    title: 'Workspace Boundary Containment',
    category: 'Filesystem Sandboxing',
    description: 'Restricted workspace isolation prevents path traversal attacks (../) and restricts file access to the registered root.',
    icon: <FolderLock size={20} color={tokens.colors.accentPrimary} />,
  },
  {
    title: 'Protected Credential Defense',
    category: 'Secret Protection',
    description: 'Sensitive files including .env, .git, and private keys are classified as high-risk and blocked from read/write tools.',
    icon: <ShieldAlert size={20} color={tokens.colors.warning} />,
  },
  {
    title: 'Strict Argument Schema Validation',
    category: 'Contract Integrity',
    description: 'Tool input arguments are strictly validated against Pydantic schemas before authorization.',
    icon: <FileCheck size={20} color={tokens.colors.accentSecondary} />,
  },
];

export const PoliciesPage: React.FC = () => {
  const { connectionState } = useConnectionStore();
  const isDisconnected = connectionState === 'disconnected' || connectionState === 'error';

  // Task selection
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');

  // Fetch tasks
  const { data: taskData, refetch, isFetching } = useTasks({ limit: 50 });
  const tasks = taskData?.items ?? [];

  // Effective selected task ID (defaults to first task if none selected)
  const effectiveTaskId = selectedTaskId || (tasks.length > 0 ? tasks[0].task_id : '');
  const selectedTask = useMemo(() => tasks.find((t) => t.task_id === effectiveTaskId), [tasks, effectiveTaskId]);

  const taskEvents = useTaskEvents(effectiveTaskId, {
    enabled: Boolean(effectiveTaskId),
    isTaskTerminal: selectedTask ? ['completed', 'failed', 'cancelled'].includes(selectedTask.status?.toLowerCase() || '') : false,
  });

  const { data: diagnosticsData } = useTaskDiagnostics(effectiveTaskId, Boolean(effectiveTaskId));

  const policyDecisions = useMemo(() => {
    return extractPolicyDecisions(taskEvents.events, taskEvents.toolCalls, diagnosticsData?.timeline);
  }, [taskEvents.events, taskEvents.toolCalls, diagnosticsData?.timeline]);

  return (
    <Box>
      <PageHeader
        title="Security Policies"
        description="Inspect default-deny authorization rules, permission matrices, and runtime policy decisions."
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
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
              }}
            >
              {isFetching ? 'Refreshing' : 'Refresh'}
            </Button>
          </Stack>
        }
      />

      {/* Disconnected Alert */}
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
        >
          Runtime backend is disconnected. Displaying offline policy specifications.
        </Alert>
      )}

      <Stack spacing={3}>
        {/* Core Invariant Banner */}
        <Panel
          sx={{
            p: 2.5,
            backgroundColor: 'rgba(124, 140, 255, 0.04)',
            border: `1px solid rgba(124, 140, 255, 0.2)`,
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2.5} alignItems={{ md: 'center' }} justifyContent="space-between">
            <Box>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <Shield size={20} color={tokens.colors.accentPrimary} />
                <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                  Core Invariant: LLM proposes; ForgeGuard authorizes and executes.
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.muted, lineHeight: 1.6, maxWidth: 800 }}>
                Agents operate in an unprivileged proposal mode. Every tool dispatch (filesystem access, process execution, network calls)
                is intercepted by the ForgeGuard runtime policy engine. Actions are denied by default unless an explicit authorization rule permits them.
              </Typography>
            </Box>
            <Chip
              label="Default-Deny Active"
              color="success"
              size="small"
              sx={{
                fontWeight: 600,
                fontSize: '0.75rem',
                fontFamily: tokens.typography.fontFamily.mono,
                alignSelf: { xs: 'flex-start', md: 'center' },
              }}
            />
          </Stack>
        </Panel>

        {/* Runtime Security Guardrails Grid */}
        <Box>
          <Typography variant="h6" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: tokens.colors.text.primary, mb: 1.5 }}>
            Active Runtime Guardrails
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2,
            }}
          >
            {RUNTIME_GUARDRAILS.map((guardrail, idx) => (
              <Panel key={idx} sx={{ p: 2 }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: `${tokens.borderRadius.sm}px`,
                      backgroundColor: tokens.colors.surfaceElevated,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {guardrail.icon}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                        {guardrail.title}
                      </Typography>
                      <Chip
                        label={guardrail.category}
                        size="small"
                        sx={{
                          fontSize: '0.6875rem',
                          height: 20,
                          backgroundColor: tokens.colors.surfaceElevated,
                          color: tokens.colors.text.muted,
                        }}
                      />
                    </Stack>
                    <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.muted, lineHeight: 1.5 }}>
                      {guardrail.description}
                    </Typography>
                  </Box>
                </Stack>
              </Panel>
            ))}
          </Box>
        </Box>

        {/* Task Policy Decisions Inspector */}
        <Panel sx={{ p: 2.5 }}>
          <Box sx={{ mb: 2, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                Task Policy Authorization Log
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted }}>
                Select an execution task to inspect individual tool call authorization decisions, rules applied, and denial reasons.
              </Typography>
            </Box>

            {tasks.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 260 }}>
                <InputLabel id="policy-task-select-label">Select Task to Inspect</InputLabel>
                <Select
                  labelId="policy-task-select-label"
                  value={effectiveTaskId}
                  label="Select Task to Inspect"
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  sx={{ backgroundColor: tokens.colors.surfaceElevated, fontSize: '0.8125rem' }}
                >
                  {tasks.map((t) => (
                    <MenuItem key={t.task_id} value={t.task_id} sx={{ fontSize: '0.8125rem' }}>
                      {t.task_id} ({t.status})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>

          {tasks.length === 0 ? (
            <EmptyState
              icon={<Shield size={32} color={tokens.colors.text.muted} />}
              title="No Task Policy Decisions Recorded"
              description="No execution tasks have been submitted yet. When tasks execute, their tool authorization decisions will appear here."
              action={
                <Button
                  component={RouterLink}
                  to="/tasks"
                  variant="outlined"
                  size="small"
                  sx={{ color: tokens.colors.accentPrimary, borderColor: tokens.colors.accentPrimary, textTransform: 'none' }}
                >
                  Go to Task Explorer
                </Button>
              }
            />
          ) : (
            <Box>
              {selectedTask && (
                <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.text.secondary }}>
                    Inspecting Task: <strong style={{ color: tokens.colors.text.primary }}>{selectedTask.task_id}</strong> &mdash; {selectedTask.description}
                  </Typography>
                  <Button
                    component={RouterLink}
                    to={`/tasks/${selectedTask.task_id}`}
                    size="small"
                    endIcon={<ExternalLink size={13} />}
                    sx={{ fontSize: '0.75rem', color: tokens.colors.accentPrimary, textTransform: 'none' }}
                  >
                    Open Task
                  </Button>
                </Box>
              )}

              <PolicyInspector decisions={policyDecisions} />
            </Box>
          )}
        </Panel>
      </Stack>
    </Box>
  );
};

export default PoliciesPage;
