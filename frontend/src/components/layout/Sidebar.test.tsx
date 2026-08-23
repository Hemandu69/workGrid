import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';

let mockPathname = '/hr';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('../../lib/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'hr-1', name: 'Priya Shah', avatarUrl: undefined, status: 'ONLINE', title: 'HR Lead', room: null, subroom: null, email: 'priya@workgrid.corp' },
    role: 'HR',
  }),
}));

vi.mock('../../lib/notifications-context', () => ({
  useNotifications: () => ({ unreadCount: 0 }),
}));

vi.mock('../../lib/realtime-context', () => ({
  useRealtime: () => ({ isConnected: true }),
  useDomainEvent: () => {},
}));

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    getTasks: vi.fn().mockResolvedValue({ items: [] }),
  },
}));

describe('Sidebar — consolidated People Management nav entry', () => {
  it('shows a single "People Management" entry, not two separate People Directory / Role Audit Trail items', () => {
    mockPathname = '/hr';
    render(<Sidebar />);

    expect(screen.getByText('People Management')).toBeInTheDocument();
    expect(screen.queryByText('People Directory')).not.toBeInTheDocument();
    expect(screen.queryByText('Role Audit Trail')).not.toBeInTheDocument();
  });

  it('stays active while on the /hr/audit child route, not just the exact /hr path', () => {
    mockPathname = '/hr/audit';
    render(<Sidebar />);

    const link = screen.getByText('People Management').closest('a');
    expect(link).toHaveClass('text-primary');
  });

  it('is active on the exact /hr path too', () => {
    mockPathname = '/hr';
    render(<Sidebar />);

    const link = screen.getByText('People Management').closest('a');
    expect(link).toHaveClass('text-primary');
  });

  it('does not falsely activate on an unrelated route that merely shares the /hr prefix textually', () => {
    mockPathname = '/hro-something-unrelated';
    render(<Sidebar />);

    const link = screen.getByText('People Management').closest('a');
    expect(link).not.toHaveClass('text-primary');
  });
});
