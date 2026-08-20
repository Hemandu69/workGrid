'use client';

import React, { useState } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { MOCK_ROOM_B_MEMBERS, MOCK_USERS } from '../../../lib/mock-data';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Table, TableHeader, TableRow, TableHead, TableCell } from '../../../components/ui/Table';

export default function AdminTeamsPage() {
  const allUsers = [
    MOCK_USERS.superAdmin,
    MOCK_USERS.admin,
    MOCK_USERS.server,
    ...MOCK_ROOM_B_MEMBERS,
  ];

  const [search, setSearch] = useState('');

  const filtered = allUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.room && u.room.toLowerCase().includes(search.toLowerCase())) ||
      (u.subroom && u.subroom.toLowerCase().includes(search.toLowerCase()))
  );

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
              Personnel & Sector Membership Directory
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              Global directory of administrators, servers, and members across the 2,000-user hierarchy.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 bg-surface-bright border border-surface-outline rounded flex items-center justify-between">
          <input
            type="text"
            placeholder="Search personnel by name, email, sector, subroom..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72 px-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
          />
          <span className="text-xs font-mono text-on-surface-variant tabular-nums">
            {filtered.length} Active Records Listed
          </span>
        </div>

        {/* Directory Table */}
        <Table>
          <TableHeader>
            <TableRow isHeader>
              <TableHead>User / Member</TableHead>
              <TableHead>System Role</TableHead>
              <TableHead>Assigned Sector / Subroom</TableHead>
              <TableHead>Presence Status</TableHead>
              <TableHead>Allocated Workload</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {filtered.map((user) => (
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
                  <Badge role={user.role.replace('_', ' ')} variant="role" />
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-on-surface-variant font-medium">
                    {user.subroom ? `${user.subroom} (${user.room})` : user.room || 'Global Organization'}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge status={user.status === 'ONLINE' ? 'AVAILABLE' : user.status === 'BUSY' ? 'BUSY' : 'UNAVAILABLE'}>
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs tabular-nums text-primary font-semibold">
                  {user.currentAllocatedHours} / {user.capacityLimitHours}h
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </div>
    </AppShell>
  );
}
