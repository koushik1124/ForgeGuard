import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { CheckpointForensicsCard } from '../components/recovery/CheckpointForensicsCard';
import { CheckpointForensics } from '../api/recovery/types';

describe('CheckpointForensicsCard Component', () => {
  const renderCard = (forensics: CheckpointForensics) => {
    return renderWithProviders(<CheckpointForensicsCard forensics={forensics} />);
  };

  it('renders reconstructed position and continuation target step accurately', () => {
    const forensics: CheckpointForensics = {
      reconstructed_position: 4,
      completed_calls: ['tc-1', 'tc-2', 'tc-3'],
      completed_call_count: 3,
      uncertain_calls: [],
      is_inferred: false,
      reconstruction_source: 'checkpoint',
      warnings: [],
      budget_snapshot: { max_tool_calls: 10 },
    };

    renderCard(forensics);

    expect(screen.getByText('Reconstructed Position')).toBeInTheDocument();
    expect(screen.getByText('Continuation Target')).toBeInTheDocument();
    expect(screen.getAllByText('Step 4')).toHaveLength(2);
    expect(screen.getByText('3 completed calls preserved')).toBeInTheDocument();
    expect(screen.getByText('Verified SQLite Checkpoint')).toBeInTheDocument();
    expect(screen.getByText('Complete state restored from durable SQLite checkpoint.')).toBeInTheDocument();
  });

  it('renders Inferred from Tool Execution Records badge when reconstruction_source is tool_records', () => {
    const forensics: CheckpointForensics = {
      reconstructed_position: 2,
      completed_calls: ['tc-1'],
      completed_call_count: 1,
      uncertain_calls: [],
      is_inferred: true,
      reconstruction_source: 'tool_records',
      warnings: ['Reconstructed state without durable snapshot'],
      budget_snapshot: null,
    };

    renderCard(forensics);

    expect(screen.getByText('Inferred from Tool Execution Records')).toBeInTheDocument();
    expect(
      screen.getByText('Reconstructed from persistent tool execution tables without snapshot.')
    ).toBeInTheDocument();
    expect(screen.getByText('Reconstructed state without durable snapshot')).toBeInTheDocument();
  });

  it('renders No Prior State Available badge when reconstruction_source is none', () => {
    const forensics: CheckpointForensics = {
      reconstructed_position: 0,
      completed_calls: [],
      completed_call_count: 0,
      uncertain_calls: [],
      is_inferred: false,
      reconstruction_source: 'none',
      warnings: [],
      budget_snapshot: null,
    };

    renderCard(forensics);

    expect(screen.getByText('No Prior State Available')).toBeInTheDocument();
    expect(screen.getByText('Fresh execution without checkpoint recovery.')).toBeInTheDocument();
    expect(screen.getByText('No tool calls were completed prior to interruption.')).toBeInTheDocument();
  });

  it('renders Uncertain Side-Effects alert when uncertain_calls exist', () => {
    const forensics: CheckpointForensics = {
      reconstructed_position: 2,
      completed_calls: ['call-abc'],
      completed_call_count: 1,
      uncertain_calls: ['call-xyz-crash', 'call-second-crash'],
      is_inferred: true,
      reconstruction_source: 'tool_records',
      warnings: ['Process died while tool was in flight'],
      budget_snapshot: null,
    };

    renderCard(forensics);

    expect(screen.getByText(/Uncertain Side-Effects Detected \(2 Incomplete Calls\)/i)).toBeInTheDocument();
    expect(screen.getByText('call-xyz-crash')).toBeInTheDocument();
    expect(screen.getByText('call-second-crash')).toBeInTheDocument();
    expect(screen.getByText(/The process was interrupted while the following tool invocations were in RUNNING status/i)).toBeInTheDocument();
  });

  it('renders preserved completed tool calls ledger chips properly', () => {
    const forensics: CheckpointForensics = {
      reconstructed_position: 3,
      completed_calls: ['tool-file-read-1', 'tool-bash-exec-2'],
      completed_call_count: 2,
      uncertain_calls: [],
      is_inferred: false,
      reconstruction_source: 'checkpoint',
      warnings: [],
      budget_snapshot: { max_tool_calls: 10 },
    };

    renderCard(forensics);

    expect(screen.getByText('Preserved Completed Tool Calls (2)')).toBeInTheDocument();
    expect(screen.getByText('Will NOT be re-executed on resume')).toBeInTheDocument();
    expect(screen.getByText('#1: tool-file-read-1')).toBeInTheDocument();
    expect(screen.getByText('#2: tool-bash-exec-2')).toBeInTheDocument();
  });
});
