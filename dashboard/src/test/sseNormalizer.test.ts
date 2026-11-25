import { describe, expect, it } from 'vitest';
import {
  correlateToolCalls,
  normalizeSSEEvent,
  sanitizePayload,
} from '../api/sse/normalizer';
import { NormalizedEvent } from '../api/sse/types';

describe('Event Normalizer & Correlator', () => {
  it('normalizes task_started event correctly', () => {
    const raw = {
      id: '1',
      event: 'task_started',
      data: JSON.stringify({ task_id: 'task-123', timestamp: '2026-11-23T10:00:00Z' }),
    };

    const norm = normalizeSSEEvent(raw);
    expect(norm.sequenceNumber).toBe(1);
    expect(norm.eventType).toBe('task_started');
    expect(norm.category).toBe('lifecycle');
    expect(norm.taskId).toBe('task-123');
    expect(norm.summary).toBe('Governed execution started');
    expect(norm.isMalformed).toBe(false);
  });

  it('normalizes tool execution and policy decision events', () => {
    const toolEvent = normalizeSSEEvent({
      id: '2',
      event: 'tool_call_started',
      data: JSON.stringify({
        tool_name: 'calculator',
        call_id: 'call-1',
        step: 1,
        timeout: 30,
      }),
    });

    expect(toolEvent.category).toBe('tool');
    expect(toolEvent.toolName).toBe('calculator');
    expect(toolEvent.toolCallId).toBe('call-1');
    expect(toolEvent.step).toBe(1);
    expect(toolEvent.status).toBe('running');

    const policyEvent = normalizeSSEEvent({
      id: '3',
      event: 'policy_decision',
      data: JSON.stringify({
        tool_name: 'calculator',
        call_id: 'call-1',
        allowed: true,
        matched_rule: 'allow_math_tools',
        reason: 'Safe arithmetic tool',
      }),
    });

    expect(policyEvent.category).toBe('policy');
    expect(policyEvent.status).toBe('allowed');
    expect(policyEvent.summary).toContain('Policy ALLOWED');
  });

  it('handles malformed JSON data gracefully without throwing', () => {
    const raw = {
      id: '4',
      event: 'broken_event',
      data: '{{invalid-json--not-parseable',
    };

    const norm = normalizeSSEEvent(raw);
    expect(norm.isMalformed).toBe(true);
    expect(norm.payload.raw).toBe('{{invalid-json--not-parseable');
    expect(norm.eventType).toBe('broken_event');
    expect(norm.category).toBe('custom');
  });

  it('masks sensitive keys and credentials in payloads', () => {
    const sensitive = {
      user: 'alice',
      api_key: 'gsk_secret_key_12345',
      authorization: 'Bearer secret_token',
      nested: {
        password: 'my_password',
        safe_param: 'ok_value',
      },
    };

    const sanitized = sanitizePayload(sensitive);
    expect(sanitized.api_key).toBe('[CONFIGURED / REDACTED]');
    expect(sanitized.authorization).toBe('[CONFIGURED / REDACTED]');
    expect(sanitized.nested.password).toBe('[CONFIGURED / REDACTED]');
    expect(sanitized.nested.safe_param).toBe('ok_value');
    expect(sanitized.user).toBe('alice');
  });

  it('correlates tool calls, outputs, errors, and policy decisions', () => {
    const events: NormalizedEvent[] = [
      normalizeSSEEvent({
        id: '1',
        event: 'policy_decision',
        data: JSON.stringify({
          tool_name: 'db_query',
          call_id: 'call-db-1',
          allowed: true,
          matched_rule: 'db_read_only',
        }),
      }),
      normalizeSSEEvent({
        id: '2',
        event: 'tool_call_started',
        data: JSON.stringify({
          tool_name: 'db_query',
          call_id: 'call-db-1',
          step: 1,
          arguments: { query: 'SELECT 1' },
        }),
      }),
      normalizeSSEEvent({
        id: '3',
        event: 'tool_call_completed',
        data: JSON.stringify({
          tool_name: 'db_query',
          call_id: 'call-db-1',
          step: 1,
          status: 'success',
          output: { rows: [1] },
          duration_seconds: 0.125,
        }),
      }),
    ];

    const pairs = correlateToolCalls(events);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].callId).toBe('call-db-1');
    expect(pairs[0].toolName).toBe('db_query');
    expect(pairs[0].status).toBe('success');
    expect(pairs[0].arguments).toEqual({ query: 'SELECT 1' });
    expect(pairs[0].output).toEqual({ rows: [1] });
    expect(pairs[0].policyDecision?.allowed).toBe(true);
    expect(pairs[0].policyDecision?.matchedRule).toBe('db_read_only');
  });
});
