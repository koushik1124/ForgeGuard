import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { MetricCard } from '../components/common/MetricCard';
import { DataTable, Column } from '../components/common/DataTable';
import { StatusBadge } from '../components/common/StatusBadge';
import { ConnectionIndicator } from '../components/common/ConnectionIndicator';
import { renderWithProviders } from './test-utils';

describe('Component Library', () => {
  describe('MetricCard', () => {
    it('renders label, value, and subtitle correctly', () => {
      renderWithProviders(
        <MetricCard label="Total Steps" value={42} subtitle="Across 3 tasks" />
      );

      expect(screen.getByText('Total Steps')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('Across 3 tasks')).toBeInTheDocument();
    });

    it('renders unavailable reason when disconnected', () => {
      renderWithProviders(
        <MetricCard
          label="Active Executions"
          value="--"
          unavailableReason="API Disconnected"
        />
      );

      expect(screen.getByText('Active Executions')).toBeInTheDocument();
      expect(screen.getByText('--')).toBeInTheDocument();
      expect(screen.getByText('API Disconnected')).toBeInTheDocument();
    });

    it('renders skeleton when loading is true', () => {
      const { container } = renderWithProviders(
        <MetricCard label="Loading Metric" value={100} loading={true} />
      );

      expect(container.querySelector('.MuiSkeleton-root')).toBeInTheDocument();
    });
  });

  describe('DataTable', () => {
    interface TestItem {
      id: string;
      name: string;
      count: number;
    }

    const columns: Column<TestItem>[] = [
      { id: 'id', header: 'ID', render: (item) => item.id },
      { id: 'name', header: 'Name', render: (item) => item.name },
      { id: 'count', header: 'Count', render: (item) => String(item.count) },
    ];

    it('renders tabular data correctly', () => {
      const data: TestItem[] = [
        { id: 'item-1', name: 'Alpha', count: 10 },
        { id: 'item-2', name: 'Beta', count: 20 },
      ];

      renderWithProviders(
        <DataTable<TestItem> columns={columns} data={data} keyField="id" />
      );

      expect(screen.getByText('ID')).toBeInTheDocument();
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Count')).toBeInTheDocument();
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
    });

    it('renders empty state when data is empty', () => {
      renderWithProviders(
        <DataTable<TestItem>
          columns={columns}
          data={[]}
          keyField="id"
          emptyTitle="No Data Found"
          emptyMessage="Custom empty description text."
        />
      );

      expect(screen.getByText('No Data Found')).toBeInTheDocument();
      expect(screen.getByText('Custom empty description text.')).toBeInTheDocument();
    });
  });

  describe('StatusBadge', () => {
    it('renders valid status labels', () => {
      const { rerender } = renderWithProviders(<StatusBadge status="running" />);
      expect(screen.getByText(/running/i)).toBeInTheDocument();

      rerender(<StatusBadge status="completed" />);
      expect(screen.getByText(/completed/i)).toBeInTheDocument();

      rerender(<StatusBadge status="failed" />);
      expect(screen.getByText(/failed/i)).toBeInTheDocument();
    });
  });

  describe('ConnectionIndicator', () => {
    it('renders disconnected state by default', () => {
      renderWithProviders(<ConnectionIndicator state="disconnected" />);
      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    });

    it('renders connected state', () => {
      renderWithProviders(<ConnectionIndicator state="connected" />);
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });
  });
});
