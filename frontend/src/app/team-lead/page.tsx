'use client';

import React, { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { Table, TableHeader, TableRow, TableHead, TableCell } from '../../components/ui/Table';
import { MOCK_USERS, MOCK_TASKS } from '../../lib/mock-data';
import { AttendanceCard } from '../../components/attendance/AttendanceCard';

export default function TeamLeadPage() {
  const [tasks] = useState(MOCK_TASKS);

  const teamMembers = [
    MOCK_USERS.member,
    {
      id: 'usr-dev-2',
      name: 'Jordan Mitchell',
      email: 'jordan.m@workgrid.corp',
      role: 'MEMBER' as const,
      title: 'Fullstack Engineer',
      status: 'ONLINE' as const,
      capacityLimitHours: 40,
      currentAllocatedHours: 32,
      room: 'Room B',
      subroom: 'B3',
    },
    {
      id: 'usr-dev-3',
      name: 'Rachel Zane',
      email: 'rachel.z@workgrid.corp',
      role: 'MEMBER' as const,
      title: 'UI/UX Developer',
      status: 'BUSY' as const,
      capacityLimitHours: 35,
      currentAllocatedHours: 30,
      room: 'Room B',
      subroom: 'B4',
    },
  ];

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'Team Lead Workspace' },
      ]}
    >
      <div className="space-y-6">
        {/* Global Attendance IN / OUT Tracker */}
        <AttendanceCard />

        {/* Header */}
        <div className="border-b border-surface-outline pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-primary tracking-tight">
                Team Lead Coordination Hub
              </h1>
              <Badge role="Team Lead" variant="role" />
            </div>
            <p className="text-xs text-on-surface-variant mt-1">
              Dedicated squad operational workspace for workload tracking, sprint deliverables, and capacity management.
            </p>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded border border-surface-outline bg-surface-bright shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Direct Squad</span>
              <span className="material-symbols-outlined text-[18px] text-primary">groups</span>
            </div>
            <p className="text-2xl font-bold text-primary font-mono tabular-nums">{teamMembers.length}</p>
            <p className="text-[10px] text-on-surface-variant mt-1">Active engineers</p>
          </div>

          <div className="p-4 rounded border border-surface-outline bg-surface-bright shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-800">Sprint Tasks</span>
              <span className="material-symbols-outlined text-[18px] text-blue-600">assignment</span>
            </div>
            <p className="text-2xl font-bold text-blue-700 font-mono tabular-nums">{tasks.length}</p>
            <p className="text-[10px] text-blue-800 mt-1">In progress & pending</p>
          </div>

          <div className="p-4 rounded border border-surface-outline bg-surface-bright shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">Capacity Utilization</span>
              <span className="material-symbols-outlined text-[18px] text-emerald-600">battery_charging_full</span>
            </div>
            <p className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">82%</p>
            <p className="text-[10px] text-emerald-800 mt-1">Optimal workload range</p>
          </div>

          <div className="p-4 rounded border border-surface-outline bg-surface-bright shadow-xs">
            <div className="flex items-center justify-between text-on-surface-variant mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-800">Squad Velocity</span>
              <span className="material-symbols-outlined text-[18px] text-purple-600">speed</span>
            </div>
            <p className="text-2xl font-bold text-purple-700 font-mono tabular-nums">94 hrs</p>
            <p className="text-[10px] text-purple-800 mt-1">Completed this cycle</p>
          </div>
        </div>

        {/* Squad Members Directory */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-primary">Squad Members & Weekly Allocation</h2>
          </div>

          <Table>
            <TableHeader>
              <TableRow isHeader>
                <TableHead>Engineer</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Room / Subroom</TableHead>
                <TableHead>Allocated Hours</TableHead>
                <TableHead>Weekly Limit</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <tbody>
              {teamMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar src={member.avatarUrl} name={member.name} size="sm" status={member.status} />
                      <div>
                        <span className="font-semibold text-primary block leading-tight">{member.name}</span>
                        <span className="text-[10px] text-on-surface-variant font-mono">{member.email}</span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="text-xs text-on-surface">{member.title}</TableCell>

                  <TableCell className="font-mono text-xs text-on-surface-variant">
                    {member.room} / {member.subroom}
                  </TableCell>

                  <TableCell className="font-mono text-xs text-on-surface font-semibold">
                    {member.currentAllocatedHours} hrs
                  </TableCell>

                  <TableCell className="font-mono text-xs text-on-surface-variant">
                    {member.capacityLimitHours} hrs
                  </TableCell>

                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" className="text-xs py-1">
                      Assign Task
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </AppShell>
  );
}
