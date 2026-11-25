import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventStreamClient } from '../api/sse/eventStreamClient';
import { NormalizedEvent, SSEConnectionStatus } from '../api/sse/types';

describe('EventStreamClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let index = 0;

    return new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index]));
          index++;
        } else {
          controller.close();
        }
      },
    });
  }

  it('connects and processes stream events successfully', async () => {
    const events: NormalizedEvent[] = [];
    const statuses: SSEConnectionStatus[] = [];

    const mockResponse = {
      ok: true,
      status: 200,
      body: createMockStream([
        'id: 1\nevent: task_started\ndata: {"task_id":"task-1"}\n\n',
        'id: 2\nevent: stream_closed\ndata: {"status":"completed"}\n\n',
      ]),
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

    const client = new EventStreamClient(
      {
        baseUrl: 'http://localhost:8000',
        taskId: 'task-1',
        apiKey: 'test-key',
      },
      {
        onStatusChange: (status) => statuses.push(status),
        onEvent: (event) => events.push(event),
      }
    );

    await client.connect();

    expect(statuses).toContain('connecting');
    expect(statuses).toContain('connected');
    expect(statuses).toContain('closed');
    expect(events).toHaveLength(2);
    expect(events[0].eventType).toBe('task_started');
    expect(events[1].eventType).toBe('stream_closed');
    expect(client.getLatestSequence()).toBe(2);
  });

  it('deduplicates replayed events across stream reconnects', async () => {
    const events: NormalizedEvent[] = [];

    const mockResponse = {
      ok: true,
      status: 200,
      body: createMockStream([
        'id: 1\nevent: step_1\ndata: {"step":1}\n\n',
        'id: 1\nevent: step_1\ndata: {"step":1}\n\n', // duplicate
        'id: 2\nevent: step_2\ndata: {"step":2}\n\n',
      ]),
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

    const client = new EventStreamClient(
      { baseUrl: 'http://localhost:8000', taskId: 'task-1' },
      {
        onStatusChange: vi.fn(),
        onEvent: (event) => events.push(event),
      }
    );

    await client.connect();

    expect(events).toHaveLength(2);
    expect(events.map((e) => e.sequenceNumber)).toEqual([1, 2]);
  });

  it('detects sequence gaps in stream events', async () => {
    const gaps: Array<{ from: number; to: number }> = [];

    const mockResponse = {
      ok: true,
      status: 200,
      body: createMockStream([
        'id: 1\nevent: step_1\ndata: {}\n\n',
        'id: 5\nevent: step_5\ndata: {}\n\n', // jump from 1 to 5: missing 2..4
      ]),
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

    const client = new EventStreamClient(
      { baseUrl: 'http://localhost:8000', taskId: 'task-1' },
      {
        onStatusChange: vi.fn(),
        onEvent: vi.fn(),
        onGapDetected: (from, to) => gaps.push({ from, to }),
      }
    );

    await client.connect();

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toEqual({ from: 2, to: 4 });
  });

  it('computes exponential backoff within bounds', () => {
    const client = new EventStreamClient(
      {
        baseUrl: 'http://localhost:8000',
        taskId: 'task-1',
        initialBackoffMs: 1000,
        maxBackoffMs: 15000,
        backoffMultiplier: 1.5,
        jitterFactor: 0.2,
      },
      { onStatusChange: vi.fn(), onEvent: vi.fn() }
    );

    // Attempt 0: ~1000ms ± 200ms -> [800..1200]
    const delay0 = client.computeBackoffDelay(0);
    expect(delay0).toBeGreaterThanOrEqual(750);
    expect(delay0).toBeLessThanOrEqual(1250);

    // Attempt 5: 1000 * 1.5^5 = ~7593ms ± 20%
    const delay5 = client.computeBackoffDelay(5);
    expect(delay5).toBeGreaterThanOrEqual(5500);
    expect(delay5).toBeLessThanOrEqual(9500);

    // Attempt 10: clamped to 15000ms ± 20% -> max 18000ms
    const delay10 = client.computeBackoffDelay(10);
    expect(delay10).toBeLessThanOrEqual(18000);
  });

  it('transitions to polling fallback when max reconnect retries are exhausted', async () => {
    const statuses: SSEConnectionStatus[] = [];

    // Simulate persistent connection failure
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network drop'));

    const client = new EventStreamClient(
      {
        baseUrl: 'http://localhost:8000',
        taskId: 'task-1',
        maxRetries: 2,
        initialBackoffMs: 10,
        maxBackoffMs: 50,
      },
      {
        onStatusChange: (status) => statuses.push(status),
        onEvent: vi.fn(),
      }
    );

    // Attempt 0 fails -> sets status 'reconnecting', schedules retry timer
    await client.connect();
    expect(statuses).toContain('reconnecting');

    // Attempt 1
    await vi.runOnlyPendingTimersAsync();
    // Attempt 2 (exhausts retries -> transitions to 'polling')
    await vi.runOnlyPendingTimersAsync();

    expect(statuses).toContain('polling');
    expect(client.getStatus()).toBe('polling');
  });

  it('cleanly aborts connection on disconnect()', async () => {
    const client = new EventStreamClient(
      { baseUrl: 'http://localhost:8000', taskId: 'task-1' },
      { onStatusChange: vi.fn(), onEvent: vi.fn() }
    );

    client.disconnect();
    expect(client.getStatus()).toBe('disconnected');
  });
});
