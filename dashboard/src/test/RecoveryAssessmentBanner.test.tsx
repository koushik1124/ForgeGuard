import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import { RecoveryAssessmentBanner } from '../components/recovery/RecoveryAssessmentBanner';
import { TaskDiagnosticsResponse, TaskResponse } from '../api/types';

describe('RecoveryAssessmentBanner Component', () => {
  const baseTask: TaskResponse = {
    task_id: 'task-test-001',
    description: 'Test recovery task',
    status: 'failed',
    created_at: '2026-11-23T10:00:00Z',
  };

  it('renders Safe to Resume banner and resume action button when can_resume_safely is true', () => {
    const onResume = vi.fn();
    const diagnostics: TaskDiagnosticsResponse = {
      task_id: 'task-test-001',
      timeline: [],
      diagnostics: [],
      recovery_info: {
        can_resume_safely: true,
        completed_calls: ['call-read-01'],
        uncertain_calls: [],
        warnings: [],
      },
    };

    renderWithProviders(
      <RecoveryAssessmentBanner
        task={baseTask}
        diagnostics={diagnostics}
        onResumeClick={onResume}
      />
    );

    expect(screen.getByText('Safe to Resume')).toBeInTheDocument();
    expect(screen.getByText('SAFE TO RESUME')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resume from Checkpoint/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Resume from Checkpoint/i }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('renders Resume Blocked: Uncertain Side-Effects when uncertain calls exist and hides resume button', () => {
    const onResume = vi.fn();
    const diagnostics: TaskDiagnosticsResponse = {
      task_id: 'task-test-001',
      timeline: [],
      diagnostics: [],
      recovery_info: {
        can_resume_safely: false,
        completed_calls: ['call-1'],
        uncertain_calls: ['call-side-effect-crashed'],
        warnings: ["Tool call 'call-side-effect-crashed' was interrupted; classified as uncertain."],
      },
    };

    renderWithProviders(
      <RecoveryAssessmentBanner
        task={baseTask}
        diagnostics={diagnostics}
        onResumeClick={onResume}
      />
    );

    expect(screen.getByText('Resume Blocked: Uncertain Side-Effects')).toBeInTheDocument();
    expect(screen.getByText('RESUME BLOCKED: UNCERTAIN SIDE-EFFECTS')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resume Task from Checkpoint/i })).not.toBeInTheDocument();

    // Expand evidence
    const viewDetailsBtn = screen.getByRole('button', { name: /View Details/i });
    fireEvent.click(viewDetailsBtn);
    expect(screen.getByText(/classified as uncertain/i)).toBeInTheDocument();
  });

  it('renders Task is Actively Executing for running tasks and blocks resume action', () => {
    const runningTask: TaskResponse = { ...baseTask, status: 'running' };

    renderWithProviders(
      <RecoveryAssessmentBanner
        task={runningTask}
        diagnostics={null}
        onResumeClick={vi.fn()}
      />
    );

    expect(screen.getByText('Task is Actively Executing')).toBeInTheDocument();
    expect(screen.getByText('TASK ACTIVE (RUNNING)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resume Task from Checkpoint/i })).not.toBeInTheDocument();
  });

  it('renders Terminal state for completed tasks', () => {
    const completedTask: TaskResponse = { ...baseTask, status: 'completed' };

    renderWithProviders(
      <RecoveryAssessmentBanner
        task={completedTask}
        diagnostics={null}
        onResumeClick={vi.fn()}
      />
    );

    expect(screen.getByText('Task Execution Complete')).toBeInTheDocument();
    expect(screen.getByText('TERMINAL: COMPLETED')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resume Task from Checkpoint/i })).not.toBeInTheDocument();
  });

  it('renders Evaluating Preconditions while diagnostics is loading', () => {
    renderWithProviders(
      <RecoveryAssessmentBanner
        task={baseTask}
        diagnostics={null}
        isDiagnosticsLoading={true}
        onResumeClick={vi.fn()}
      />
    );

    expect(screen.getByText('Evaluating Recovery Preconditions')).toBeInTheDocument();
    expect(screen.getByText('EVALUATING PRECONDITIONS...')).toBeInTheDocument();
  });
});
