'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, getRoleLandingPath } from '../../lib/auth-context';
import { UserRole } from '../../types/auth';
import { apiClient } from '../../lib/api-client';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const { login, setRole } = useAuth();

  const [email, setEmail] = useState('elena.vance@workgrid.corp');
  const [password, setPassword] = useState('password123');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'pending' | 'suspended' | 'deactivated' | 'invalid' | 'generic' | null>(null);

  // Forgot Password State
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<'request' | 'reset' | 'success'>('request');
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please provide a valid corporate email address');
      setErrorType('generic');
      return;
    }

    setIsLoading(true);
    setError(null);
    setErrorType(null);

    try {
      // 1. Authenticate with backend
      const user = await login(email, password);
      setIsLoading(false);

      // 2. Authoritative role-based landing redirection
      const destination = getRoleLandingPath(user.role);
      router.push(destination);
    } catch (err: unknown) {
      setIsLoading(false);
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg);

      if (msg.toLowerCase().includes('pending')) {
        setErrorType('pending');
      } else if (msg.toLowerCase().includes('suspended')) {
        setErrorType('suspended');
      } else if (msg.toLowerCase().includes('deactivated')) {
        setErrorType('deactivated');
      } else if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('unauthorized')) {
        setErrorType('invalid');
      } else {
        setErrorType('generic');
      }
    }
  };

  const handlePrefillAccount = (accountEmail: string) => {
    setEmail(accountEmail);
    setPassword('password123');
    setError(null);
    setErrorType(null);
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;

    try {
      const res = await apiClient.forgotPassword(forgotEmail);
      if (res.resetToken) {
        setResetToken(res.resetToken);
      }
      setForgotStep('reset');
      setForgotMsg(res.message);
    } catch (err: unknown) {
      setForgotMsg(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken || !newPassword) return;

    try {
      const res = await apiClient.resetPassword(resetToken, newPassword);
      setForgotStep('success');
      setForgotMsg(res.message);
    } catch (err: unknown) {
      setForgotMsg(err instanceof Error ? err.message : 'Reset failed');
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
              WorkGrid
            </h1>
            <p className="text-xs text-on-surface-variant text-center mt-1">
              Hierarchical Organizational & Task Operating System
            </p>
          </div>

          {/* Account Status Error Banners */}
          {error && (
            <div className="mb-4">
              {errorType === 'pending' && (
                <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-amber-700">pending_actions</span>
                    <span>Account Pending Onboarding</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    This account is in <span className="font-mono font-bold">PENDING</span> status. Please wait for HR or Super Admin onboarding review.
                  </p>
                </div>
              )}

              {errorType === 'suspended' && (
                <div className="p-3 bg-rose-50 border border-rose-300 text-rose-900 text-xs rounded space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-rose-700">block</span>
                    <span>Account Suspended</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    This account has been <span className="font-mono font-bold">SUSPENDED</span>. Please contact IT Security or HR.
                  </p>
                </div>
              )}

              {errorType === 'deactivated' && (
                <div className="p-3 bg-slate-100 border border-slate-300 text-slate-900 text-xs rounded space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-slate-700">person_off</span>
                    <span>Account Deactivated</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    This account is <span className="font-mono font-bold">DEACTIVATED</span>. Access permanently revoked.
                  </p>
                </div>
              )}

              {errorType === 'invalid' && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  <span>Invalid corporate email or password.</span>
                </div>
              )}

              {errorType === 'generic' && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Real Authentication Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-on-surface uppercase tracking-wider block" htmlFor="email">
                Work Email Address
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
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-on-surface uppercase tracking-wider block" htmlFor="password">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotStep('request');
                    setForgotEmail(email);
                    setForgotMsg(null);
                    setIsForgotModalOpen(true);
                  }}
                  className="text-[11px] text-secondary hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                required
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
              <span>{isLoading ? 'Authenticating...' : 'Sign In to Workspace'}</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </form>

          {/* Development / Demo Quick Logins */}
          <div className="mt-6 pt-4 border-t border-surface-outline">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                Development Preview Logins
              </p>
              <span className="text-[9px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant font-mono">
                Mock / Seed
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => handlePrefillAccount('elena.vance@workgrid.corp')}
                className="p-2 rounded bg-surface-container border border-surface-outline hover:bg-surface-container-high text-primary font-medium text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold block text-[11px]">Super Admin</span>
                  <span className="text-[9px] text-primary-fixed-dim">Auto-fill</span>
                </div>
                <span className="text-[9px] text-on-surface-variant">Elena Vance</span>
              </button>

              <button
                type="button"
                onClick={() => handlePrefillAccount('marcus.sterling@workgrid.corp')}
                className="p-2 rounded bg-surface-container border border-surface-outline hover:bg-surface-container-high text-primary font-medium text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold block text-[11px]">Admin</span>
                  <span className="text-[9px] text-primary-fixed-dim">Auto-fill</span>
                </div>
                <span className="text-[9px] text-on-surface-variant">Marcus Sterling</span>
              </button>

              <button
                type="button"
                onClick={() => handlePrefillAccount('sarah.jenkins@workgrid.corp')}
                className="p-2 rounded bg-surface-container border border-surface-outline hover:bg-surface-container-high text-primary font-medium text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold block text-[11px]">HR People</span>
                  <span className="text-[9px] text-primary-fixed-dim">Auto-fill</span>
                </div>
                <span className="text-[9px] text-on-surface-variant">Sarah Jenkins</span>
              </button>

              <button
                type="button"
                onClick={() => handlePrefillAccount('alex.rivera@workgrid.corp')}
                className="p-2 rounded bg-surface-container border border-surface-outline hover:bg-surface-container-high text-primary font-medium text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold block text-[11px]">Team Lead</span>
                  <span className="text-[9px] text-primary-fixed-dim">Auto-fill</span>
                </div>
                <span className="text-[9px] text-on-surface-variant">Alex Rivera</span>
              </button>

              <button
                type="button"
                onClick={() => handlePrefillAccount('david.chen@workgrid.corp')}
                className="p-2 rounded bg-surface-container border border-surface-outline hover:bg-surface-container-high text-primary font-medium text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold block text-[11px]">Server Lead</span>
                  <span className="text-[9px] text-primary-fixed-dim">Auto-fill</span>
                </div>
                <span className="text-[9px] text-on-surface-variant">David Chen (B)</span>
              </button>

              <button
                type="button"
                onClick={() => handlePrefillAccount('sarah.connor@workgrid.corp')}
                className="p-2 rounded bg-surface-container border border-surface-outline hover:bg-surface-container-high text-primary font-medium text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold block text-[11px]">Member</span>
                  <span className="text-[9px] text-primary-fixed-dim">Auto-fill</span>
                </div>
                <span className="text-[9px] text-on-surface-variant">Sarah Connor (B3)</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Forgot Password Modal */}
      <Modal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        title="Reset Corporate Password"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          {forgotMsg && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-blue-900 leading-relaxed font-medium">
              {forgotMsg}
            </div>
          )}

          {forgotStep === 'request' && (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-3">
              <p className="text-on-surface-variant leading-relaxed">
                Enter your work email address. If an active account exists, a secure single-use reset token will be generated.
              </p>

              <div>
                <label className="block text-xs font-semibold text-primary mb-1">Corporate Email</label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="name@workgrid.corp"
                  className="w-full px-3 py-2 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-surface-outline">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsForgotModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Request Reset Token
                </Button>
              </div>
            </form>
          )}

          {forgotStep === 'reset' && (
            <form onSubmit={handleResetPasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-primary mb-1">Reset Token</label>
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste 64-char reset token"
                  className="w-full px-3 py-2 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-primary mb-1">New Password (Min 6 chars)</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-surface-outline">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsForgotModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Set New Password
                </Button>
              </div>
            </form>
          )}

          {forgotStep === 'success' && (
            <div className="text-center py-4 space-y-3">
              <span className="material-symbols-outlined text-[36px] text-emerald-600">check_circle</span>
              <p className="font-semibold text-primary">Password Successfully Updated</p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setIsForgotModalOpen(false);
                  setPassword(newPassword);
                }}
              >
                Return to Login
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
