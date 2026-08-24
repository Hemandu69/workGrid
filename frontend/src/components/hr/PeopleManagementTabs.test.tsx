import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeopleManagementTabs } from './PeopleManagementTabs';

let mockPathname = '/admin/people';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('PeopleManagementTabs — People Directory / Role Audit grouped as one feature', () => {
  it('marks "People Directory" active on /admin/people', () => {
    mockPathname = '/admin/people';
    render(<PeopleManagementTabs />);

    const directoryTab = screen.getByRole('link', { name: 'People Directory' });
    const auditTab = screen.getByRole('link', { name: 'Role Audit' });

    expect(directoryTab).toHaveClass('text-primary');
    expect(auditTab).not.toHaveClass('text-primary');
  });

  it('marks "Role Audit" active on /admin/people/audit', () => {
    mockPathname = '/admin/people/audit';
    render(<PeopleManagementTabs />);

    const directoryTab = screen.getByRole('link', { name: 'People Directory' });
    const auditTab = screen.getByRole('link', { name: 'Role Audit' });

    expect(auditTab).toHaveClass('text-primary');
    expect(directoryTab).not.toHaveClass('text-primary');
  });

  it('both tabs link to their canonical, unbroken routes', () => {
    mockPathname = '/admin/people';
    render(<PeopleManagementTabs />);

    expect(screen.getByRole('link', { name: 'People Directory' })).toHaveAttribute('href', '/admin/people');
    expect(screen.getByRole('link', { name: 'Role Audit' })).toHaveAttribute('href', '/admin/people/audit');
  });
});
