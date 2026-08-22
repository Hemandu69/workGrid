import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AnnouncementCard } from './AnnouncementCard';
import { Announcement } from '../../types/announcement';

const ANNOUNCEMENT: Announcement = {
  id: 'ann-1',
  title: 'Office maintenance',
  content: 'Scheduled downtime this weekend.',
  status: 'PUBLISHED',
  scope: 'GLOBAL',
  authorName: 'Elena Vance',
  authorRole: 'SUPER ADMIN',
  createdAt: new Date().toISOString(),
  pinned: false,
};

describe('AnnouncementCard — management controls', () => {
  it('renders no action buttons when canManage is false (default, read-only surfaces)', () => {
    render(<AnnouncementCard announcement={ANNOUNCEMENT} />);
    expect(screen.queryByTitle('Edit announcement')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete announcement')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Pin announcement')).not.toBeInTheDocument();
  });

  it('renders action buttons when canManage is true', () => {
    render(<AnnouncementCard announcement={ANNOUNCEMENT} canManage />);
    expect(screen.getByTitle('Edit announcement')).toBeInTheDocument();
    expect(screen.getByTitle('Delete announcement')).toBeInTheDocument();
    expect(screen.getByTitle('Pin announcement')).toBeInTheDocument();
  });

  it('calls onEdit with the announcement when the edit button is clicked', () => {
    const onEdit = vi.fn();
    render(<AnnouncementCard announcement={ANNOUNCEMENT} canManage onEdit={onEdit} />);
    fireEvent.click(screen.getByTitle('Edit announcement'));
    expect(onEdit).toHaveBeenCalledWith(ANNOUNCEMENT);
  });

  it('delete requires two clicks: first shows a confirm state, second calls onDelete', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<AnnouncementCard announcement={ANNOUNCEMENT} canManage onDelete={onDelete} />);

    fireEvent.click(screen.getByTitle('Delete announcement'));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Confirm')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm'));
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(ANNOUNCEMENT);
  });

  it('canceling the delete confirmation does not call onDelete', () => {
    const onDelete = vi.fn();
    render(<AnnouncementCard announcement={ANNOUNCEMENT} canManage onDelete={onDelete} />);

    fireEvent.click(screen.getByTitle('Delete announcement'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByTitle('Delete announcement')).toBeInTheDocument();
  });

  it('calls onTogglePin when the pin button is clicked', async () => {
    const onTogglePin = vi.fn().mockResolvedValue(undefined);
    render(<AnnouncementCard announcement={ANNOUNCEMENT} canManage onTogglePin={onTogglePin} />);
    await act(async () => {
      fireEvent.click(screen.getByTitle('Pin announcement'));
    });
    expect(onTogglePin).toHaveBeenCalledWith(ANNOUNCEMENT);
  });
});
