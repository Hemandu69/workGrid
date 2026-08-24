import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';

let mockPathname = '/admin/people';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

let mockRole = 'SUPER_ADMIN';
vi.mock('../../lib/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'super-1', name: 'Priya Shah', avatarUrl: undefined, status: 'ONLINE', title: 'Global Operations Director', room: null, subroom: null, email: 'priya@workgrid.corp' },
    role: mockRole,
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

describe('Sidebar — People Management is SUPER_ADMIN-only, at /admin/people', () => {
  it('shows a single "People Management" entry, not two separate People Directory / Role Audit Trail items', () => {
    mockPathname = '/admin/people';
    render(<Sidebar />);

    expect(screen.getByText('People Management')).toBeInTheDocument();
    expect(screen.queryByText('People Directory')).not.toBeInTheDocument();
    expect(screen.queryByText('Role Audit Trail')).not.toBeInTheDocument();
  });

  it('stays active while on the /admin/people/audit child route, not just the exact /admin/people path', () => {
    mockPathname = '/admin/people/audit';
    render(<Sidebar />);

    const link = screen.getByText('People Management').closest('a');
    expect(link).toHaveClass('text-primary');
  });

  it('is active on the exact /admin/people path too', () => {
    mockPathname = '/admin/people';
    render(<Sidebar />);

    const link = screen.getByText('People Management').closest('a');
    expect(link).toHaveClass('text-primary');
  });

  it('does not falsely activate on an unrelated route that merely shares the /admin/people prefix textually', () => {
    mockPathname = '/admin/people-something-unrelated';
    render(<Sidebar />);

    const link = screen.getByText('People Management').closest('a');
    expect(link).not.toHaveClass('text-primary');
  });
});

describe('Sidebar — HR role removed entirely', () => {
  it('People Management is not visible to any non-SUPER_ADMIN role', () => {
    for (const role of ['ADMIN', 'SERVER', 'TEAM_LEAD', 'MEMBER']) {
      mockRole = role;
      mockPathname = '/admin/people';
      const { unmount } = render(<Sidebar />);
      expect(screen.queryByText('People Management')).not.toBeInTheDocument();
      unmount();
    }
    mockRole = 'SUPER_ADMIN';
  });
});

describe('Sidebar — Global Overview / Operations Grid consolidation (Room Overview, Reports & Analytics, and Teams & Directory removed)', () => {
  beforeEach(() => {
    mockRole = 'SUPER_ADMIN';
    mockPathname = '/super-admin';
  });

  it('shows exactly the consolidated 8-item navigation for SUPER_ADMIN (no Event Attendance)', () => {
    render(<Sidebar />);

    for (const label of [
      'Global Overview',
      'Announcements',
      'People Management',
      'Task Management',
      'Operations Grid',
      'People Availability',
      'Teams',
      'Notifications',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // Organizers must not see Event Attendance
    expect(screen.queryByText('Event Attendance')).not.toBeInTheDocument();
  });

  it('ADMIN does not see Event Attendance in navigation', () => {
    mockRole = 'ADMIN';
    mockPathname = '/admin';
    render(<Sidebar />);

    expect(screen.queryByText('Event Attendance')).not.toBeInTheDocument();
  });

  it('MEMBER sees Event Attendance in navigation', () => {
    mockRole = 'MEMBER';
    mockPathname = '/member';
    render(<Sidebar />);

    expect(screen.getByRole('link', { name: /event attendance/i })).toBeInTheDocument();
  });

  it('no longer shows Room Overview, Reports & Analytics, or Teams & Directory', () => {
    render(<Sidebar />);

    expect(screen.queryByText('Room Overview')).not.toBeInTheDocument();
    expect(screen.queryByText('Reports & Analytics')).not.toBeInTheDocument();
    expect(screen.queryByText('Teams & Directory')).not.toBeInTheDocument();
  });

  it('Global Overview is the only active item on /super-admin', () => {
    render(<Sidebar />);

    expect(screen.getByText('Global Overview').closest('a')).toHaveClass('text-primary');
    expect(screen.getByText('Operations Grid').closest('a')).not.toHaveClass('text-primary');
  });

  it('Operations Grid is the only active item on /admin/operations', () => {
    mockPathname = '/admin/operations';
    render(<Sidebar />);

    expect(screen.getByText('Operations Grid').closest('a')).toHaveClass('text-primary');
    expect(screen.getByText('Global Overview').closest('a')).not.toHaveClass('text-primary');
  });
});

describe('Sidebar — Teams nav item is ADMIN/SUPER_ADMIN-only', () => {
  it('MEMBER, SERVER, and TEAM_LEAD do not see Teams', () => {
    for (const role of ['MEMBER', 'SERVER', 'TEAM_LEAD']) {
      mockRole = role;
      mockPathname = '/admin/teams';
      const { unmount } = render(<Sidebar />);
      expect(screen.queryByText('Teams')).not.toBeInTheDocument();
      unmount();
    }
    mockRole = 'SUPER_ADMIN';
  });

  it('stays active on a nested /admin/teams/:id route', () => {
    mockRole = 'ADMIN';
    mockPathname = '/admin/teams/team-1';
    render(<Sidebar />);

    const link = screen.getByText('Teams').closest('a');
    expect(link).toHaveClass('text-primary');
  });
});

describe('Sidebar — event-oriented product identity', () => {
  it('shows the "Event Operations & Tracking" tagline, not the old office tagline', () => {
    mockRole = 'SUPER_ADMIN';
    mockPathname = '/super-admin';
    render(<Sidebar />);

    expect(screen.getByText('Event Operations & Tracking')).toBeInTheDocument();
    expect(screen.queryByText('Office Task Tracker')).not.toBeInTheDocument();
  });
});
