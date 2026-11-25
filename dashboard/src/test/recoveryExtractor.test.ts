import { describe, expect, it } from 'vitest';
import {
  determineRecoveryAssessment,
  extractCheckpointForensics,
  extractDiagnostics,
  extractRecoveryTimeline,
  sanitizeDetails,
} from '../api/recovery/extractor';
import { TaskDiagnosticsResponse, TaskResponse } from '../api/types';

describe('Recovery Extractor Utilities', () => {
  const baseTask: TaskResponse = {
    task_id: 'task-test-001',
    description: 'Test recovery task',
    status: 'failed',
    created_at: '2026-11-23T10:00:00Z',
  };

  describe('determineRecoveryAssessment', () => {
    it('returns assessment_loading when diagnostics is fetching', () => {
      const res = determineRecoveryAssessment(baseTask, null, true);
      expect(res.state).toBe('assessment_loading');
      expect(res.isResumable).toBe(false);
    });

    it('returns assessment_unavailable when task is null', () => {
      const res = determineRecoveryAssessment(null, null, false);
      expect(res.state).toBe('assessment_unavailable');
      expect(res.isResumable).toBe(false);
    });

    it('returns blocked_running when task is in running state', () => {
      const runningTask: TaskResponse = { ...baseTask, status: 'running' };
      const res = determineRecoveryAssessment(runningTask, null, false);
      expect(res.state).toBe('blocked_running');
      expect(res.isResumable).toBe(false);
      expect(res.description).toContain('currently running');
    });

    it('returns blocked_terminal when task is in completed state', () => {
      const completedTask: TaskResponse = { ...baseTask, status: 'completed' };
      const res = determineRecoveryAssessment(completedTask, null, false);
      expect(res.state).toBe('blocked_terminal');
      expect(res.isResumable).toBe(false);
    });

    it('returns blocked_terminal when task is in cancelled state', () => {
      const cancelledTask: TaskResponse = { ...baseTask, status: 'cancelled' };
      const res = determineRecoveryAssessment(cancelledTask, null, false);
      expect(res.state).toBe('blocked_terminal');
      expect(res.isResumable).toBe(false);
    });

    it('returns assessment_unavailable when diagnostics has no recovery_info', () => {
      const diag: TaskDiagnosticsResponse = {
        task_id: 'task-test-001',
        timeline: [],
        diagnostics: [],
        recovery_info: null,
      };
      const res = determineRecoveryAssessment(baseTask, diag, false);
      expect(res.state).toBe('assessment_unavailable');
      expect(res.isResumable).toBe(false);
    });

    it('returns blocked_uncertain when uncertain_calls exist', () => {
      const diag: TaskDiagnosticsResponse = {
        task_id: 'task-test-001',
        timeline: [],
        diagnostics: [],
        recovery_info: {
          can_resume_safely: false,
          completed_calls: ['call-1'],
          uncertain_calls: ['call-uncertain-mid'],
          warnings: ["Tool call 'call-uncertain-mid' was interrupted; classified as uncertain."],
        },
      };
      const res = determineRecoveryAssessment(baseTask, diag, false);
      expect(res.state).toBe('blocked_uncertain');
      expect(res.isResumable).toBe(false);
      expect(res.uncertainCalls).toEqual(['call-uncertain-mid']);
    });

    it('returns safe_to_resume when can_resume_safely is true', () => {
      const diag: TaskDiagnosticsResponse = {
        task_id: 'task-test-001',
        timeline: [],
        diagnostics: [],
        recovery_info: {
          can_resume_safely: true,
          completed_calls: ['call-1', 'call-2'],
          uncertain_calls: [],
          warnings: [],
        },
      };
      const res = determineRecoveryAssessment(baseTask, diag, false);
      expect(res.state).toBe('safe_to_resume');
      expect(res.isResumable).toBe(true);
      expect(res.title).toBe('Safe to Resume');
    });

    it('returns blocked_budget when can_resume_safely is false and budget is exhausted', () => {
      const diag: TaskDiagnosticsResponse = {
        task_id: 'task-test-001',
        timeline: [],
        diagnostics: [],
        recovery_info: {
          can_resume_safely: false,
          completed_calls: ['call-1'],
          uncertain_calls: [],
          warnings: ['Remaining tool call budget is exhausted in snapshot.'],
        },
      };
      const res = determineRecoveryAssessment(baseTask, diag, false);
      expect(res.state).toBe('blocked_budget');
      expect(res.isResumable).toBe(false);
    });
  });

  describe('sanitizeDetails', () => {
    it('redacts sensitive keys recursively', () => {
      const input = {
        user: 'alice',
        api_key: 'sk-1234567890',
        nested: {
          secret_token: 'top_secret',
          token: 'jwt-xyz',
          normal: 'value',
        },
        arr: [{ password: 'pwd', public: 123 }],
      };

      const sanitized = sanitizeDetails(input) as Record<string, unknown>;
      expect(sanitized.user).toBe('alice');
      expect(sanitized.api_key).toBe('***REDACTED***');
      const nested = sanitized.nested as Record<string, unknown>;
      expect(nested.token).toBe('***REDACTED***');
      expect(nested.normal).toBe('value');
      const arr = sanitized.arr as Array<Record<string, unknown>>;
      expect(arr[0].password).toBe('***REDACTED***');
      expect(arr[0].public).toBe(123);
    });
  });

  describe('extractDiagnostics', () => {
    it('extracts, normalizes, and sorts diagnostics by severity priority', () => {
      const raw = [
        {
          diagnostic_id: 'd-1',
          code: 'FG-TOOL-001',
          severity: 'error',
          category: 'tool',
          message: 'Tool failed',
          suggested_action: 'Fix tool code',
        },
        {
          diagnostic_id: 'd-2',
          code: 'FG-RECOVERY-001',
          severity: 'critical',
          category: 'recovery',
          message: 'Recovery blocked',
        },
        {
          diagnostic_id: 'd-3',
          code: 'FG-CANCEL-001',
          severity: 'info',
          category: 'cancellation',
          message: 'Cancelled',
        },
      ];

      const extracted = extractDiagnostics(raw);
      expect(extracted).toHaveLength(3);
      // Critical first, then error, then info
      expect(extracted[0].severity).toBe('critical');
      expect(extracted[0].code).toBe('FG-RECOVERY-001');
      expect(extracted[1].severity).toBe('error');
      expect(extracted[2].severity).toBe('info');
    });

    it('returns empty array when input is not an array', () => {
      expect(extractDiagnostics(null)).toEqual([]);
      expect(extractDiagnostics(undefined)).toEqual([]);
    });
  });

  describe('extractRecoveryTimeline', () => {
    it('sorts timeline entries deterministically by sequence_number', () => {
      const raw = [
        { sequence_number: 3, event_type: 'tool_call_completed', category: 'tool', status: 'success' },
        { sequence_number: 1, event_type: 'task_started', category: 'task', status: 'success' },
        { sequence_number: 2, event_type: 'policy_decision', category: 'policy', status: 'allowed' },
      ];

      const timeline = extractRecoveryTimeline(raw);
      expect(timeline[0].sequence_number).toBe(1);
      expect(timeline[1].sequence_number).toBe(2);
      expect(timeline[2].sequence_number).toBe(3);
    });
  });

  describe('extractCheckpointForensics', () => {
    it('correctly attributes verified checkpoint when budget_snapshot exists', () => {
      const diag: TaskDiagnosticsResponse = {
        task_id: 'task-cp-1',
        timeline: [],
        diagnostics: [],
        budget_snapshot: { max_tool_calls: 10, elapsed_seconds: 1.5 },
        recovery_info: {
          can_resume_safely: true,
          completed_calls: ['call-a', 'call-b'],
          uncertain_calls: [],
          warnings: [],
        },
      };

      const forensics = extractCheckpointForensics(diag);
      expect(forensics.reconstructed_position).toBe(2);
      expect(forensics.completed_call_count).toBe(2);
      expect(forensics.reconstruction_source).toBe('checkpoint');
      expect(forensics.is_inferred).toBe(false);
    });

    it('attributes tool_records when no budget snapshot exists', () => {
      const diag: TaskDiagnosticsResponse = {
        task_id: 'task-cp-2',
        timeline: [],
        diagnostics: [],
        budget_snapshot: null,
        recovery_info: {
          can_resume_safely: true,
          completed_calls: ['call-x'],
          uncertain_calls: [],
          warnings: [],
        },
      };

      const forensics = extractCheckpointForensics(diag);
      expect(forensics.reconstruction_source).toBe('tool_records');
      expect(forensics.is_inferred).toBe(true);
    });
  });
});
