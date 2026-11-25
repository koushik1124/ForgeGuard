import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  Chip,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import {
  Gauge,
  Lock,
  Shield,
} from 'lucide-react';
import { Panel } from '../common/Panel';
import { PolicyInspector } from './PolicyInspector';
import { BudgetInspector } from './BudgetInspector';
import {
  computeBudgetMetrics,
  extractBudgetState,
  extractPolicyDecisions,
} from '../../api/governance/extractor';
import { NormalizedEvent, ToolCallItem } from '../../api/sse/types';
import { tokens } from '../../theme/tokens';

interface GovernanceInspectorProps {
  events: NormalizedEvent[];
  toolCalls?: ToolCallItem[];
  budgetSnapshot?: Record<string, unknown> | null;
  fallbackTimeline?: Array<Record<string, unknown>> | null;
}

export const GovernanceInspector: React.FC<GovernanceInspectorProps> = ({
  events,
  toolCalls = [],
  budgetSnapshot,
  fallbackTimeline,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'policy' | 'budget'>('all');

  const policyDecisions = useMemo(() => {
    return extractPolicyDecisions(events, toolCalls, fallbackTimeline);
  }, [events, toolCalls, fallbackTimeline]);

  const budgetState = useMemo(() => {
    return extractBudgetState(events, budgetSnapshot);
  }, [events, budgetSnapshot]);

  const budgetMetrics = useMemo(() => {
    return computeBudgetMetrics(budgetState);
  }, [budgetState]);

  const allowedCount = useMemo(() => policyDecisions.filter((d) => d.allowed).length, [policyDecisions]);
  const deniedCount = useMemo(() => policyDecisions.filter((d) => !d.allowed).length, [policyDecisions]);

  return (
    <Panel sx={{ p: 2.5 }}>
      {/* Governance Inspector Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
          mb: 2.5,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Shield size={20} color={tokens.colors.accentPrimary} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: tokens.colors.text.primary }}>
              Governance: Policy & Budget Inspector
            </Typography>

            {budgetState.isExceeded ? (
              <Chip
                label="BUDGET EXCEEDED"
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  backgroundColor: tokens.colors.errorSubtle,
                  color: tokens.colors.error,
                  border: `1px solid ${tokens.colors.error}`,
                }}
              />
            ) : deniedCount > 0 ? (
              <Chip
                label={`${deniedCount} DENIED`}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  backgroundColor: tokens.colors.errorSubtle,
                  color: tokens.colors.error,
                }}
              />
            ) : (
              <Chip
                label={policyDecisions.length > 0 ? `${allowedCount} ALLOWED` : 'GOVERNED'}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  backgroundColor: tokens.colors.successSubtle,
                  color: tokens.colors.success,
                }}
              />
            )}
          </Box>
          <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.text.muted, mt: 0.5 }}>
            LLM proposes; ForgeGuard authorizes and executes. Inspect evidence-backed policy decisions and resource budgets.
          </Typography>
        </Box>

        {/* View Switcher Tabs */}
        <ButtonGroup size="small" variant="outlined">
          <Button
            onClick={() => setActiveTab('all')}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              backgroundColor: activeTab === 'all' ? tokens.colors.primarySubtle : 'transparent',
              color: activeTab === 'all' ? tokens.colors.accentPrimary : tokens.colors.text.secondary,
              borderColor: tokens.colors.borderSubtle,
            }}
          >
            Overview
          </Button>
          <Button
            onClick={() => setActiveTab('policy')}
            startIcon={<Lock size={12} />}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              backgroundColor: activeTab === 'policy' ? tokens.colors.primarySubtle : 'transparent',
              color: activeTab === 'policy' ? tokens.colors.accentPrimary : tokens.colors.text.secondary,
              borderColor: tokens.colors.borderSubtle,
            }}
          >
            Policy ({policyDecisions.length})
          </Button>
          <Button
            onClick={() => setActiveTab('budget')}
            startIcon={<Gauge size={12} />}
            sx={{
              fontSize: '0.75rem',
              textTransform: 'none',
              backgroundColor: activeTab === 'budget' ? tokens.colors.primarySubtle : 'transparent',
              color: activeTab === 'budget' ? tokens.colors.accentPrimary : tokens.colors.text.secondary,
              borderColor: tokens.colors.borderSubtle,
            }}
          >
            Budgets
          </Button>
        </ButtonGroup>
      </Box>

      {/* Overview or Tab Content */}
      {activeTab === 'all' && (
        <Stack spacing={3}>
          {/* Section 1: Execution Budgets Overview */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Gauge size={16} color={tokens.colors.primaryLight} />
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                Resource Budget Constraints & Utilization
              </Typography>
            </Box>
            <BudgetInspector budgetState={budgetState} metrics={budgetMetrics} />
          </Box>

          <Divider sx={{ borderColor: tokens.colors.borderSubtle }} />

          {/* Section 2: Policy Decisions Ledger */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Lock size={16} color={tokens.colors.primaryLight} />
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tokens.colors.text.primary }}>
                Security Policy Authorization Ledger ({policyDecisions.length} Decisions)
              </Typography>
            </Box>
            <PolicyInspector decisions={policyDecisions} />
          </Box>
        </Stack>
      )}

      {activeTab === 'policy' && (
        <Box>
          <PolicyInspector decisions={policyDecisions} />
        </Box>
      )}

      {activeTab === 'budget' && (
        <Box>
          <BudgetInspector budgetState={budgetState} metrics={budgetMetrics} />
        </Box>
      )}
    </Panel>
  );
};
