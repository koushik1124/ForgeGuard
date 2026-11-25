import React from 'react';
import { Box, Button, Typography, Chip, Stack } from '@mui/material';
import { useLocation, Link as RouterLink, useParams } from 'react-router-dom';
import {
  ListTodo,
  Radio,
  Shield,
  Coins,
  History,
  FolderKanban,
  FlaskConical,
  BarChart3,
  ArrowLeft,
  FileCode,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { tokens } from '../theme/tokens';

interface PlaceholderConfig {
  title: string;
  category: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
}

const ROUTE_CONFIGS: Record<string, PlaceholderConfig> = {
  '/tasks': {
    title: 'Execution Tasks',
    category: 'Runtime Core',
    description: 'Inspect, filter, search, and track all agent execution tasks across their full lifecycle.',
    icon: <ListTodo size={32} color={tokens.colors.accentPrimary} />,
    features: [
      'Comprehensive task list with status, step count, and error filters',
      'Pagination and workspace-scoped views',
      'Live task duration and execution cost tracking',
      'Direct link to task detail inspection and step replay',
    ],
  },
  '/live': {
    title: 'Live Runs & Streaming',
    category: 'Live Observability',
    description: 'Real-time agent execution stream powered by Server-Sent Events (SSE) and event journals.',
    icon: <Radio size={32} color={tokens.colors.accentWarning} />,
    features: [
      'Real-time streaming event viewer for active tasks',
      'Tool dispatch, policy authorization, and execution timeline',
      'Live LLM token consumption and latency metrics',
      'Instant cancellation and abort controls',
    ],
  },
  '/policies': {
    title: 'Security Policies',
    category: 'Security & Governance',
    description: 'Default-deny authorization rules, permission matrices, and security audit log.',
    icon: <Shield size={32} color={tokens.colors.accentPrimary} />,
    features: [
      'Active policy rule inspector and default-deny validator',
      'Tool authorization rules and argument constraints',
      'Policy denial audit log with full denial context',
      'Interactive policy simulator and tester',
    ],
  },
  '/budgets': {
    title: 'Resource Budgets',
    category: 'Governance & Limits',
    description: 'Execution limits, token quotas, wall-clock limits, and budget exhaustion forensics.',
    icon: <Coins size={32} color={tokens.colors.accentSuccess} />,
    features: [
      'Per-task and per-workspace budget allocation and tracking',
      'Token consumption, execution step limits, and tool call caps',
      'Budget violation alarms and automated enforcement events',
      'Cost forecasting and model usage analytics',
    ],
  },
  '/recovery': {
    title: 'Crash Recovery & State',
    category: 'Durability & Fault Tolerance',
    description: 'Durable execution state, checkpoints, event journals, and replay mechanics.',
    icon: <History size={32} color={tokens.colors.accentSecondary} />,
    features: [
      'Atomic checkpoint inspector and state reconstruction',
      'Crash detection and uncommitted state recovery viewer',
      'Idempotency replay log ensuring safe side-effect recovery',
      'Event journal timeline with forward recovery replay',
    ],
  },
  '/workspaces': {
    title: 'Workspaces & Isolation',
    category: 'Platform Sandboxing',
    description: 'Multi-tenant isolation, directory boundaries, and workspace-scoped execution environments.',
    icon: <FolderKanban size={32} color={tokens.colors.accentPrimary} />,
    features: [
      'Workspace lifecycle and directory containment verification',
      'Cross-workspace security boundary validation',
      'Resource quotas and task isolation',
      'Artifact retention policies and filesystem sandboxing',
    ],
  },
  '/evaluations': {
    title: 'Reliability Evaluations',
    category: 'Verification & Benchmarks',
    description: 'Benchmark suites, fault injection experiments, and agent reliability scorecards.',
    icon: <FlaskConical size={32} color={tokens.colors.accentWarning} />,
    features: [
      'Automated benchmark suite execution and results visualizer',
      'Chaos and fault injection test reports (process crashes, timeouts)',
      'Deterministic mock vs. live LLM agent reliability scorecards',
      'Regression detection and execution consistency metrics',
    ],
  },
  '/metrics': {
    title: 'Metrics & Telemetry',
    category: 'Platform Telemetry',
    description: 'Comprehensive runtime telemetry, OpenTelemetry spans, and execution histograms.',
    icon: <BarChart3 size={32} color={tokens.colors.accentSuccess} />,
    features: [
      'Engine throughput, task latency distributions, and p99 metrics',
      'Tool execution histograms and error rate breakdown',
      'Database query times and persistence lock contention metrics',
      'Exportable OpenTelemetry traces and Prometheus metric endpoints',
    ],
  },
};

export const PlaceholderPage: React.FC = () => {
  const location = useLocation();
  const { taskId } = useParams();

  let config = ROUTE_CONFIGS[location.pathname];

  if (!config && taskId) {
    config = {
      title: `Task Detail: ${taskId}`,
      category: 'Task Trace',
      description: 'Granular step-by-step trace, tool call audits, checkpoints, and budget consumption for this execution.',
      icon: <FileCode size={32} color={tokens.colors.accentPrimary} />,
      features: [
        'Interactive step timeline with tool input/output contracts',
        'Security policy decision details for each tool call',
        'Checkpoint state diffs and durable journal replay',
        'Resource budget drawdown and token accounting',
      ],
    };
  }

  if (!config) {
    config = {
      title: 'Console Module',
      category: 'Runtime Extension',
      description: 'This runtime module interface is integrated into the ForgeGuard console.',
      icon: <FileCode size={32} color={tokens.colors.accentPrimary} />,
      features: ['Governance integration', 'Realtime updates', 'Full auditability'],
    };
  }

  return (
    <Box>
      <PageHeader
        title={config.title}
        description={config.description}
        actions={
          <Button
            component={RouterLink}
            to="/dashboard"
            variant="outlined"
            size="small"
            startIcon={<ArrowLeft size={16} />}
            sx={{ color: tokens.colors.textPrimary, borderColor: tokens.colors.borderSubtle }}
          >
            Back to Dashboard
          </Button>
        }
      />

      <Panel sx={{ p: 4, maxWidth: 800 }}>
        <Stack spacing={3}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: '8px',
                backgroundColor: tokens.colors.surfaceElevated,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {config.icon}
            </Box>
            <Box>
              <Chip
                label={config.category}
                size="small"
                sx={{
                  backgroundColor: 'rgba(124, 140, 255, 0.15)',
                  color: tokens.colors.accentPrimary,
                  fontFamily: tokens.fonts.mono,
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  mb: 0.5,
                }}
              />
              <Typography variant="h6" sx={{ fontWeight: 600, color: tokens.colors.textPrimary }}>
                {config.title} Overview
              </Typography>
            </Box>
          </Box>

          <Typography sx={{ color: tokens.colors.textMuted, fontSize: '0.875rem', lineHeight: 1.6 }}>
            The navigation structure, API models, typed contracts, and design tokens for this view are integrated with ForgeGuard.
          </Typography>

          <Box
            sx={{
              p: 2.5,
              borderRadius: '6px',
              backgroundColor: tokens.colors.surfaceElevated,
              border: `1px solid ${tokens.colors.borderSubtle}`,
            }}
          >
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tokens.colors.textPrimary, mb: 1.5 }}>
              Capabilities & Guardrails:
            </Typography>
            <Stack spacing={1}>
              {config.features.map((feature, idx) => (
                <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      backgroundColor: tokens.colors.accentPrimary,
                      flexShrink: 0,
                    }}
                  />
                  <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.textMuted }}>{feature}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </Stack>
      </Panel>
    </Box>
  );
};

export default PlaceholderPage;
