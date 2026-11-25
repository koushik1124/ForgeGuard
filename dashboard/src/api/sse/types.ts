/**
 * ForgeGuard SSE Streaming & Event Contracts (M9.4)
 * Type definitions for SSE parser, normalizer, and client connection lifecycle.
 */

export type SSEConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'polling'
  | 'closed';

export interface RawSSEMessage {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

export type EventCategory = 'lifecycle' | 'tool' | 'policy' | 'budget' | 'system' | 'custom';

export interface NormalizedEvent {
  id: string;
  eventId?: string;
  sequenceNumber: number;
  timestamp: string;
  eventType: string;
  category: EventCategory;
  taskId?: string;
  toolName?: string;
  toolCallId?: string;
  step?: number;
  status?: string;
  durationSeconds?: number;
  summary: string;
  payload: Record<string, unknown>;
  isReplayed: boolean;
  isMalformed?: boolean;
}

export interface ToolCallItem {
  callId: string;
  toolName: string;
  step?: number;
  status: 'pending' | 'running' | 'success' | 'failure' | 'timeout' | 'rejected' | 'unknown';
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
  arguments?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  policyDecision?: {
    allowed: boolean;
    reason: string;
    matchedRule?: string;
  };
}

export type EventFilterCategory = 'all' | 'tool' | 'policy' | 'budget' | 'lifecycle' | 'error';

export interface StreamClientConfig {
  baseUrl: string;
  taskId: string;
  apiKey?: string;
  lastEventId?: string;
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  backoffMultiplier?: number;
  jitterFactor?: number;
  maxEventHistory?: number;
}
