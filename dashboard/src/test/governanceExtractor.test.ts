import { describe, expect, it } from 'vitest';
import {
  computeBudgetMetrics,
  computeThresholdStatus,
  extractBudgetState,
  extractPolicyDecisions,
  formatBytes,
  formatSeconds,
} from '../api/governance/extractor';
import { NormalizedEvent, ToolCallItem } from '../api/sse/types';

describe('Governance Extractor & Correlation Engine', () => {
  describe('Formatters & Helpers', () => {
    it('formats byte quantities accurately with unit scaling', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(781)).toBe('781 B');
      expect(formatBytes(1500000)).toBe('1.4 MB');
      expect(formatBytes(null)).toBe('--');
      expect(formatBytes(undefined)).toBe('--');
    });

    it('formats duration seconds cleanly', () => {
      expect(formatSeconds(0)).toBe('0.00s');
      expect(formatSeconds(0.547)).toBe('0.55s');
      expect(formatSeconds(12.34)).toBe('12.34s');
      expect(formatSeconds(90)).toBe('1m 30.0s');
      expect(formatSeconds(null)).toBe('--');
      expect(formatSeconds(-5)).toBe('0.00s');
    });

    it('computes correct threshold statuses based on percentage and limit exceeded state', () => {
      expect(computeThresholdStatus(0)).toBe('normal');
      expect(computeThresholdStatus(69)).toBe('normal');
      expect(computeThresholdStatus(70)).toBe('warning');
      expect(computeThresholdStatus(89)).toBe('warning');
      expect(computeThresholdStatus(90)).toBe('critical');
      expect(computeThresholdStatus(99)).toBe('critical');
      expect(computeThresholdStatus(100)).toBe('exhausted');
      expect(computeThresholdStatus(120)).toBe('exhausted');
      expect(computeThresholdStatus(50, true)).toBe('exhausted');
      expect(computeThresholdStatus(null)).toBe('unknown');
    });
  });

  describe('Policy Decision Extraction & Correlation', () => {
    it('extracts allowed decision and correlates with successful execution', () => {
      const events: NormalizedEvent[] = [
        {
          id: 'ev-1',
          sequenceNumber: 1,
          timestamp: '2026-11-23T10:00:00Z',
          eventType: 'policy_decision',
          category: 'policy',
          summary: "Policy ALLOWED 'workspace_read_file'",
          payload: {
            allowed: true,
            tool_name: 'workspace_read_file',
            matched_rule: 'explicit_allow',
            reason: "Tool 'workspace_read_file' is explicitly allowed",
            step: 0,
            call_id: 'call-001',
          },
          isReplayed: true,
        },
      ];

      const toolCalls: ToolCallItem[] = [
        {
          callId: 'call-001',
          toolName: 'workspace_read_file',
          step: 0,
          status: 'success',
          durationSeconds: 0.547,
          output: { content: 'test content' },
        },
      ];

      const decisions = extractPolicyDecisions(events, toolCalls);
      expect(decisions).toHaveLength(1);
      const d = decisions[0];
      expect(d.toolName).toBe('workspace_read_file');
      expect(d.allowed).toBe(true);
      expect(d.matchedRule).toBe('explicit_allow');
      expect(d.reason).toContain('explicitly allowed');
      expect(d.step).toBe(0);
      expect(d.callId).toBe('call-001');
      expect(d.executionStatus).toBe('success');
      expect(d.executionDuration).toBe(0.547);
    });

    it('extracts denied decision and marks execution as blocked by engine without executing', () => {
      const events: NormalizedEvent[] = [
        {
          id: 'ev-denied',
          sequenceNumber: 2,
          timestamp: '2026-11-23T10:00:01Z',
          eventType: 'policy_decision',
          category: 'policy',
          summary: "Policy DENIED 'bash_execute'",
          payload: {
            allowed: false,
            tool_name: 'bash_execute',
            matched_rule: 'default_deny',
            reason: "Tool 'bash_execute' is not allowlisted",
            step: 1,
            call_id: 'call-002',
          },
          isReplayed: true,
        },
      ];

      const decisions = extractPolicyDecisions(events, []);
      expect(decisions).toHaveLength(1);
      const d = decisions[0];
      expect(d.allowed).toBe(false);
      expect(d.matchedRule).toBe('default_deny');
      expect(d.executionStatus).toBe('rejected');
      expect(d.executionError).toContain('not allowlisted');
    });

    it('handles allowed tool that has not yet started execution', () => {
      const events: NormalizedEvent[] = [
        {
          id: 'ev-3',
          sequenceNumber: 3,
          timestamp: '2026-11-23T10:00:02Z',
          eventType: 'policy_decision',
          category: 'policy',
          summary: "Policy ALLOWED 'calculator'",
          payload: {
            allowed: true,
            tool_name: 'calculator',
            matched_rule: 'default_allow',
            reason: 'Allowed by default policy',
            step: 2,
          },
          isReplayed: false,
        },
      ];

      const decisions = extractPolicyDecisions(events, []);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].executionStatus).toBe('not_executed');
    });

    it('handles missing matched_rule, reason, and call_id gracefully', () => {
      const events: NormalizedEvent[] = [
        {
          id: 'ev-bare',
          sequenceNumber: 4,
          timestamp: '2026-11-23T10:00:03Z',
          eventType: 'policy_decision',
          category: 'policy',
          summary: 'Bare decision',
          payload: {
            allowed: true,
            tool_name: 'custom_query',
          },
          isReplayed: false,
        },
      ];

      const decisions = extractPolicyDecisions(events, []);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].matchedRule).toBe('explicit_allow');
      expect(decisions[0].reason).toContain('custom_query');
      expect(decisions[0].callId).toBeUndefined();
    });
  });

  describe('Budget Extraction & Metric Calculations', () => {
    it('correctly parses budget_initialized (both top-level and nested under budget)', () => {
      // Nested format (as seen in real task-230ca91b3c26)
      const nestedEvents: NormalizedEvent[] = [
        {
          id: 'ev-b1',
          sequenceNumber: 1,
          timestamp: '2026-11-23T10:00:00Z',
          eventType: 'budget_initialized',
          category: 'budget',
          summary: 'Budget initialized',
          payload: {
            task_id: 'task-test-nested',
            budget: {
              max_tool_calls: 20,
              max_execution_seconds: 120.0,
              max_output_bytes: 1000000,
              max_consecutive_failures: 5,
              max_tool_duration_seconds: 30.0,
            },
          },
          isReplayed: true,
        },
      ];

      const state = extractBudgetState(nestedEvents);
      expect(state.hasEvents).toBe(true);
      expect(state.maxToolCalls).toBe(20);
      expect(state.maxExecutionSeconds).toBe(120.0);
      expect(state.maxOutputBytes).toBe(1000000);
      expect(state.maxConsecutiveFailures).toBe(5);
      expect(state.maxToolDurationSeconds).toBe(30.0);
      expect(state.remainingToolCalls).toBe(20);
      expect(state.remainingSeconds).toBe(120.0);
      expect(state.remainingOutputBytes).toBe(1000000);
    });

    it('correctly updates budget state upon budget_updated events', () => {
      const events: NormalizedEvent[] = [
        {
          id: 'ev-b1',
          sequenceNumber: 1,
          timestamp: '2026-11-23T10:00:00Z',
          eventType: 'budget_initialized',
          category: 'budget',
          summary: 'Budget initialized',
          payload: {
            max_tool_calls: 20,
            max_execution_seconds: 120.0,
            max_output_bytes: 1000000,
            max_consecutive_failures: 5,
          },
          isReplayed: true,
        },
        {
          id: 'ev-b2',
          sequenceNumber: 2,
          timestamp: '2026-11-23T10:00:01Z',
          eventType: 'budget_updated',
          category: 'budget',
          summary: 'Budget updated',
          payload: {
            tool_calls_reserved: 1,
            remaining_tool_calls: 19,
            successful_tool_calls: 1,
            failed_tool_calls: 0,
            timed_out_tool_calls: 0,
            cumulative_output_bytes: 781,
            remaining_output_bytes: 999219,
            elapsed_seconds: 0.547,
            remaining_seconds: 119.453,
            consecutive_failures: 0,
          },
          isReplayed: true,
        },
      ];

      const state = extractBudgetState(events);
      expect(state.toolCallsReserved).toBe(1);
      expect(state.remainingToolCalls).toBe(19);
      expect(state.successfulToolCalls).toBe(1);
      expect(state.cumulativeOutputBytes).toBe(781);
      expect(state.remainingOutputBytes).toBe(999219);
      expect(state.elapsedSeconds).toBe(0.547);
      expect(state.remainingSeconds).toBe(119.453);

      const metrics = computeBudgetMetrics(state);
      expect(metrics).toHaveLength(4);

      const toolCalls = metrics.find((m) => m.id === 'tool_calls')!;
      expect(toolCalls.used).toBe(1);
      expect(toolCalls.limit).toBe(20);
      expect(toolCalls.percentUsed).toBe(5); // 1 / 20 = 5%
      expect(toolCalls.status).toBe('normal');

      const duration = metrics.find((m) => m.id === 'execution_duration')!;
      expect(duration.used).toBe(0.547);
      expect(duration.status).toBe('normal');

      const output = metrics.find((m) => m.id === 'output_bytes')!;
      expect(output.used).toBe(781);
      expect(output.formattedUsed).toBe('781 B');
      expect(output.formattedLimit).toBe('976.6 KB');
    });

    it('correctly detects budget_exceeded and flags the metric as exhausted', () => {
      const events: NormalizedEvent[] = [
        {
          id: 'ev-exc',
          sequenceNumber: 1,
          timestamp: '2026-11-23T10:00:00Z',
          eventType: 'budget_exceeded',
          category: 'budget',
          summary: 'Budget exceeded',
          payload: {
            limit: 'max_tool_calls',
            reason: 'Tool call limit reached: 20 >= 20',
            max_tool_calls: 20,
            tool_calls_reserved: 20,
            remaining_tool_calls: 0,
          },
          isReplayed: true,
        },
      ];

      const state = extractBudgetState(events);
      expect(state.isExceeded).toBe(true);
      expect(state.exceededLimit).toBe('max_tool_calls');
      expect(state.exceededReason).toContain('Tool call limit reached');

      const metrics = computeBudgetMetrics(state);
      const toolCalls = metrics.find((m) => m.id === 'tool_calls')!;
      expect(toolCalls.status).toBe('exhausted');
    });

    it('handles zero or missing limits safely without dividing by zero', () => {
      const state = extractBudgetState([]);
      expect(state.hasEvents).toBe(false);

      const metrics = computeBudgetMetrics(state);
      for (const m of metrics) {
        expect(m.percentUsed).toBeNull();
        expect(m.status).toBe('unknown');
        expect(m.formattedLimit).toBe('--');
      }
    });

    it('falls back to persisted diagnostic budget snapshot when event journal lacks budget events', () => {
      const fallbackSnapshot = {
        max_tool_calls: 10,
        tool_calls_reserved: 4,
        remaining_tool_calls: 6,
        max_execution_seconds: 60.0,
        elapsed_seconds: 45.0, // 45 / 60 = 75% -> warning
        max_output_bytes: 500000,
        cumulative_output_bytes: 475000, // 475 / 500 = 95% -> critical
        max_consecutive_failures: 5,
        consecutive_failures: 2,
      };

      const state = extractBudgetState([], fallbackSnapshot);
      expect(state.hasEvents).toBe(true);
      expect(state.maxToolCalls).toBe(10);
      expect(state.toolCallsReserved).toBe(4);

      const metrics = computeBudgetMetrics(state);
      const duration = metrics.find((m) => m.id === 'execution_duration')!;
      expect(duration.percentUsed).toBe(75);
      expect(duration.status).toBe('warning');

      const output = metrics.find((m) => m.id === 'output_bytes')!;
      expect(output.percentUsed).toBe(95);
      expect(output.status).toBe('critical');
    });
  });
});
