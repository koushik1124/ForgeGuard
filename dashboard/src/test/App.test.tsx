import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { darkTheme } from '../theme/theme';
import { AppShell } from '../components/layout/AppShell';
import { DashboardPage } from '../pages/DashboardPage';
import { SettingsPage } from '../pages/SettingsPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { NotFoundPage } from '../pages/NotFoundPage';

const renderAppWithRoute = (initialPath: string) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/live" element={<PlaceholderPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe('Application Integration', () => {
  it('renders application shell and redirects root to dashboard overview', () => {
    renderAppWithRoute('/');

    const brandTitles = screen.getAllByText('ForgeGuard');
    expect(brandTitles.length).toBeGreaterThan(0);
    expect(brandTitles[0]).toBeInTheDocument();

    const runtimeConsoles = screen.getAllByText('Runtime Console');
    expect(runtimeConsoles.length).toBeGreaterThan(0);
    expect(runtimeConsoles[0]).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
  });

  it('renders 404 Not Found page on unknown route', () => {
    renderAppWithRoute('/unknown/non-existent-route');

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Route Not Found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toBeInTheDocument();
  });

  it('renders placeholder page for live route without milestone labels', () => {
    renderAppWithRoute('/live');

    expect(screen.getByRole('heading', { name: 'Live Runs & Streaming' })).toBeInTheDocument();
    expect(screen.getByText('Live Observability')).toBeInTheDocument();
    expect(screen.queryByText(/milestone/i)).not.toBeInTheDocument();
  });
});
