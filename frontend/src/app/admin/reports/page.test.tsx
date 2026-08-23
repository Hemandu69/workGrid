import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AdminReportsRedirectPage from './page';

vi.mock('../../../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}));

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

let mockRole: string | null = 'SUPER_ADMIN';
let mockIsLoading = false;
vi.mock('../../../lib/auth-context', () => ({
  useAuth: () => ({ role: mockRole, isLoading: mockIsLoading }),
}));

describe('/admin/reports — role-aware redirect stub (Reports & Analytics removed)', () => {
  beforeEach(() => {
    replace.mockClear();
    mockIsLoading = false;
  });

  it('redirects SUPER_ADMIN to /super-admin', async () => {
    mockRole = 'SUPER_ADMIN';
    render(<AdminReportsRedirectPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/super-admin'));
  });

  it('redirects ADMIN to /admin (not /super-admin, which ADMIN cannot access)', async () => {
    mockRole = 'ADMIN';
    render(<AdminReportsRedirectPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'));
  });

  it('does not redirect an unauthorized role and shows Access Restricted instead', async () => {
    mockRole = 'MEMBER';
    render(<AdminReportsRedirectPage />);

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('does not redirect while auth is still loading', () => {
    mockRole = null;
    mockIsLoading = true;
    render(<AdminReportsRedirectPage />);

    expect(screen.getByText('Redirecting…')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
