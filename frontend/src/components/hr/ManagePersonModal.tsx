'use client';

import React, { useState } from 'react';
import { User, UserRole, AccountStatus, RoleAuditLog } from '../../types/auth';
import { useAuth } from '../../lib/auth-context';
import { Modal } from '../ui/Modal';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface ManagePersonModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: User | null;
  onSaveRole: (userId: string, newRole: UserRole, reason: string) => void;
  onSaveStatus: (userId: string, newStatus: AccountStatus, reason: string) => void;
  auditLogs?: RoleAuditLog[];
}

export function ManagePersonModal({
  isOpen,
  onClose,
  targetUser,
  onSaveRole,
  onSaveStatus,
  auditLogs = [],
}: ManagePersonModalProps) {
  const { user: currentUser, role: currentCallerRole } = useAuth();

  const [selectedRole, setSelectedRole] = useState<UserRole>(targetUser?.role || 'MEMBER');
  const [roleReason, setRoleReason] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<AccountStatus>(
    targetUser?.accountStatus || 'ACTIVE'
  );
  const [statusReason, setStatusReason] = useState('');
  const [activeTab, setActiveTab] = useState<'role' | 'status' | 'audit'>('role');
  const [isSuccessMessage, setIsSuccessMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (targetUser) {
      setSelectedRole(targetUser.role || 'MEMBER');
      setSelectedStatus(targetUser.accountStatus || 'ACTIVE');
      setRoleReason('');
      setStatusReason('');
      setIsSuccessMessage(null);
    }
  }, [targetUser]);

  if (!targetUser) return null;

  const isSelf = currentUser.id === targetUser.id;
  const isTargetSuperAdmin = targetUser.role === 'SUPER_ADMIN';

  // Role options configuration
  const roleOptions: Array<{ role: UserRole; label: string; desc: string; allowed: boolean; restrictionReason?: string }> = [
    {
      role: 'MEMBER',
      label: 'Member',
      desc: 'Standard personnel task execution & availability',
      allowed: true,
    },
    {
      role: 'TEAM_LEAD',
      label: 'Team Lead',
      desc: 'Team-level coordination and workflow assignment',
      allowed: true,
    },
    {
      role: 'SERVER',
      label: 'Server',
      desc: 'Room/Section supervisor (Room scoped)',
      allowed: true,
    },
    {
      role: 'ADMIN',
      label: 'Admin',
      desc: 'Operational management across all sections',
      allowed: currentCallerRole === 'SUPER_ADMIN',
      restrictionReason: 'Requires Super Admin authority',
    },
    {
      role: 'SUPER_ADMIN',
      label: 'Super Admin',
      desc: 'Highest organizational authority',
      allowed: currentCallerRole === 'SUPER_ADMIN',
      restrictionReason: 'Protected privileged role',
    },
  ];

  const handleRoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSelf) return;
    onSaveRole(targetUser.id, selectedRole, roleReason);
    setIsSuccessMessage(`Role successfully updated to ${selectedRole.replace('_', ' ')}.`);
    setTimeout(() => setIsSuccessMessage(null), 3000);
  };

  const handleStatusSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveStatus(targetUser.id, selectedStatus, statusReason);
    setIsSuccessMessage(`Account status updated to ${selectedStatus}.`);
    setTimeout(() => setIsSuccessMessage(null), 3000);
  };

  const userAuditTrail = auditLogs.filter((l) => l.targetUserId === targetUser.id);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Employee People Management" maxWidth="lg">
      <div className="space-y-5">
        {/* Profile Identity Card */}
        <div className="p-4 bg-surface-container-low border border-surface-outline rounded flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar src={targetUser.avatarUrl} name={targetUser.name} size="md" status={targetUser.status} />
            <div>
              <h3 className="text-sm font-bold text-primary">{targetUser.name}</h3>
              <p className="text-xs text-on-surface-variant font-mono">{targetUser.email}</p>
              <p className="text-[11px] text-on-surface-variant mt-0.5 font-medium">
                {targetUser.title || 'WorkGrid Employee'}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge role={targetUser.role ? targetUser.role.replace('_', ' ') : 'UNASSIGNED'} variant="role" />
            <Badge accountStatus={targetUser.accountStatus || 'ACTIVE'} variant="accountStatus" />
          </div>
        </div>

        {/* Success Alert */}
        {isSuccessMessage && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
            <span>{isSuccessMessage}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-surface-outline">
          <button
            onClick={() => setActiveTab('role')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'role'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Role Assignment
          </button>
          <button
            onClick={() => setActiveTab('status')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'status'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Account Status & Access
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span>Role Audit History</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-surface-container font-mono">
              {userAuditTrail.length}
            </span>
          </button>
        </div>

        {/* TAB 1: Role Assignment */}
        {activeTab === 'role' && (
          <form onSubmit={handleRoleSubmit} className="space-y-4">
            {isSelf && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] text-amber-700 shrink-0">warning</span>
                <span>
                  <strong>Self-role modification is disabled.</strong> Security policy prevents any user from altering their own role through the People Management interface.
                </span>
              </div>
            )}

            {isTargetSuperAdmin && currentCallerRole !== 'SUPER_ADMIN' && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-900 flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] text-rose-700 shrink-0">lock</span>
                <span>
                  <strong>Super Admin account is protected.</strong> Only an active Super Admin can modify privileged Super Admin roles.
                </span>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-primary">
                Select Effective WorkGrid Role
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {roleOptions.map((opt) => {
                  const isDisabled = !opt.allowed || isSelf || (isTargetSuperAdmin && currentCallerRole !== 'SUPER_ADMIN');
                  const isSelected = selectedRole === opt.role;

                  return (
                    <div
                      key={opt.role}
                      onClick={() => !isDisabled && setSelectedRole(opt.role)}
                      className={`p-3 rounded border text-left transition-all ${
                        isDisabled
                          ? 'opacity-50 bg-slate-50 border-slate-200 cursor-not-allowed'
                          : isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary cursor-pointer'
                          : 'border-surface-outline hover:border-outline bg-surface-bright cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-primary">{opt.label}</span>
                        {isDisabled && opt.restrictionReason && (
                          <span className="text-[9px] font-mono uppercase bg-slate-200 px-1 rounded text-slate-700">
                            {opt.restrictionReason}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-on-surface-variant mt-1 leading-snug">
                        {opt.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-primary mb-1">
                Reason for Role Change (Audited)
              </label>
              <input
                type="text"
                value={roleReason}
                onChange={(e) => setRoleReason(e.target.value)}
                placeholder="e.g. Promoted to Team Lead after onboarding review"
                disabled={isSelf || (isTargetSuperAdmin && currentCallerRole !== 'SUPER_ADMIN')}
                className="w-full px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary disabled:opacity-50"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-surface-outline">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={
                  isSelf ||
                  (isTargetSuperAdmin && currentCallerRole !== 'SUPER_ADMIN') ||
                  (selectedRole === targetUser.role && targetUser.accountStatus === 'ACTIVE')
                }
              >
                {targetUser.accountStatus === 'PENDING' || !targetUser.role
                  ? 'Approve & Activate Account'
                  : 'Save Role Assignment'}
              </Button>
            </div>
          </form>
        )}

        {/* TAB 2: Account Status & Access */}
        {activeTab === 'status' && (
          <form onSubmit={handleStatusSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-primary">
                Account Status Lifecycle
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  {
                    status: 'ACTIVE' as const,
                    label: 'ACTIVE',
                    desc: 'Normal authorized access to permitted WorkGrid resources.',
                  },
                  {
                    status: 'PENDING' as const,
                    label: 'PENDING',
                    desc: 'Awaiting onboarding completion and administrative review.',
                  },
                  {
                    status: 'SUSPENDED' as const,
                    label: 'SUSPENDED',
                    desc: 'Temporarily blocked from signing in or executing actions.',
                  },
                  {
                    status: 'DEACTIVATED' as const,
                    label: 'DEACTIVATED',
                    desc: 'Employee offboarded; account permanently inactive.',
                  },
                ].map((item) => {
                  const isSelected = selectedStatus === item.status;
                  const isSelfSuspension = isSelf && item.status !== 'ACTIVE';

                  return (
                    <div
                      key={item.status}
                      onClick={() => !isSelfSuspension && setSelectedStatus(item.status)}
                      className={`p-3 rounded border text-left transition-all ${
                        isSelfSuspension
                          ? 'opacity-50 bg-slate-50 border-slate-200 cursor-not-allowed'
                          : isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary cursor-pointer'
                          : 'border-surface-outline hover:border-outline bg-surface-bright cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-primary">{item.label}</span>
                        <Badge accountStatus={item.status} variant="accountStatus" />
                      </div>
                      <p className="text-[11px] text-on-surface-variant mt-1 leading-snug">
                        {item.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-primary mb-1">
                Reason for Status Change
              </label>
              <input
                type="text"
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="e.g. Completed initial onboarding background review"
                className="w-full px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} size="sm">
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={selectedStatus === (targetUser.accountStatus || 'ACTIVE')}
              >
                Update Account Status
              </Button>
            </div>
          </form>
        )}

        {/* TAB 3: Role Audit History */}
        {activeTab === 'audit' && (
          <div className="space-y-3">
            {userAuditTrail.length === 0 ? (
              <div className="p-8 text-center bg-surface-container-low rounded border border-surface-outline text-on-surface-variant text-xs">
                <span className="material-symbols-outlined text-[32px] text-outline block mb-1">
                  history
                </span>
                No role change audit logs recorded for this employee yet.
              </div>
            ) : (
              <div className="space-y-2">
                {userAuditTrail.map((log, idx) => (
                  <div
                    key={log.id || `audit-${idx}`}
                    className="p-3 bg-surface-bright border border-surface-outline rounded text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-primary">Role Transition:</span>
                        <Badge role={log.previousRole ? log.previousRole.replace('_', ' ') : 'UNASSIGNED'} variant="role" />
                        <span className="material-symbols-outlined text-[14px] text-outline">
                          arrow_forward
                        </span>
                        <Badge role={log.newRole ? log.newRole.replace('_', ' ') : 'MEMBER'} variant="role" />
                      </div>
                      <span className="text-[10px] text-on-surface-variant font-mono">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="text-[11px] text-on-surface-variant">
                      <span className="font-medium text-primary">Changed by:</span>{' '}
                      {log.changedByName} ({log.changedByRole})
                    </div>

                    {log.reason && (
                      <p className="text-[11px] text-on-surface italic bg-surface-container-low p-1.5 rounded">
                        &quot;{log.reason}&quot;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
