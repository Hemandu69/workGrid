'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import { apiClient } from '../../lib/api-client';
import { useEmailAvailability } from '../../lib/useEmailAvailability';

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailAvailability = useEmailAvailability(email, email.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (emailAvailability === 'taken') {
      setError('An account with this email already exists.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Register with backend (sets accountStatus = PENDING, role = null)
      await apiClient.register({
        name: name.trim(),
        email: email.trim(),
        password,
        title: title.trim() || undefined,
      });

      // 2. Automatically log in to establish session
      await login(email.trim(), password);

      // 3. Navigate directly to /pending
      router.push('/pending');
    } catch (err: unknown) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : 'Registration failed.');
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen w-full flex flex-col items-center justify-center p-4 selection:bg-primary-fixed selection:text-on-primary-fixed">
      <main className="w-full max-w-[440px]">
        <div className="bg-surface-bright border border-surface-outline p-8 rounded shadow-xs relative">
          {/* Logo & Header */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-primary text-on-primary font-bold text-xl rounded flex items-center justify-center mb-3 shadow-xs">
              WG
            </div>
            <h1 className="text-2xl font-bold text-on-surface text-center tracking-tight">
              Create WorkGrid Account
            </h1>
            <p className="text-xs text-on-surface-variant text-center mt-1">
              Personnel Self-Registration & Onboarding Portal
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{error}</span>
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface uppercase tracking-wider block" htmlFor="name">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rachel Zane"
                className="w-full bg-surface-bright border border-surface-outline rounded px-3 py-2 h-[40px] text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-2 focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface uppercase tracking-wider block" htmlFor="email">
                Corporate Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@workgrid.corp"
                className="w-full bg-surface-bright border border-surface-outline rounded px-3 py-2 h-[40px] text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-2 focus:border-primary transition-colors font-mono"
              />
              {emailAvailability === 'invalid' && (
                <p className="text-[11px] text-rose-600 pt-0.5">Enter a valid email address.</p>
              )}
              {emailAvailability === 'taken' && (
                <p className="text-[11px] text-rose-600 pt-0.5">An account with this email already exists.</p>
              )}
              {emailAvailability === 'available' && (
                <p className="text-[11px] text-emerald-700 pt-0.5">This email is available.</p>
              )}
              {emailAvailability === 'checking' && (
                <p className="text-[11px] text-on-surface-variant pt-0.5">Checking availability...</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface uppercase tracking-wider block" htmlFor="title">
                Job Title / Designation
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Infrastructure Engineer"
                className="w-full bg-surface-bright border border-surface-outline rounded px-3 py-2 h-[40px] text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-2 focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface uppercase tracking-wider block" htmlFor="password">
                Password (Min. 6 Characters) <span className="text-rose-500">*</span>
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface-bright border border-surface-outline rounded px-3 py-2 h-[40px] text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-2 focus:border-primary transition-colors font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-on-primary font-semibold text-xs h-[42px] rounded hover:bg-primary-container transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 mt-2"
            >
              <span>{isLoading ? 'Creating Account...' : 'Complete Self-Registration'}</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </form>

          {/* Link to Login */}
          <div className="mt-6 pt-4 border-t border-surface-outline text-center">
            <p className="text-xs text-on-surface-variant">
              Already have an active account?{' '}
              <Link href="/login" className="text-primary font-semibold hover:underline">
                Sign in here
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
