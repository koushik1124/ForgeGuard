import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from './test-utils';
import { WorkspaceDetailPage } from '../pages/WorkspaceDetailPage';

const mockWorkspace = {
  workspace_id: 'ws-test-123',
  name: 'Security Test Workspace',
  root_path: '/sandbox/test_workspace',
  created_at: '2026-11-22T08:00:00Z',
  description: 'Confined sandbox for testing',
};

const mockRootDir = {
  workspace_id: 'ws-test-123',
  subpath: '',
  total_entries: 3,
  entries: [
    {
      name: 'src',
      relative_path: 'src',
      is_directory: true,
      size_bytes: null,
      extension: '',
    },
    {
      name: 'README.md',
      relative_path: 'README.md',
      is_directory: false,
      size_bytes: 512,
      extension: '.md',
    },
    {
      name: 'dataset.bin',
      relative_path: 'dataset.bin',
      is_directory: false,
      size_bytes: 2048,
      extension: '.bin',
    },
  ],
};

const mockSrcDir = {
  workspace_id: 'ws-test-123',
  subpath: 'src',
  total_entries: 2,
  entries: [
    {
      name: 'index.ts',
      relative_path: 'src/index.ts',
      is_directory: false,
      size_bytes: 120,
      extension: '.ts',
    },
    {
      name: 'truncated.log',
      relative_path: 'src/truncated.log',
      is_directory: false,
      size_bytes: 100000,
      extension: '.log',
    },
  ],
};

const renderDetail = (workspaceId = 'ws-test-123') => {
  return renderWithProviders(
    <Routes>
      <Route path="/workspaces/:workspaceId" element={<WorkspaceDetailPage />} />
    </Routes>,
    { initialEntries: [`/workspaces/${workspaceId}`] }
  );
};

describe('WorkspaceDetailPage & FileBrowser Integration (M9.7.1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders workspace metadata, breadcrumbs, and directory entries', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/workspaces/ws-test-123/files')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockRootDir,
        });
      }
      if (url.includes('/api/v1/workspaces/ws-test-123')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspace,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Security Test Workspace' })).toBeInTheDocument();
      expect(screen.getByText('/sandbox/test_workspace')).toBeInTheDocument();
      expect(screen.getByText('Contained Sandbox')).toBeInTheDocument();
      expect(screen.getByText('Filesystem Explorer')).toBeInTheDocument();
    });

    // Check directory table contents
    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
      expect(screen.getByText('README.md')).toBeInTheDocument();
      expect(screen.getByText('dataset.bin')).toBeInTheDocument();
      expect(screen.getByText('512 B')).toBeInTheDocument();
      expect(screen.getByText('2 KB')).toBeInTheDocument();
    });
  });

  it('supports directory navigation into subfolder and back via breadcrumbs', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/files?subpath=src') || url.includes('/files&subpath=src')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockSrcDir,
        });
      }
      if (url.includes('/api/v1/workspaces/ws-test-123/files')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockRootDir,
        });
      }
      if (url.includes('/api/v1/workspaces/ws-test-123')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspace,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    // Click on 'src' folder row
    fireEvent.click(screen.getByText('src'));

    // Should load subdirectory entries
    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeInTheDocument();
      expect(screen.getByText('truncated.log')).toBeInTheDocument();
      expect(screen.getByText('.. (Parent Directory)')).toBeInTheDocument();
    });

    // Click breadcrumb root to return
    fireEvent.click(screen.getByRole('button', { name: /root/i }));

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });
  });

  it('opens file preview modal and displays text content', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/workspaces/ws-test-123/file?path=README.md')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            workspace_id: 'ws-test-123',
            relative_path: 'README.md',
            name: 'README.md',
            size_bytes: 512,
            read_bytes: 512,
            is_truncated: false,
            is_binary: false,
            content: '# Project Documentation\nAll tests pass securely.',
            extension: '.md',
            mime_type: 'text/markdown',
          }),
        });
      }
      if (url.includes('/api/v1/workspaces/ws-test-123/files')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockRootDir,
        });
      }
      if (url.includes('/api/v1/workspaces/ws-test-123')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspace,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    // Click README.md to trigger preview modal
    fireEvent.click(screen.getByText('README.md'));

    await waitFor(() => {
      expect(screen.getByText(/# Project Documentation/i)).toBeInTheDocument();
      expect(screen.getByText('text/markdown')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
    });
  });

  it('displays truncation warning when file content exceeds preview budget', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/workspaces/ws-test-123/file?path=README.md')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            workspace_id: 'ws-test-123',
            relative_path: 'README.md',
            name: 'README.md',
            size_bytes: 200000,
            read_bytes: 50000,
            is_truncated: true,
            is_binary: false,
            content: 'Truncated log content...',
            extension: '.md',
            mime_type: 'text/plain',
          }),
        });
      }
      if (url.includes('/api/v1/workspaces/ws-test-123/files')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockRootDir,
        });
      }
      if (url.includes('/api/v1/workspaces/ws-test-123')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspace,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('README.md'));

    await waitFor(() => {
      expect(screen.getByText(/showing first 48.8 kb/i)).toBeInTheDocument();
    });
  });

  it('displays security access denied alert for protected credential files', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/workspaces/ws-test-123/file?path=README.md')) {
        return Promise.resolve({
          ok: false,
          status: 403,
          json: async () => ({
            error: {
              code: 'FG-WORKSPACE-403',
              message: 'Access denied: previewing sensitive credential or secret files is blocked.',
            },
          }),
        });
      }
      if (url.includes('/api/v1/workspaces/ws-test-123/files')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockRootDir,
        });
      }
      if (url.includes('/api/v1/workspaces/ws-test-123')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspace,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('README.md'));

    await waitFor(() => {
      expect(screen.getByText(/access denied: sensitive file protected/i)).toBeInTheDocument();
      expect(screen.getByText(/forgeguard security policy blocks read-only previews/i)).toBeInTheDocument();
    });
  });

  it('displays binary file alert without rendering raw binary stream', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/workspaces/ws-test-123/file?path=dataset.bin')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            workspace_id: 'ws-test-123',
            relative_path: 'dataset.bin',
            name: 'dataset.bin',
            size_bytes: 2048,
            read_bytes: 2048,
            is_truncated: false,
            is_binary: true,
            content: null,
            extension: '.bin',
            mime_type: 'application/octet-stream',
          }),
        });
      }
      if (url.includes('/api/v1/workspaces/ws-test-123/files')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockRootDir,
        });
      }
      if (url.includes('/api/v1/workspaces/ws-test-123')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockWorkspace,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText('dataset.bin')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('dataset.bin'));

    await waitFor(() => {
      expect(screen.getByText('Binary File Detected')).toBeInTheDocument();
      expect(screen.getByText(/raw binary file content cannot be safely previewed/i)).toBeInTheDocument();
    });
  });
});
