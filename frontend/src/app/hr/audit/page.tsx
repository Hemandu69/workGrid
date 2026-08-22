'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { RoleAuditLog } from '../../../types/auth';
import { apiClient } from '../../../lib/api-client';
import { useHREvents, HREvent } from '../../../lib/useHREvents';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { Table, TableHeader, TableRow, TableHead, TableCell } from '../../../components/ui/Table';

export default function HRAuditPage() {
  const [search, setSearch] = useState('');
  const [logs, setLogs] = useState<RoleAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      // The endpoint is cursor-paginated server-side to keep each request
      // bounded; this page still shows the full searchable history, so pages
      // are transparently accumulated here rather than exposing pagination
      // controls the design doesn't currently have.
      const accumulated: RoleAuditLog[] = [];
      let cursor: string | undefined;
      for (;;) {
        const page = await apiClient.getRoleAuditLogs(undefined, cursor);
        accumulated.push(...page.items);
        if (!page.hasMore || !page.nextCursor) break;
        cursor = page.nextCursor;
      }
      setLogs(accumulated);
    } catch {
      // Handled
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Realtime Audit Updates
  const handleRealtimeEvent = useCallback((event: HREvent) => {
    if (event.audit) {
      setLogs((prev) => {
        const exists = prev.some((l) => l.id === event.audit?.id);
        if (exists) return prev;
        return [event.audit!, ...prev];
      });
    }
  }, []);

  useHREvents({
    onEvent: handleRealtimeEvent,
    onReconnect: fetchLogs,
    enabled: true,
  });

  const filtered = logs.filter(
    (l) =>
      (l.targetUserName || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.targetUserEmail || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.changedByName || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.reason && l.reason.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <AppShell
      breadcrumbs={[
        { label: 'WorkGrid', href: '/' },
        { label: 'HR & People Operations', href: '/hr' },
        { label: 'Role Governance Audit Trail' },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-surface-outline pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-primary tracking-tight">
                Role Assignment Governance Audit Trail
              </h1>
              <Badge role="Compliance & Security" variant="role" />
            </div>
            <p className="text-xs text-on-surface-variant mt-1">
              Complete chronological audit history of all employee role promotions, demotions, and assignments.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 bg-surface-bright border border-surface-outline rounded flex items-center justify-between">
          <div className="flex-1 max-w-md relative">
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-on-surface-variant text-[16px] pointer-events-none">
              search
            </span>
            <input
              type="text"
              placeholder="Search audit trail by employee, actor, or reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-surface-container-low border border-surface-outline rounded text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
            />
          </div>

          <span className="text-xs font-mono text-on-surface-variant tabular-nums">
            {filtered.length} Audit Entries Logged
          </span>
        </div>

        {/* Audit Log Table */}
        <Table>
          <TableHeader>
            <TableRow isHeader>
              <TableHead>Timestamp</TableHead>
              <TableHead>Target Employee</TableHead>
              <TableHead>Role Transition</TableHead>
              <TableHead>Authorized By</TableHead>
              <TableHead>Reason / Notes</TableHead>
            </TableRow>
          </TableHeader>
          <tbody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-on-surface-variant text-xs">
                  {isLoading ? 'Loading role governance audit history...' : 'No role transition logs found matching the search criteria.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((log, idx) => (
                <TableRow key={log.id || `audit-${idx}`}>
                  <TableCell className="font-mono text-xs text-on-surface-variant whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar src={log.targetUserAvatar} name={log.targetUserName} size="sm" />
                      <div>
                        <span className="font-semibold text-primary block leading-tight">
                          {log.targetUserName}
                        </span>
                        <span className="text-[10px] text-on-surface-variant font-mono">
                          {log.targetUserEmail}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        role={log.previousRole ? log.previousRole.replace('_', ' ') : 'UNASSIGNED'}
                        variant="role"
                      />
                      <span className="material-symbols-outlined text-[14px] text-outline">
                        arrow_forward
                      </span>
                      <Badge
                        role={log.newRole ? log.newRole.replace('_', ' ') : 'UNASSIGNED'}
                        variant="role"
                      />
                    </div>
                  </TableCell>

                  <TableCell>
                    <div>
                      <span className="font-semibold text-primary text-xs block">{log.changedByName}</span>
                      <span className="text-[10px] text-on-surface-variant uppercase font-mono font-medium">
                        {log.changedByRole}
                      </span>
                    </div>
                  </TableCell>

                  <TableCell className="text-xs text-on-surface italic max-w-xs truncate">
                    {log.reason ? `"${log.reason}"` : <span className="text-outline">No reason provided</span>}
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
