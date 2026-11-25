/**
 * Resilient SSE Stream Client (M9.4)
 * Manages fetch + ReadableStream SSE connection lifecycle, exponential backoff with jitter,
 * Last-Event-ID tracking, event deduplication, sequence gap detection, and safe resource cleanup.
 */

import { SSEParser } from './parser';
import { normalizeSSEEvent } from './normalizer';
import { NormalizedEvent, RawSSEMessage, SSEConnectionStatus, StreamClientConfig } from './types';

export interface StreamClientCallbacks {
  onStatusChange: (status: SSEConnectionStatus, error?: Error) => void;
  onEvent: (event: NormalizedEvent) => void;
  onGapDetected?: (expectedSeq: number, receivedSeq: number) => void;
  onStreamClosed?: (taskStatus?: string) => void;
}

export class EventStreamClient {
  private config: StreamClientConfig;
  private callbacks: StreamClientCallbacks;
  private parser: SSEParser;

  private status: SSEConnectionStatus = 'disconnected';
  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount: number = 0;
  private isExplicitlyClosed: boolean = false;

  private latestSeq: number = 0;
  private latestEventId: string | null = null;
  private seenEventIds: Set<string> = new Set();
  private seenSequences: Set<number> = new Set();

  constructor(config: StreamClientConfig, callbacks: StreamClientCallbacks) {
    this.config = {
      maxRetries: 8,
      initialBackoffMs: 1000,
      maxBackoffMs: 15000,
      backoffMultiplier: 1.5,
      jitterFactor: 0.2,
      maxEventHistory: 1000,
      ...config,
    };
    this.callbacks = callbacks;
    this.parser = new SSEParser();

    if (config.lastEventId) {
      this.latestEventId = config.lastEventId;
      const parsed = parseInt(config.lastEventId, 10);
      if (!isNaN(parsed)) {
        this.latestSeq = parsed;
      }
    }
  }

  public getStatus(): SSEConnectionStatus {
    return this.status;
  }

  public getLatestEventId(): string | null {
    return this.latestEventId;
  }

  public getLatestSequence(): number {
    return this.latestSeq;
  }

