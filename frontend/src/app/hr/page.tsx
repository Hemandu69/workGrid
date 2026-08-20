'use client';

import React, { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { useAuth } from '../../lib/auth-context';
import { User, UserRole, AccountStatus, RoleAuditLog } from '../../types/auth';
import { MOCK_PEOPLE_DIRECTORY, MOCK_ROLE_AUDIT_LOGS } from '../../lib/mock-data';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Table, TableHeader, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { ManagePersonModal } from '../../components/hr/ManagePersonModal';
import { ProvisionPersonModal } from '../../components/hr/ProvisionPersonModal';

export default function HRDashboardPage() {
  const { user: currentLoggedUser, role: currentLoggedRole } = useAuth();

  const [people, setPeople] = useState<User[]>(MOCK_PEOPLE_DIRECTORY);
  const [auditLogs, setAuditLogs] = useState<RoleAuditLog[]>(MOCK_ROLE_AUDIT_LOGS);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false);

  // Computed metric counts
  const totalEmployees = people.length;
  const activeCount = people.filter((u) => (u.accountStatus || 'ACTIVE') === 'ACTIVE').length;
  const pendingCount = people.filter((u) => u.accountStatus === 'PENDING').length;
  const suspendedCount = people.filter((u) => u.accountStatus === 'SUSPENDED').length;
  const deactivatedCount = people.filter((u) => u.accountStatus === 'DEACTIVATED').length;

  // Filtered people
  const filtered = people.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.title && u.title.toLowerCase().includes(search.toLowerCase()));

    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    const currentStatus = u.accountStatus || 'ACTIVE';
    const matchesStatus = statusFilter === 'ALL' || currentStatus === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleSaveRole = (userId: string, newRole: UserRole, reason: string) => {
    const target = people.find((u) => u.id === userId);
    if (!target) return;

    const oldRole = target.role;
    if (oldRole === newRole) return;

    const newAudit: RoleAuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      targetUserId: target.id,
      targetUserName: target.name,
      targetUserEmail: target.email,
      targetUserAvatar: target.avatarUrl,
      changedById: currentLoggedUser.id,
      changedByName: currentLoggedUser.name,
      changedByRole: currentLoggedRole,
      previousRole: oldRole,
      newRole: newRole,
      reason: reason || 'Role updated via People Management',
      createdAt: new Date().toISOString(),
    };

    setAuditLogs((prevLogs) => [newAudit, ...prevLogs]);
    setPeople((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );

    if (selectedUser && selectedUser.id === userId) {
      setSelectedUser((prev) => (prev ? { ...prev, role: newRole } : null));
    }
  };

  const handleSaveStatus = (userId: string, newStatus: AccountStatus) => {
    setPeople((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, accountStatus: newStatus } : u))
    );

    if (selectedUser && selectedUser.id === userId) {
      setSelectedUser((prev) => (prev ? { ...prev, accountStatus: newStatus } : null));
    }
  };

  const handleProvision = (data: {
    name: string;
    email: string;
    title: string;
    role: UserRole;
    capacityLimitHours: number;
  }) => {
    const newUser: User = {
      id: `usr-${Date.now()}`,
      name: data.name,
      email: data.email,
      title: data.title,
      role: data.role,
      accountStatus: 'PENDING',
      status: 'OFFLINE',
      capacityLimitHours: data.capacityLimitHours,
      currentAllocatedHours: 0,
      createdAt: new Date().toISOString(),
    };
    setPeople((prev) => [newUser, ...prev]);
  };

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'HR & People Operations', href: '/hr' },
        { label: 'Personnel & Role Governance' },
      ]}
      onQuickAction={() => setIsProvisionModalOpen(true)}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-surface-outline pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-primary tracking-tight">
                People Management & Role Governance
              </h1>
              <Badge role="HR Operations" variant="role" />
            </div>
            <p className="text-xs text-on-surface-variant mt-1">
              Authoritative personnel directory for onboarding, account lifecycle states, and backend-enforced role assignments.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsProvisionModalOpen(true)}
              className="flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">person_add</span>
              <span>Onboard Employee</span>
            </Button>
          </div>
        </div>

        {/* Executive Metric Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded border border-surface-outline bg-surface-bright shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total Headcount</span>
              <span className="material-symbols-outlined text-[18px] text-primary">groups</span>
            </div>
            <p className="text-2xl font-bold text-primary font-mono tabular-nums">{totalEmployees}</p>
            <p className="text-[10px] text-on-surface-variant mt-1">Organizational roster</p>
          </div>

          <div className="p-4 rounded border border-surface-outline bg-surface-bright shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">Active Personnel</span>
              <span className="material-symbols-outlined text-[18px] text-emerald-600">verified_user</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">{activeCount}</p>
            <p className="text-[10px] text-emerald-800 mt-1">Authorized access</p>
          </div>

          <div className="p-4 rounded border border-surface-outline bg-surface-bright shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Pending Review</span>
              <span className="material-symbols-outlined text-[18px] text-amber-600">pending_actions</span>
            </div>
            <p className="text-2xl font-bold text-amber-700 font-mono tabular-nums">{pendingCount}</p>
            <p className="text-[10px] text-amber-800 mt-1">Awaiting role assignment</p>
          </div>

          <div className="p-4 rounded border border-surface-outline bg-surface-bright shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">Restricted / Suspended</span>
              <span className="material-symbols-outlined text-[18px] text-rose-600">block</span>
            </div>
            <p className="text-2xl font-bold text-rose-700 font-mono tabular-nums">{suspendedCount + deactivatedCount}</p>
            <p className="text-[10px] text-rose-800 mt-1">Blocked or deactivated</p>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="p-3 bg-surface-bright border border-surface-outline rounded flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex-1 relative">
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-on-surface-variant text-[16px] pointer-events-none">
              search
            </span>
            <input
              type="text"
              placeholder="Search by name, email, or job title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin</option>
              <option value="HR">HR</option>
              <option value="TEAM_LEAD">Team Lead</option>
              <option value="SERVER">Server</option>
              <option value="MEMBER">Member</option>
            </select>

            {/* Account Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Account Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending Review</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="DEACTIVATED">Deactivated</option>
            </select>

            <span className="text-xs font-mono text-on-surface-variant tabular-nums ml-2">
              {filtered.length} records
            </span>
          </div>
        </div>

        {/* People Directory Table */}
        <Table>
          <TableHeader>
            <TableRow isHeader>
              <TableHead>Employee Profile</TableHead>
              <TableHead>Job Title</TableHead>
              <TableHead>WorkGrid Role</TableHead>
              <TableHead>Account Status</TableHead>
              <TableHead>Onboarded Date</TableHead>
              <TableHead className="text-right">Governance Actions</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-on-surface-variant text-xs">
                  No personnel matching the current search and filter criteria.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar src={user.avatarUrl} name={user.name} size="sm" status={user.status} />
                      <div>
                        <span className="font-semibold text-primary block leading-tight">{user.name}</span>
                        <span className="text-[10px] text-on-surface-variant font-mono">{user.email}</span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-xs text-on-surface font-medium">
                    {user.title || 'WorkGrid Employee'}
                  </TableCell>

                  <TableCell>
                    <Badge role={user.role.replace('_', ' ')} variant="role" />
                  </TableCell>

                  <TableCell>
                    <Badge accountStatus={user.accountStatus || 'ACTIVE'} variant="accountStatus" />
                  </TableCell>

                  <TableCell className="font-mono text-xs text-on-surface-variant">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Active'}
                  </TableCell>

                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(user);
                        setIsManageModalOpen(true);
                      }}
                      className="text-xs py-1"
                    >
                      <span className="material-symbols-outlined text-[15px] mr-1">manage_accounts</span>
                      Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </tbody>
        </Table>

        {/* Modal: Manage Person & Role Assignment */}
        <ManagePersonModal
          isOpen={isManageModalOpen}
          onClose={() => setIsManageModalOpen(false)}
          targetUser={selectedUser}
          onSaveRole={handleSaveRole}
          onSaveStatus={handleSaveStatus}
          auditLogs={auditLogs}
        />

        {/* Modal: Onboard / Provision Employee */}
        <ProvisionPersonModal
          isOpen={isProvisionModalOpen}
          onClose={() => setIsProvisionModalOpen(false)}
          onProvision={handleProvision}
        />
      </div>
    </AppShell>
  );
}
