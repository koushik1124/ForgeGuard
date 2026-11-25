/**
 * React Hook for Live SSE Execution Streaming (M9.4)
 * Coordinates EventStreamClient, event buffer memory bounding, paused timeline views,
 * sequence gap tracking, tool call correlation, and polling fallback.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../client';
import { correlateToolCalls } from './normalizer';
import { EventStreamClient } from './eventStreamClient';
import {
  EventFilterCategory,
  NormalizedEvent,
  SSEConnectionStatus,
  ToolCallItem,
} from './types';

export interface UseTaskEventsOptions {
  enabled?: boolean;
  isTaskTerminal?: boolean;
  maxEvents?: number;
}

export interface UseTaskEventsResult {
  events: NormalizedEvent[];
  displayedEvents: NormalizedEvent[];
  toolCalls: ToolCallItem[];
  connectionStatus: SSEConnectionStatus;
  error: Error | null;
  sequenceGaps: Array<{ from: number; to: number }>;
  hasGaps: boolean;
  isPaused: boolean;
  autoScroll: boolean;
  filter: EventFilterCategory;
  pendingEventCount: number;
  reconnect: () => void;
  togglePause: () => void;
  toggleAutoScroll: () => void;
  setFilter: (filter: EventFilterCategory) => void;
  clearEvents: () => void;
}

export function useTaskEvents(
  taskId: string,
  options: UseTaskEventsOptions = {}
): UseTaskEventsResult {
  const { enabled = true, isTaskTerminal = false, maxEvents = 1000 } = options;

  const [allEvents, setAllEvents] = useState<NormalizedEvent[]>([]);
  const [frozenEvents, setFrozenEvents] = useState<NormalizedEvent[] | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<SSEConnectionStatus>('disconnected');
  const [error, setError] = useState<Error | null>(null);
  const [sequenceGaps, setSequenceGaps] = useState<Array<{ from: number; to: number }>>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [filter, setFilter] = useState<EventFilterCategory>('all');

  const clientRef = useRef<EventStreamClient | null>(null);
  const isPausedRef = useRef<boolean>(false);
  isPausedRef.current = isPaused;

  const handleEvent = useCallback(
    (event: NormalizedEvent) => {
      setAllEvents((prev) => {
        // Enforce upper bound on client memory
        const next = [...prev, event];
        if (next.length > maxEvents) {
          return next.slice(next.length - maxEvents);
        }
        return next;
      });
    },
    [maxEvents]
  );

  const handleStatusChange = useCallback((status: SSEConnectionStatus, err?: Error) => {
    setConnectionStatus(status);
    if (err) {
      setError(err);
    } else if (status === 'connected') {
      setError(null);
    }
  }, []);

  const handleGapDetected = useCallback((expectedSeq: number, receivedSeq: number) => {
    setSequenceGaps((prev) => [...prev, { from: expectedSeq, to: receivedSeq }]);
  }, []);

  // Initialize and tear down event stream client
  useEffect(() => {
    if (!enabled || !taskId) {
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
      setConnectionStatus('disconnected');
      return;
    }

    // Reset task events for new task
    setAllEvents([]);
    setFrozenEvents(null);
    setSequenceGaps([]);
    setError(null);

    const client = new EventStreamClient(
      {
        baseUrl: apiClient.getBaseUrl(),
        taskId,
        apiKey: apiClient.getApiKey(),
        maxEventHistory: maxEvents,
      },
      {
        onEvent: handleEvent,
        onStatusChange: handleStatusChange,
        onGapDetected: handleGapDetected,
        onStreamClosed: () => {
          setConnectionStatus('closed');
        },
      }
    );

    clientRef.current = client;

    // If task is already known to be terminal before connecting, stream historical events then close
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [taskId, enabled, handleEvent, handleStatusChange, handleGapDetected, maxEvents]);

  // If task is terminal and reconnecting fails or drops, do not loop reconnecting
  useEffect(() => {
    if (isTaskTerminal && clientRef.current && connectionStatus === 'reconnecting') {
      clientRef.current.disconnect();
      setConnectionStatus('closed');
    }
  }, [isTaskTerminal, connectionStatus]);

  // Handle Pause / Resume freeze snapshot
  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev;
      if (next) {
        // Pausing: freeze current events snapshot
        setFrozenEvents([...allEvents]);
      } else {
        // Resuming: unfreeze
        setFrozenEvents(null);
      }
      return next;
    });
  }, [allEvents]);

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => !prev);
  }, []);

  const reconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.reconnect();
    }
  }, []);

  const clearEvents = useCallback(() => {
    setAllEvents([]);
    setFrozenEvents(null);
    setSequenceGaps([]);
  }, []);

  // Active event stream for display
  const activeEvents = isPaused && frozenEvents ? frozenEvents : allEvents;

  // Filter events based on active category
  const displayedEvents = useMemo(() => {
    if (filter === 'all') {
      return activeEvents;
    }
    return activeEvents.filter((ev) => {
      if (filter === 'tool') return ev.category === 'tool';
      if (filter === 'policy') return ev.category === 'policy';
      if (filter === 'budget') return ev.category === 'budget';
      if (filter === 'lifecycle') return ev.category === 'lifecycle';
      if (filter === 'error') {
        return (
          ev.status === 'failure' ||
          ev.status === 'timeout' ||
          ev.status === 'rejected' ||
          ev.eventType === 'task_failed' ||
          ev.eventType === 'budget_exceeded'
        );
      }
      return true;
    });
  }, [activeEvents, filter]);

  // Correlate tool calls from active events
  const toolCalls = useMemo(() => {
    return correlateToolCalls(allEvents);
  }, [allEvents]);

  const pendingEventCount = isPaused && frozenEvents ? Math.max(0, allEvents.length - frozenEvents.length) : 0;

  return {
    events: allEvents,
    displayedEvents,
    toolCalls,
    connectionStatus,
    error,
    sequenceGaps,
    hasGaps: sequenceGaps.length > 0,
    isPaused,
    autoScroll,
    filter,
    pendingEventCount,
    reconnect,
    togglePause,
    toggleAutoScroll,
    setFilter,
    clearEvents,
  };
}
