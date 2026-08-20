'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { MOCK_USERS } from '../../lib/mock-data';
import { UserRole } from '../../types/auth';

export default function LoginPage() {
  const router = useRouter();
  const { login, setRole } = useAuth();
  const [email, setEmail] = useState('elena.vance@workgrid.corp');
  const [password, setPassword] = useState('••••••••');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please provide a valid email address');
      return;
    }

    setIsLoading(true);
    setError(null);

    setTimeout(() => {
      login(email);
      setIsLoading(false);
      router.push('/');
    }, 400);
  };

  const handleQuickRoleLogin = (role: UserRole) => {
    setRole(role);
    switch (role) {
      case 'SUPER_ADMIN':
        login(MOCK_USERS.superAdmin.email);
        router.push('/super-admin');
        break;
      case 'ADMIN':
        login(MOCK_USERS.admin.email);
        router.push('/admin');
        break;
      case 'SERVER':
        login(MOCK_USERS.server.email);
        router.push('/server');
        break;
      case 'MEMBER':
        login(MOCK_USERS.member.email);
        router.push('/member');
        break;
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen w-full flex flex-col items-center justify-center p-4 selection:bg-primary-fixed selection:text-on-primary-fixed">
      <main className="w-full max-w-[420px]">
        <div className="bg-surface-bright border border-surface-outline p-8 rounded shadow-xs relative">
          {/* Logo & Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 bg-primary text-on-primary font-bold text-xl rounded flex items-center justify-center mb-3 shadow-xs">
              WG
            </div>
            <h1 className="text-2xl font-bold text-on-surface text-center tracking-tight">
              WorkGrid
            </h1>
            <p className="text-xs text-on-surface-variant text-center mt-1">
              Hierarchical Operational Control Center
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded">
              {error}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface uppercase tracking-wider block" htmlFor="email">
                Corporate Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@workgrid.corp"
                className="w-full bg-surface-bright border border-surface-outline rounded px-3 py-2 h-[42px] text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-2 focus:border-primary transition-colors font-mono"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-on-surface uppercase tracking-wider block" htmlFor="password">
                  Password
                </label>
                <a href="#" className="text-xs text-secondary hover:underline">
                  Forgot password?
                </a>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface-bright border border-surface-outline rounded px-3 py-2 h-[42px] text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-2 focus:border-primary transition-colors font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-on-primary font-medium text-xs h-[42px] rounded hover:bg-primary-container transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            >
              <span>{isLoading ? 'Authenticating...' : 'Sign In to Workspace'}</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </form>

          {/* Demo Quick Logins for Testing Roles */}
          <div className="mt-6 pt-5 border-t border-surface-outline">
            <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider text-center mb-2.5">
              Quick Role Preview
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickRoleLogin('SUPER_ADMIN')}
                className="p-2 rounded bg-surface-container border border-surface-outline hover:bg-surface-container-high text-primary font-medium text-left transition-colors"
              >
                <span className="font-semibold block text-[11px]">Super Admin</span>
                <span className="text-[10px] text-on-surface-variant">Elena Vance</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickRoleLogin('ADMIN')}
                className="p-2 rounded bg-surface-container border border-surface-outline hover:bg-surface-container-high text-primary font-medium text-left transition-colors"
              >
                <span className="font-semibold block text-[11px]">Admin</span>
                <span className="text-[10px] text-on-surface-variant">Marcus Sterling</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickRoleLogin('SERVER')}
                className="p-2 rounded bg-surface-container border border-surface-outline hover:bg-surface-container-high text-primary font-medium text-left transition-colors"
              >
                <span className="font-semibold block text-[11px]">Server / Lead</span>
                <span className="text-[10px] text-on-surface-variant">David Chen (B)</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickRoleLogin('MEMBER')}
                className="p-2 rounded bg-surface-container border border-surface-outline hover:bg-surface-container-high text-primary font-medium text-left transition-colors"
              >
                <span className="font-semibold block text-[11px]">Member</span>
                <span className="text-[10px] text-on-surface-variant">Sarah Connor (B3)</span>
              </button>
            </div>
          </div>

          <div className="mt-6 text-center text-[11px] text-on-surface-variant">
            Authorized personnel only. Contact IT for access.
          </div>
        </div>
      </main>
    </div>
  );
}
