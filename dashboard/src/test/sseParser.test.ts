import { describe, expect, it, vi } from 'vitest';
import { SSEParser } from '../api/sse/parser';

describe('SSEParser', () => {
  it('parses basic event with LF line endings', () => {
    const parser = new SSEParser();
    const chunks = 'id: 1\nevent: task_started\ndata: {"task_id":"t-1"}\n\n';
    const messages = parser.feed(chunks);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      id: '1',
      event: 'task_started',
      data: '{"task_id":"t-1"}',
      retry: undefined,
    });
  });

  it('parses events with CRLF line endings', () => {
    const parser = new SSEParser();
    const chunks = 'id: 2\r\nevent: budget_updated\r\ndata: {"step":1}\r\n\r\n';
    const messages = parser.feed(chunks);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      id: '2',
      event: 'budget_updated',
      data: '{"step":1}',
      retry: undefined,
    });
  });

  it('handles arbitrary chunk boundaries across multiple feeds', () => {
    const parser = new SSEParser();

    // Chunk 1: partial field
    expect(parser.feed('id: 10\nev')).toHaveLength(0);
    // Chunk 2: rest of event field and start of data
    expect(parser.feed('ent: tool_call_started\ndata: {"tool_na')).toHaveLength(0);
    // Chunk 3: rest of data and closing newlines
    const messages = parser.feed('me":"calc"}\n\n');

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      id: '10',
      event: 'tool_call_started',
      data: '{"tool_name":"calc"}',
      retry: undefined,
    });
  });

  it('handles multiline data fields properly', () => {
    const parser = new SSEParser();
    const chunk = 'id: 3\nevent: log\ndata: line 1\ndata: line 2\ndata: line 3\n\n';
    const messages = parser.feed(chunk);

    expect(messages).toHaveLength(1);
    expect(messages[0].data).toBe('line 1\nline 2\nline 3');
  });

  it('handles comments and heartbeats without emitting false messages', () => {
    const onComment = vi.fn();
    const parser = new SSEParser({ onComment });

    const chunk = ': keepalive\n\n: heartbeat-ping\n\n';
    const messages = parser.feed(chunk);

    expect(messages).toHaveLength(0);
    expect(onComment).toHaveBeenCalledTimes(2);
    expect(onComment).toHaveBeenCalledWith('keepalive');
    expect(onComment).toHaveBeenCalledWith('heartbeat-ping');
  });

  it('parses retry directives', () => {
    const parser = new SSEParser();
    const chunk = 'retry: 5000\nid: 99\ndata: ping\n\n';
    const messages = parser.feed(chunk);

    expect(messages).toHaveLength(1);
    expect(messages[0].retry).toBe(5000);
    expect(messages[0].id).toBe('99');
    expect(messages[0].data).toBe('ping');
  });

  it('parses multiple events in a single chunk', () => {
    const parser = new SSEParser();
    const chunk =
      'id: 1\nevent: first\ndata: {"a":1}\n\n' +
      'id: 2\nevent: second\ndata: {"b":2}\n\n' +
      'id: 3\nevent: third\ndata: {"c":3}\n\n';

    const messages = parser.feed(chunk);
    expect(messages).toHaveLength(3);
    expect(messages[0].id).toBe('1');
    expect(messages[1].id).toBe('2');
    expect(messages[2].id).toBe('3');
  });

  it('handles empty data field correctly', () => {
    const parser = new SSEParser();
    const chunk = 'id: 5\nevent: empty_event\ndata:\n\n';
    const messages = parser.feed(chunk);

    expect(messages).toHaveLength(1);
    expect(messages[0].data).toBe('');
    expect(messages[0].event).toBe('empty_event');
  });

  it('resets state completely on reset()', () => {
    const parser = new SSEParser();
    parser.feed('id: 1\nevent: partial');
    parser.reset();

    const messages = parser.feed('id: 2\nevent: clean\ndata: clean_data\n\n');
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('2');
    expect(messages[0].event).toBe('clean');
    expect(messages[0].data).toBe('clean_data');
  });
});
