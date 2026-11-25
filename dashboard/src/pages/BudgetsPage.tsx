import React, { useState, useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import {
  Gauge,
  Clock,
  HardDrive,
  AlertTriangle,
  RotateCw,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { MetricCard } from '../components/common/MetricCard';
import { EmptyState } from '../components/common/EmptyState';
import { BudgetInspector } from '../components/governance/BudgetInspector';
import { useConnectionStore } from '../stores/connectionStore';
import { useTasks, useTaskDiagnostics } from '../api/hooks';
import { useTaskEvents } from '../api/sse/useTaskEvents';
import { extractBudgetState, computeBudgetMetrics } from '../api/governance/extractor';
import { tokens } from '../theme/tokens';

export const BudgetsPage: React.FC = () => {
  const { connectionState } = useConnectionStore();
  const isDisconnected = connectionState === 'disconnected' || connectionState === 'error';

  // Task selection
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');

  // Fetch tasks
  const { data: taskData, refetch, isFetching } = useTasks({ limit: 50 });
  const tasks = taskData?.items ?? [];

  // Effective selected task ID
  const effectiveTaskId = selectedTaskId || (tasks.length > 0 ? tasks[0].task_id : '');
  const selectedTask = useMemo(() => tasks.find((t) => t.task_id === effectiveTaskId), [tasks, effectiveTaskId]);

  // Load diagnostics and events for the selected task to extract governance records
  const { data: diagnosticsData } = useTaskDiagnostics(effectiveTaskId, Boolean(effectiveTaskId));
  const taskEvents = useTaskEvents(effectiveTaskId, {
    enabled: Boolean(effectiveTaskId),
    isTaskTerminal: selectedTask ? ['completed', 'failed', 'cancelled'].includes(selectedTask.status?.toLowerCase() || '') : false,
  });

  const budgetSnapshot = diagnosticsData?.budget_snapshot || selectedTask?.budget_summary;
  const budgetState = useMemo(() => {
    return extractBudgetState(taskEvents.events, budgetSnapshot);
  }, [taskEvents.events, budgetSnapshot]);

  const budgetMetrics = useMemo(() => {
    return computeBudgetMetrics(budgetState);
  }, [budgetState]);

  return (
    <Box>
      <PageHeader
        title="Resource Budgets"
        description="Execution limits, tool quotas, timeouts, and runtime budget exhaustion forensics."
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
          Runtime backend is disconnected. Displaying default budget guardrail thresholds.
        </Alert>
      )}

      <Stack spacing={3}>
        {/* Default Runtime Budget Guardrails Grid */}
        <Box>
          <Typography variant="h6" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: tokens.colors.text.primary, mb: 1.5 }}>
            Runtime Default Guardrail Thresholds
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
              gap: 2,
            }}
          >
            <MetricCard
              label="Max Tool Invocations"
              value="50 calls"
              subtitle="Per-task upper limit"
              icon={<Gauge size={20} color={tokens.colors.accentPrimary} />}
            />
            <MetricCard
              label="Max Wall-Clock Time"
              value="300 sec"
              subtitle="5 minutes execution ceiling"
              icon={<Clock size={20} color={tokens.colors.accentWarning} />}
            />
            <MetricCard
              label="Max Output Size"
              value="1.0 MB"
              subtitle="1,000,000 output bytes"
              icon={<HardDrive size={20} color={tokens.colors.accentSuccess} />}
            />
            <MetricCard
              label="Failure Streak Cap"
              value="3 errors"
              subtitle="Consecutive error tripwire"
              icon={<AlertTriangle size={20} color={tokens.colors.error} />}
            />
          </Box>
        </Box>

        {/* Task-Level Budget Consumption Inspector */}
        <Panel sx={{ p: 2.5 }}>
          <Box sx={{ mb: 2, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 2 }}>
            <Box>
              <Typography variant="h6" sx={{ fontSize: '0.9375rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                Task Budget Consumption & Forensics
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted }}>
                Select an execution task to inspect consumed quotas, remaining allowances, and exhaustion warnings.
              </Typography>
            </Box>

            {tasks.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 260 }}>
                <InputLabel id="budget-task-select-label">Select Task to Inspect</InputLabel>
                <Select
                  labelId="budget-task-select-label"
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
              icon={<Gauge size={32} color={tokens.colors.text.muted} />}
              title="No Task Budget Data Recorded"
              description="No execution tasks have been submitted yet. When tasks execute, their resource drawdowns and remaining allowances will appear here."
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

              <BudgetInspector budgetState={budgetState} metrics={budgetMetrics} />
            </Box>
          )}
        </Panel>
      </Stack>
    </Box>
  );
};

export default BudgetsPage;
