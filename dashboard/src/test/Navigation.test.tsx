import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../components/layout/Sidebar';
import { renderWithProviders } from './test-utils';

describe('Sidebar Navigation', () => {
  it('renders all navigation sections correctly', () => {
    renderWithProviders(<Sidebar />, { initialEntries: ['/dashboard'] });

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Execution')).toBeInTheDocument();
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('renders all key navigation links', () => {
    renderWithProviders(<Sidebar />, { initialEntries: ['/dashboard'] });

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tasks/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /live runs/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /policies/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /budgets/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /recovery/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /workspaces/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /evaluations/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /metrics/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('triggers onToggleCollapse when collapse button is clicked', () => {
    const handleToggle = vi.fn();
    renderWithProviders(
      <Sidebar collapsed={false} onToggleCollapse={handleToggle} />,
      { initialEntries: ['/dashboard'] }
    );

    const toggleButton = screen.getByRole('button', { name: /collapse sidebar/i });
    expect(toggleButton).toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it('displays expand sidebar button when collapsed', () => {
    const handleToggle = vi.fn();
    renderWithProviders(
      <Sidebar collapsed={true} onToggleCollapse={handleToggle} />,
      { initialEntries: ['/dashboard'] }
    );

    const expandButton = screen.getByRole('button', { name: /expand sidebar/i });
    expect(expandButton).toBeInTheDocument();

    fireEvent.click(expandButton);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });
});
