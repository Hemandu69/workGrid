import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EventCard } from './EventCard';
import { OrgEvent } from '../../types/org-event';
import { apiClient } from '../../lib/api-client';

let mockAuthRole = 'SUPER_ADMIN';

vi.mock('../../lib/auth-context', () => ({
  useAuth: () => ({
    role: mockAuthRole,
    user: { id: 'user-1', name: 'Test User', role: mockAuthRole },
    isAuthenticated: true,
  }),
}));

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    updateEventResponse: vi.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

const mockEvent: OrgEvent = {
  id: 'evt-1',
  organizationId: 'org-1',
  title: 'Global Town Hall 2026',
  description: 'Annual gathering and strategy review',
  scheduledAt: '2026-08-30T10:00:00.000Z',
  scheduledEndAt: '2026-08-30T12:00:00.000Z',
  dateIST: '30 Aug 2026',
  timeIST: '03:30 PM',
  endTimeIST: '05:30 PM',
  status: 'UPCOMING',
  createdById: 'admin-1',
  createdByName: 'Marcus Sterling',
  currentUserResponse: null,
  createdAt: '2026-08-24T10:00:00.000Z',
  updatedAt: '2026-08-24T10:00:00.000Z',
};

describe('EventCard — Role-based RSVP controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SUPER_ADMIN: renders event info and DOES NOT render RSVP controls', () => {
    mockAuthRole = 'SUPER_ADMIN';
    render(<EventCard event={mockEvent} />);

    expect(screen.getByText('Global Town Hall 2026')).toBeInTheDocument();
    expect(screen.getByText('Annual gathering and strategy review')).toBeInTheDocument();
    expect(screen.getByText(/30 Aug 2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attending' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maybe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Not Attending' })).not.toBeInTheDocument();
  });

  it('ADMIN: renders event info and DOES NOT render RSVP controls', () => {
    mockAuthRole = 'ADMIN';
    render(<EventCard event={mockEvent} />);

    expect(screen.getByText('Global Town Hall 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attending' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maybe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Not Attending' })).not.toBeInTheDocument();
  });

  it('MEMBER: renders event info AND renders RSVP controls (Attending, Maybe, Not Attending)', async () => {
    mockAuthRole = 'MEMBER';
    render(<EventCard event={mockEvent} />);

    expect(screen.getByText('Global Town Hall 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attending' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maybe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not Attending' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Attending' }));
    await waitFor(() => {
      expect(apiClient.updateEventResponse).toHaveBeenCalledWith('evt-1', 'ATTENDING');
    });
  });

  it('SERVER: renders event info AND renders RSVP controls', () => {
    mockAuthRole = 'SERVER';
    render(<EventCard event={mockEvent} />);

    expect(screen.getByText('Global Town Hall 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attending' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maybe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not Attending' })).toBeInTheDocument();
  });

  it('TEAM_LEAD: renders event info AND renders RSVP controls', () => {
    mockAuthRole = 'TEAM_LEAD';
    render(<EventCard event={mockEvent} />);

    expect(screen.getByText('Global Town Hall 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attending' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maybe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not Attending' })).toBeInTheDocument();
  });
});
