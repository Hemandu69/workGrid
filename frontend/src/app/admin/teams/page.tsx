'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Table, TableHeader, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { User } from '../../../types/auth';
import { apiClient } from '../../../lib/api-client';
import { useDomainEvent } from '../../../lib/realtime-context';

export default function AdminTeamsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.getUsers({ search: search.trim() || undefined });
      if (Array.isArray(data)) {
        setUsers(data);
      }
    } catch {
      // Clean fallback
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useDomainEvent(['EMPLOYEE_REGISTERED', 'EMPLOYEE_APPROVED', 'ROLE_CHANGED', 'EMPLOYEE_UPDATED', 'ACCOUNT_STATUS_CHANGED'], () => {
    fetchUsers();
  });

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Admin Operations', href: '/admin' },
        { label: 'Personnel & Teams Directory' },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-surface-outline pb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary tracking-tight">
              Personnel & Section Membership Directory
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Global directory of administrators, servers, and members across the hierarchy.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 bg-surface-bright border border-surface-outline rounded flex items-center justify-between">
          <input
            type="text"
            placeholder="Search personnel by name, email, section, subroom..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72 px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
          />
          <span className="text-xs font-mono text-on-surface-variant tabular-nums">
            {users.length} Active Records Listed
          </span>
        </div>

        {/* Directory Table */}
        <Table>
          <TableHeader>
            <TableRow isHeader>
              <TableHead>User / Member</TableHead>
              <TableHead>System Role</TableHead>
              <TableHead>Assigned Section / Subroom</TableHead>
              <TableHead>Presence Status</TableHead>
              <TableHead>Allocated Workload</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-xs text-on-surface-variant">
                  Loading personnel directory...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-xs text-on-surface-variant">
                  No personnel records found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar src={user.avatarUrl} name={user.name} size="sm" status={user.status} />
                      <div>
                        <span className="font-semibold text-primary block">{user.name}</span>
                        <span className="text-[10px] text-on-surface-variant font-mono">{user.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge role={user.role ? user.role.replace('_', ' ') : 'UNASSIGNED'} variant="role" />
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-on-surface-variant font-medium">
                      {user.subroom ? `${user.subroom} (${user.room})` : user.room || 'Global Organization'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge status={user.status === 'ONLINE' ? 'AVAILABLE' : user.status === 'BUSY' ? 'BUSY' : 'UNAVAILABLE'}>
                      {user.status || 'OFFLINE'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-primary font-semibold">
                    {user.currentAllocatedHours ?? 0} / {user.capacityLimitHours ?? 40}h
                  </TableCell>
                </TableRow>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </AppShell>
  );
}