  /**
   * Connect to the SSE endpoint.
   */
  public async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') {
      return;
    }

    this.isExplicitlyClosed = false;
    this.clearReconnectTimer();

    // Abort any existing request
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    this.setStatus(this.retryCount > 0 ? 'reconnecting' : 'connecting');

    const query = new URLSearchParams();
    if (this.latestEventId) {
      query.set('last_event_id', this.latestEventId);
    }

    const queryStr = query.toString();
    const endpointPath = `/api/v1/tasks/${this.config.taskId}/events${queryStr ? `?${queryStr}` : ''}`;
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}${endpointPath}`;

    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    };

    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
    }

    if (this.latestEventId) {
      headers['Last-Event-ID'] = this.latestEventId;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        // Non-retryable auth or not-found errors
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          const err = new Error(`HTTP ${response.status}: ${response.statusText}`);
          this.setStatus('disconnected', err);
          return;
        }
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      if (!response.body || typeof response.body.getReader !== 'function') {
        // Fallback gracefully if ReadableStream is not supported or mock response lacks body
        this.setStatus('polling');
        return;
      }

      this.setStatus('connected');
      this.retryCount = 0; // Reset retry count upon successful connection

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      this.parser.reset();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Stream completed naturally from server
          if (!this.isExplicitlyClosed) {
            this.handleStreamTermination();
          }
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const messages = this.parser.feed(chunk);

        for (const message of messages) {
          this.handleIncomingMessage(message);
        }
      }
    } catch (err: unknown) {
      if (this.isExplicitlyClosed) {
        return;
      }

      const error = err instanceof Error ? err : new Error(String(err));
      if (error.name === 'AbortError') {
        // Normal intentional client cancellation
        return;
      }

      this.handleConnectionFailure(error);
    }
  }

  /**
   * Process a parsed raw SSE message.
   */
  private handleIncomingMessage(message: RawSSEMessage): void {
    if (message.retry !== undefined) {
      this.config.initialBackoffMs = message.retry;
    }

    const event = normalizeSSEEvent(message, {
      fallbackSeq: this.latestSeq + 1,
    });

    // Deduplication check
    const isDuplicate =
      (event.eventId && this.seenEventIds.has(event.eventId)) ||
      (event.sequenceNumber > 0 && this.seenSequences.has(event.sequenceNumber));

    if (isDuplicate) {
      return;
    }

    // Sequence gap detection
    if (this.latestSeq > 0 && event.sequenceNumber > this.latestSeq + 1) {
      if (this.callbacks.onGapDetected) {
        this.callbacks.onGapDetected(this.latestSeq + 1, event.sequenceNumber - 1);
      }
    }

    // Record identifiers
    if (event.eventId) {
      this.seenEventIds.add(event.eventId);
    }
    if (event.sequenceNumber > 0) {
      this.seenSequences.add(event.sequenceNumber);
      this.latestSeq = Math.max(this.latestSeq, event.sequenceNumber);
    }

    if (message.id) {
      this.latestEventId = message.id;
    } else if (event.sequenceNumber > 0) {
      this.latestEventId = String(event.sequenceNumber);
    }

    // Memory bounding: prune oldest entries if set exceeds capacity
    const capacityLimit = (this.config.maxEventHistory || 1000) * 2;
    if (this.seenEventIds.size > capacityLimit) {
      const idsArray = Array.from(this.seenEventIds);
      this.seenEventIds = new Set(idsArray.slice(idsArray.length - 1000));
    }
    if (this.seenSequences.size > capacityLimit) {
      const seqsArray = Array.from(this.seenSequences);
      this.seenSequences = new Set(seqsArray.slice(seqsArray.length - 1000));
    }

    // Dispatch normalized event to subscriber
    this.callbacks.onEvent(event);

    // Terminal stream handling
    if (event.eventType === 'stream_closed') {
      const taskStatus = (event.payload.status as string) || undefined;
      this.isExplicitlyClosed = true;
      this.setStatus('closed');
      if (this.callbacks.onStreamClosed) {
        this.callbacks.onStreamClosed(taskStatus);
      }
    }
  }

  /**
   * Handle stream ending when the server closes connection.
   */
  private handleStreamTermination(): void {
    if (this.status === 'closed') {
      return;
    }
    // Server stream ended without explicit stream_closed; mark closed
    this.setStatus('closed');
    if (this.callbacks.onStreamClosed) {
      this.callbacks.onStreamClosed();
    }
  }

  /**
   * Compute exponential backoff delay with jitter.
   */
  public computeBackoffDelay(attempt: number): number {
    const initial = this.config.initialBackoffMs ?? 1000;
    const maxBackoff = this.config.maxBackoffMs ?? 15000;
    const multiplier = this.config.backoffMultiplier ?? 1.5;
    const jitterFactor = this.config.jitterFactor ?? 0.2;

    const baseDelay = Math.min(initial * Math.pow(multiplier, attempt), maxBackoff);
    const jitter = (Math.random() * 2 - 1) * jitterFactor; // between -0.2 and +0.2
    return Math.max(200, Math.round(baseDelay * (1 + jitter)));
  }

  /**
   * Handle connection drop or network errors with exponential backoff and retry limits.
   */
  private handleConnectionFailure(error: Error): void {
    const maxRetries = this.config.maxRetries ?? 8;

    if (this.retryCount >= maxRetries) {
      // Reconnection attempts exhausted; transition gracefully to polling fallback
      this.setStatus('polling', error);
      return;
    }

    const delay = this.computeBackoffDelay(this.retryCount);
    this.retryCount += 1;
    this.setStatus('reconnecting', error);

    this.reconnectTimer = setTimeout(() => {
      if (!this.isExplicitlyClosed) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Manual reconnect triggered by user action.
   */
  public reconnect(): void {
    this.retryCount = 0;
    this.clearReconnectTimer();
    this.connect();
  }

  /**
   * Disconnect and release all underlying network streams and timers.
   */
  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.clearReconnectTimer();

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.status !== 'closed') {
      this.setStatus('disconnected');
    }
  }

  private setStatus(newStatus: SSEConnectionStatus, error?: Error): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.callbacks.onStatusChange(newStatus, error);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
