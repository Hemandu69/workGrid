import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SuperAdminDashboard from './page';
import { apiClient } from '../../lib/api-client';
import { Room } from '../../types/room';

vi.mock('../../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

vi.mock('../../components/attendance/AttendanceCard', () => ({
  AttendanceCard: () => null,
}));

vi.mock('../../lib/realtime-context', () => ({
  useDomainEvent: () => {},
}));

vi.mock('../../lib/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'super-1', name: 'Elena Vance' },
    role: 'SUPER_ADMIN',
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    getDashboardSummary: vi.fn(),
    getAnnouncements: vi.fn(),
    getTasks: vi.fn(),
    getRooms: vi.fn(),
    getHealth: vi.fn(),
  },
}));

const mockedApi = vi.mocked(apiClient);

function buildRoom(letter: Room['letter'], overrides: Partial<Room> = {}): Room {
  return {
    id: `room-${letter}`,
    letter,
    name: `Section ${letter}`,
    subrooms: [],
    totalMembers: 1,
    totalCapacity: 16,
    occupancyPercentage: 6,
    ...overrides,
  };
}

describe('Global Overview (/super-admin) — merged with Reports & Analytics metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.getDashboardSummary.mockResolvedValue({
      organizationScale: 7,
      totalMembers: 5,
      totalCapacity: 128,
      globalSaturationPercentage: 3,
      activeTasks: 14,
      overdueRiskPercentage: 7,
    });
    mockedApi.getAnnouncements.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });
    mockedApi.getTasks.mockResolvedValue({ items: [], total: 0, limit: 200, offset: 0 });
    mockedApi.getRooms.mockResolvedValue([buildRoom('A'), buildRoom('B', { occupancyPercentage: 13 })]);
    mockedApi.getHealth.mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 100,
      environment: 'test',
      version: '1.0.0',
      services: { database: { status: 'healthy' }, redis: { status: 'healthy' } },
    });
  });

  it('renders Active Tasks sourced from stats.activeTasks', async () => {
    render(<SuperAdminDashboard />);

    await waitFor(() => expect(screen.getByText('Active Tasks')).toBeInTheDocument());
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('renders Tasks at Risk of Being Late sourced from stats.overdueRiskPercentage', async () => {
    render(<SuperAdminDashboard />);

    await waitFor(() => expect(screen.getByText('Tasks at Risk of Being Late')).toBeInTheDocument());
    expect(screen.getByText('7%')).toBeInTheDocument();
  });

  it('keeps the pre-existing Global Overview cards', async () => {
    render(<SuperAdminDashboard />);

    await waitFor(() => expect(screen.getByText('People in Organization')).toBeInTheDocument());
    expect(screen.getByText('Workspace Usage')).toBeInTheDocument();
    expect(screen.getByText('Tasks Needing Attention')).toBeInTheDocument();
    expect(screen.getByText('WorkGrid Status')).toBeInTheDocument();
  });

  it('renders the compact section summary, not the full room/subroom grid', async () => {
    render(<SuperAdminDashboard />);

    await waitFor(() => expect(screen.getByText('Section A')).toBeInTheDocument());
    expect(screen.getByText('1 / 16 (6%)')).toBeInTheDocument();
    // The old full grid rendered individual subroom cells like "A1", "B3", etc.
    // None of those should exist now.
    for (const letter of ['A', 'B']) {
      for (let n = 1; n <= 8; n++) {
        expect(screen.queryByText(`${letter}${n}`)).not.toBeInTheDocument();
      }
    }
  });

  it('the "Detailed Grid →" link points at Operations Grid, not the removed Room Overview route', async () => {
    render(<SuperAdminDashboard />);

    await waitFor(() => expect(screen.getByRole('link', { name: 'Detailed Grid →' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Detailed Grid →' })).toHaveAttribute('href', '/admin/operations');
  });
});
