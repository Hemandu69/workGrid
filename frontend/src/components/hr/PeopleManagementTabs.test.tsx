import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PeopleManagementTabs } from './PeopleManagementTabs';

let mockPathname = '/hr';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('PeopleManagementTabs — People Directory / Role Audit grouped as one feature', () => {
  it('marks "People Directory" active on /hr', () => {
    mockPathname = '/hr';
    render(<PeopleManagementTabs />);

    const directoryTab = screen.getByRole('link', { name: 'People Directory' });
    const auditTab = screen.getByRole('link', { name: 'Role Audit' });

    expect(directoryTab).toHaveClass('text-primary');
    expect(auditTab).not.toHaveClass('text-primary');
  });

  it('marks "Role Audit" active on /hr/audit', () => {
    mockPathname = '/hr/audit';
    render(<PeopleManagementTabs />);

    const directoryTab = screen.getByRole('link', { name: 'People Directory' });
    const auditTab = screen.getByRole('link', { name: 'Role Audit' });

    expect(auditTab).toHaveClass('text-primary');
    expect(directoryTab).not.toHaveClass('text-primary');
  });

  it('both tabs link to their canonical, unbroken routes', () => {
    mockPathname = '/hr';
    render(<PeopleManagementTabs />);

    expect(screen.getByRole('link', { name: 'People Directory' })).toHaveAttribute('href', '/hr');
    expect(screen.getByRole('link', { name: 'Role Audit' })).toHaveAttribute('href', '/hr/audit');
  });
});
