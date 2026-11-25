import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { darkTheme } from './theme/theme';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { TaskExplorerPage } from './pages/TaskExplorerPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { LiveRunsPage } from './pages/LiveRunsPage';
import { PoliciesPage } from './pages/PoliciesPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { RecoveryPage } from './pages/RecoveryPage';
import { MetricsPage } from './pages/MetricsPage';
import { WorkspaceListPage } from './pages/WorkspaceListPage';
import { WorkspaceDetailPage } from './pages/WorkspaceDetailPage';
import { EvaluationCenterPage } from './pages/EvaluationCenterPage';
import { EvaluationReportDetailPage } from './pages/EvaluationReportDetailPage';
import { NotFoundPage } from './pages/NotFoundPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/tasks" element={<TaskExplorerPage />} />
              <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
              <Route path="/live" element={<LiveRunsPage />} />
              <Route path="/policies" element={<PoliciesPage />} />
              <Route path="/budgets" element={<BudgetsPage />} />
              <Route path="/recovery" element={<RecoveryPage />} />
              <Route path="/workspaces" element={<WorkspaceListPage />} />
              <Route path="/workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
              <Route path="/evaluations" element={<EvaluationCenterPage />} />
              <Route path="/evaluations/:experimentId" element={<EvaluationReportDetailPage />} />
              <Route path="/metrics" element={<MetricsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
