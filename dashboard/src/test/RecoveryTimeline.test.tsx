import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { RecoveryTimeline } from '../components/recovery/RecoveryTimeline';
import { TimelineEntryItem } from '../api/recovery/types';

describe('RecoveryTimeline Component', () => {
  const mockEntries: TimelineEntryItem[] = [
    {
      sequence_number: 1,
      timestamp: '2026-11-23T10:00:00Z',
      event_type: 'task_started',
      category: 'task',
      status: 'success',
      summary: 'Task execution started',
    },
    {
      sequence_number: 2,
      timestamp: '2026-11-23T10:00:01Z',
      event_type: 'tool_timeout',
      category: 'timeout',
      status: 'timeout',
      summary: "Tool 'search' timed out after 10.00s",
      tool_name: 'search',
    },
    {
      sequence_number: 3,
      timestamp: '2026-11-23T10:00:02Z',
      event_type: 'task_resumed',
      category: 'resume',
      status: 'success',
      summary: 'Task resumed at step 1',
    },
    {
      sequence_number: 4,
      timestamp: '2026-11-23T10:00:03Z',
      event_type: 'budget_exceeded',
      category: 'budget',
      status: 'exceeded',
      summary: "Budget limit 'max_tool_calls' exceeded",
    },
  ];

  it('renders timeline entries in deterministic sequence order with event summaries', () => {
    renderWithProviders(<RecoveryTimeline entries={mockEntries} />);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('Task execution started')).toBeInTheDocument();

    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText("Tool 'search' timed out after 10.00s")).toBeInTheDocument();

    expect(screen.getByText('#3')).toBeInTheDocument();
    expect(screen.getByText('Task resumed at step 1')).toBeInTheDocument();

    expect(screen.getByText('#4')).toBeInTheDocument();
    expect(screen.getByText("Budget limit 'max_tool_calls' exceeded")).toBeInTheDocument();
  });

  it('filters timeline events by category', () => {
    renderWithProviders(<RecoveryTimeline entries={mockEntries} />);

    const timeoutBtn = screen.getByRole('button', { name: /TIMEOUT \(1\)/i });
    fireEvent.click(timeoutBtn);

    expect(screen.getByText("Tool 'search' timed out after 10.00s")).toBeInTheDocument();
    expect(screen.queryByText('Task execution started')).not.toBeInTheDocument();
  });

  it('filters timeline events by search query', () => {
    renderWithProviders(<RecoveryTimeline entries={mockEntries} />);

    const searchInput = screen.getByPlaceholderText(/Filter timeline/i);
    fireEvent.change(searchInput, { target: { value: 'resumed' } });

    expect(screen.getByText('Task resumed at step 1')).toBeInTheDocument();
    expect(screen.queryByText('Task execution started')).not.toBeInTheDocument();
  });

  it('renders clean empty state when no timeline events exist', () => {
    renderWithProviders(<RecoveryTimeline entries={[]} />);

    expect(screen.getByText('No Timeline Entries Recorded')).toBeInTheDocument();
  });
});
