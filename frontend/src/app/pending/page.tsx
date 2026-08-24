'use client';

import React, { useState } from 'react';
import { useAuth, getRoleLandingPath } from '../../lib/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '../../components/ui/Button';

export default function PendingApprovalPage() {
  const { user, refreshUser, logout } = useAuth();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleCheckStatus = async () => {
    setIsChecking(true);
    setMessage(null);
    try {
      const updatedUser = await refreshUser();
      if (updatedUser && updatedUser.accountStatus === 'ACTIVE' && updatedUser.role) {
        setMessage(`Account approved! Redirecting to ${updatedUser.role.replace('_', ' ')} workspace...`);
        const target = getRoleLandingPath(updatedUser.role, updatedUser.accountStatus);
        setTimeout(() => router.push(target), 800);
      } else {
        setMessage('Your account is still in PENDING status awaiting Super Admin approval.');
      }
    } catch {
      setMessage('Failed to check status. Please try again.');
    } finally {
      setIsChecking(false);
    }
  };

  const formattedDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Today';

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 selection:bg-primary-fixed selection:text-on-primary-fixed">
      <main className="w-full max-w-[500px] space-y-4">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-primary text-on-primary font-bold text-lg rounded flex items-center justify-center mb-2 shadow-xs">
            WG
          </div>
          <h1 className="text-xl font-bold text-on-surface tracking-tight">
            WorkGrid Workspace
          </h1>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Event Operations & Tracking System
          </p>
        </div>

        {/* Main Status Card */}
        <div className="bg-surface-bright border border-surface-outline rounded p-6 shadow-xs space-y-5">
          {/* Status Alert Banner */}
          <div className="p-3.5 bg-amber-50 border border-amber-300 rounded flex items-start gap-3 text-amber-950">
            <span className="material-symbols-outlined text-[22px] text-amber-700 shrink-0 mt-0.5">
              pending_actions
            </span>
            <div className="space-y-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Account Awaiting Approval
              </h2>
              <p className="text-[11px] leading-relaxed text-amber-800">
                Your WorkGrid account has been successfully created. A Super Admin will review your profile, assign your organizational role, and activate your access.
              </p>
            </div>
          </div>

          {/* User Safe Profile Details */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-surface-outline pb-2">
              <span className="text-xs font-bold text-primary uppercase tracking-wider">
                Applicant Information
              </span>
              <span className="text-[10px] text-on-surface-variant font-mono">
                Submitted: {formattedDate}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded bg-surface-container border border-surface-outline">
                <span className="text-[10px] text-on-surface-variant uppercase font-semibold block mb-0.5">
                  Full Name
                </span>
                <span className="font-semibold text-on-surface truncate block">
                  {user.name || 'New Personnel'}
                </span>
              </div>

              <div className="p-2.5 rounded bg-surface-container border border-surface-outline">
                <span className="text-[10px] text-on-surface-variant uppercase font-semibold block mb-0.5">
                  Corporate Email
                </span>
                <span className="font-mono text-on-surface truncate block text-[11px]">
                  {user.email}
                </span>
              </div>

              <div className="p-2.5 rounded bg-surface-container border border-surface-outline">
                <span className="text-[10px] text-on-surface-variant uppercase font-semibold block mb-0.5">
                  Designation / Title
                </span>
                <span className="text-on-surface truncate block">
                  {user.title || 'New Personnel'}
                </span>
              </div>

              <div className="p-2.5 rounded bg-surface-container border border-surface-outline">
                <span className="text-[10px] text-on-surface-variant uppercase font-semibold block mb-0.5">
                  Account Status
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="font-semibold text-amber-700 text-[11px]">
                    Pending Review
                  </span>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded bg-surface-container border border-surface-outline flex items-center justify-between">
              <div>
                <span className="text-[10px] text-on-surface-variant uppercase font-semibold block">
                  Assigned Workspace Role
                </span>
                <span className="text-xs text-on-surface-variant">
                  Role assignment will be performed by People Management
                </span>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-semibold">
                UNASSIGNED
              </span>
            </div>
          </div>

          {/* Status Message Feedback */}
          {message && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900 leading-relaxed font-medium">
              {message}
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 border-t border-surface-outline flex items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="text-xs text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-[16px] mr-1">logout</span>
              Sign Out
            </Button>

            <Button
              variant="primary"
              size="sm"
              disabled={isChecking}
              onClick={handleCheckStatus}
              className="text-xs"
            >
              <span className="material-symbols-outlined text-[16px] mr-1">
                {isChecking ? 'progress_activity' : 'refresh'}
              </span>
              {isChecking ? 'Checking...' : 'Check Approval Status'}
            </Button>
          </div>
        </div>

        {/* Informational Help Footer */}
        <p className="text-[11px] text-center text-on-surface-variant">
          Need immediate access? Contact your Super Admin or IT Administrator.
        </p>
      </main>
    </div>
  );
}
