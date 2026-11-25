import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { LiveExecutionInspector } from '../components/inspector/LiveExecutionInspector';
import * as useTaskEventsModule from '../api/sse/useTaskEvents';
import * as EventStreamClientModule from '../api/sse/eventStreamClient';
import { NormalizedEvent, ToolCallItem } from '../api/sse/types';

describe('LiveExecutionInspector UI Component', () => {
  const mockEvents: NormalizedEvent[] = [
    {
      id: 'norm-1',
      eventId: 'ev-1',
      sequenceNumber: 1,
      timestamp: '2026-11-23T10:00:00Z',
      eventType: 'task_started',
      category: 'lifecycle',
      taskId: 'task-test-123',
      summary: 'Governed execution started',
      payload: { task_id: 'task-test-123' },
      isReplayed: false,
    },
    {
      id: 'norm-2',
      eventId: 'ev-2',
      sequenceNumber: 2,
      timestamp: '2026-11-23T10:00:01Z',
      eventType: 'tool_call_started',
      category: 'tool',
      toolName: 'calculator',
      toolCallId: 'call-1',
      step: 1,
      status: 'running',
      summary: "Tool 'calculator' started execution (step 1)",
      payload: { tool_name: 'calculator', step: 1 },
      isReplayed: false,
    },
    {
      id: 'norm-3',
      eventId: 'ev-3',
      sequenceNumber: 3,
      timestamp: '2026-11-23T10:00:02Z',
      eventType: 'tool_call_completed',
      category: 'tool',
      toolName: 'calculator',
      toolCallId: 'call-1',
      step: 1,
      status: 'success',
      durationSeconds: 0.25,
      summary: "Tool 'calculator' completed successfully (step 1)",
      payload: { output: 42 },
      isReplayed: false,
    },
  ];

  const mockToolCalls: ToolCallItem[] = [
    {
      callId: 'call-1',
      toolName: 'calculator',
      step: 1,
      status: 'success',
      durationSeconds: 0.25,
      output: 42,
    },
  ];

  it('renders live connected badge and event timeline correctly', () => {
    vi.spyOn(useTaskEventsModule, 'useTaskEvents').mockReturnValue({
      events: mockEvents,
      displayedEvents: mockEvents,
      toolCalls: mockToolCalls,
      connectionStatus: 'connected',
      error: null,
      sequenceGaps: [],
      hasGaps: false,
      isPaused: false,
      autoScroll: true,
      filter: 'all',
      pendingEventCount: 0,
      reconnect: vi.fn(),
      togglePause: vi.fn(),
      toggleAutoScroll: vi.fn(),
      setFilter: vi.fn(),
      clearEvents: vi.fn(),
    });

    renderWithProviders(<LiveExecutionInspector taskId="task-test-123" />);

    expect(screen.getByText('Live Execution Inspector')).toBeInTheDocument();
    expect(screen.getByText('LIVE / CONNECTED')).toBeInTheDocument();
    expect(screen.getByText('3 events')).toBeInTheDocument();
    expect(screen.getByText('Governed execution started')).toBeInTheDocument();
    expect(screen.getByText("Tool 'calculator' started execution (step 1)")).toBeInTheDocument();
    expect(screen.getByText("Tool 'calculator' completed successfully (step 1)")).toBeInTheDocument();
  });

  it('renders polling fallback state distinctly without affecting task display', () => {
    vi.spyOn(useTaskEventsModule, 'useTaskEvents').mockReturnValue({
      events: mockEvents,
      displayedEvents: mockEvents,
      toolCalls: mockToolCalls,
      connectionStatus: 'polling',
      error: new Error('Network timeout'),
      sequenceGaps: [],
      hasGaps: false,
      isPaused: false,
      autoScroll: true,
      filter: 'all',
      pendingEventCount: 0,
      reconnect: vi.fn(),
      togglePause: vi.fn(),
      toggleAutoScroll: vi.fn(),
      setFilter: vi.fn(),
      clearEvents: vi.fn(),
    });

    renderWithProviders(<LiveExecutionInspector taskId="task-test-123" />);

    expect(screen.getByText('POLLING FALLBACK')).toBeInTheDocument();
    expect(
      screen.getByText('SSE streaming disconnected. Operating in automatic polling fallback mode.')
    ).toBeInTheDocument();
  });

  it('displays warning alert when sequence gaps are detected', () => {
    vi.spyOn(useTaskEventsModule, 'useTaskEvents').mockReturnValue({
      events: mockEvents,
      displayedEvents: mockEvents,
      toolCalls: mockToolCalls,
      connectionStatus: 'connected',
      error: null,
      sequenceGaps: [{ from: 4, to: 7 }],
      hasGaps: true,
      isPaused: false,
      autoScroll: true,
      filter: 'all',
      pendingEventCount: 0,
      reconnect: vi.fn(),
      togglePause: vi.fn(),
      toggleAutoScroll: vi.fn(),
      setFilter: vi.fn(),
      clearEvents: vi.fn(),
    });

    renderWithProviders(<LiveExecutionInspector taskId="task-test-123" />);

    expect(
      screen.getByText(/Sequence gap detected in event stream: missing events from seq 4\.\.7/)
    ).toBeInTheDocument();
  });

  it('renders paused view banner with queued event count', () => {
    const mockTogglePause = vi.fn();

    vi.spyOn(useTaskEventsModule, 'useTaskEvents').mockReturnValue({
      events: mockEvents,
      displayedEvents: mockEvents.slice(0, 1),
      toolCalls: mockToolCalls,
      connectionStatus: 'connected',
      error: null,
      sequenceGaps: [],
      hasGaps: false,
      isPaused: true,
      autoScroll: true,
      filter: 'all',
      pendingEventCount: 2,
      reconnect: vi.fn(),
      togglePause: mockTogglePause,
      toggleAutoScroll: vi.fn(),
      setFilter: vi.fn(),
      clearEvents: vi.fn(),
    });

    renderWithProviders(<LiveExecutionInspector taskId="task-test-123" />);

    expect(screen.getByText(/Live timeline viewing paused\. 2 new event\(s\) received in background\./)).toBeInTheDocument();

    const catchUpBtn = screen.getByRole('button', { name: /Catch Up Now/i });
    fireEvent.click(catchUpBtn);
    expect(mockTogglePause).toHaveBeenCalledTimes(1);
  });

  it('switches between Timeline view and Tool Calls view', () => {
    vi.spyOn(useTaskEventsModule, 'useTaskEvents').mockReturnValue({
      events: mockEvents,
      displayedEvents: mockEvents,
      toolCalls: mockToolCalls,
      connectionStatus: 'connected',
      error: null,
      sequenceGaps: [],
      hasGaps: false,
      isPaused: false,
      autoScroll: true,
      filter: 'all',
      pendingEventCount: 0,
      reconnect: vi.fn(),
      togglePause: vi.fn(),
      toggleAutoScroll: vi.fn(),
      setFilter: vi.fn(),
      clearEvents: vi.fn(),
    });

    renderWithProviders(<LiveExecutionInspector taskId="task-test-123" />);

    // Click Tool Calls tab
    const toolCallsTab = screen.getByRole('button', { name: /Tool Calls/i });
    fireEvent.click(toolCallsTab);

    expect(screen.getByText('Call ID: call-1')).toBeInTheDocument();
    expect(screen.getByText('SUCCESS')).toBeInTheDocument();
  });

  it('supports manual reconnect action', () => {
    const mockReconnect = vi.fn();

    vi.spyOn(useTaskEventsModule, 'useTaskEvents').mockReturnValue({
      events: [],
      displayedEvents: [],
      toolCalls: [],
      connectionStatus: 'disconnected',
      error: new Error('Stream drop'),
      sequenceGaps: [],
      hasGaps: false,
      isPaused: false,
      autoScroll: true,
      filter: 'all',
      pendingEventCount: 0,
      reconnect: mockReconnect,
      togglePause: vi.fn(),
      toggleAutoScroll: vi.fn(),
      setFilter: vi.fn(),
      clearEvents: vi.fn(),
    });

    renderWithProviders(<LiveExecutionInspector taskId="task-test-123" />);

    const reconnectBtn = screen.getByRole('button', { name: /Reconnect/i });
    fireEvent.click(reconnectBtn);
    expect(mockReconnect).toHaveBeenCalledTimes(1);
  });

  it('does not abort connection on mount when task is terminal', () => {
    // Unmock useTaskEvents to test real hook implementation
    vi.restoreAllMocks();

    const mockConnect = vi.fn();
    const mockDisconnect = vi.fn();

    // Mock EventStreamClient
    vi.spyOn(EventStreamClientModule, 'EventStreamClient').mockImplementation(
      () =>
        ({
          connect: mockConnect,
          disconnect: mockDisconnect,
          getStatus: () => 'connecting',
          getLatestEventId: () => null,
          getLatestSequence: () => 0,
        } as unknown as EventStreamClientModule.EventStreamClient)
    );

    renderWithProviders(<LiveExecutionInspector taskId="task-terminal-999" isTaskTerminal={true} />);

    // Must call connect on mount
    expect(mockConnect).toHaveBeenCalledTimes(1);
    // Must NOT immediately call disconnect on mount
    expect(mockDisconnect).not.toHaveBeenCalled();
  });
});
