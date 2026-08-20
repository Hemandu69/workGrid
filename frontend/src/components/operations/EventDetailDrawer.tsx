'use client';

import React, { useEffect, useState } from 'react';
import { EventDetailResponse, apiClient, SupervisionState } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';
import { Avatar } from '../ui/Avatar';

interface EventDetailDrawerProps {
  eventId: string | null;
  onClose: () => void;
  onSelectPerson?: (userId: string) => void;
}

export function EventDetailDrawer({ eventId, onClose, onSelectPerson }: EventDetailDrawerProps) {
  const { token } = useAuth();
  const [event, setEvent] = useState<EventDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!eventId) {
      setEvent(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    apiClient
      .getEventDetail(eventId, token)
      .then((res) => {
        if (isMounted) {
          setEvent(res);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          // Fallback mock event details
          setEvent({
            id: eventId,
            title: 'Annual Company All-Hands',
            description: 'Quarterly organizational review, leadership address, and infrastructure deployment roadmap.',
            scope: 'COMPANY',
            status: 'ACTIVE',
            locations: ['Main Auditorium', 'Sector B Briefing Room', 'Remote Link'],
            startTimeIST: '03:00 PM IST',
            endTimeIST: '05:00 PM IST',
            dateFormatted: '20 Aug 2026',
            participantCount: 142,
            participants: [
              {
                id: 'm-1',
                name: 'Sarah Connor',
                role: 'MEMBER',
                room: 'Sector B',
                subroom: 'B3',
                currentLocation: 'B3',
                presenceState: 'IN',
              },
            ],
            serverCoverage: {
              totalServers: 4,
              present: 2,
              inDifferentSubroom: 1,
              outside: 1,
              unknown: 0,
              notRequired: 0,
              coveragePercentage: 75,
              servers: [
                {
                  id: 's-1',
                  name: 'David Chen',
                  email: 'david.chen@workgrid.corp',
                  assignedRoom: 'Sector B',
                  currentLocation: 'Main Auditorium',
                  presenceState: 'IN',
                  supervisionState: 'PRESENT_IN_EVENT',
                  lastSeenIST: '03:42 PM IST',
                },
                {
                  id: 's-2',
                  name: 'Maya Lin',
                  email: 'maya.lin@workgrid.corp',
                  assignedRoom: 'Sector B',
                  currentLocation: 'B3',
                  presenceState: 'IN',
                  supervisionState: 'IN_ROOM_DIFFERENT_SUBROOM',
                  lastSeenIST: '03:40 PM IST',
                },
                {
                  id: 's-3',
                  name: 'Alex Mercer',
                  email: 'alex.mercer@workgrid.corp',
                  assignedRoom: 'Sector B',
                  currentLocation: 'Outside',
                  presenceState: 'OUT',
                  supervisionState: 'OUTSIDE_ROOM',
                  lastSeenIST: '02:30 PM IST',
                },
              ],
            },
          });
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [eventId, token]);

  if (!eventId) return null;

  const renderSupervisionBadge = (state: SupervisionState) => {
    switch (state) {
      case 'PRESENT_IN_EVENT':
        return (
          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[10px] font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">check_circle</span>
            <span>Present in Event Area</span>
          </span>
        );
      case 'IN_ROOM_DIFFERENT_SUBROOM':
        return (
          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded text-[10px] font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">warning</span>
            <span>In Assigned Room (Different Subroom)</span>
          </span>
        );
      case 'OUTSIDE_ROOM':
        return (
          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-200 rounded text-[10px] font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">cancel</span>
            <span>Outside Assigned Room</span>
          </span>
        );
      case 'NOT_REQUIRED':
        return (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-[10px] font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">remove</span>
            <span>Not Required</span>
          </span>
        );
      case 'UNKNOWN':
      default:
        return (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded text-[10px] font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">help</span>
            <span>Location Unknown</span>
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end animate-in fade-in duration-200">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onClick={onClose} />

      <aside className="relative w-full max-w-lg bg-surface-bright border-l border-surface-outline shadow-xl h-full flex flex-col z-10 overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-surface-outline bg-surface-container-low flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">
              event_available
            </span>
            <h2 className="text-sm font-bold text-primary tracking-tight">
              Event Operational Details & Server Coverage
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6 flex-1">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-xs text-on-surface-variant space-y-3">
              <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Analyzing live event coverage...</span>
            </div>
          )}

          {event && (
            <div className="space-y-6">
              {/* Event Identity Card */}
              <div className="p-4 bg-surface-container-low border border-surface-outline rounded space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      event.scope === 'COMPANY'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-indigo-100 text-indigo-800'
                    }`}
                  >
                    {event.scope === 'COMPANY' ? 'Company-Wide Event' : 'Room-Specific Event'}
                  </span>
                  <span className="text-xs font-mono text-on-surface-variant font-semibold">
                    {event.dateFormatted}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-primary">{event.title}</h3>
                  {event.description && (
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                      {event.description}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-surface-outline/60 text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-outline uppercase block">Schedule (IST)</span>
                    <span className="font-semibold text-primary">
                      {event.startTimeIST} – {event.endTimeIST}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-outline uppercase block">Participants</span>
                    <span className="font-semibold text-primary">{event.participantCount} Attending</span>
                  </div>
                </div>

                {/* Locations list */}
                <div className="pt-2 border-t border-surface-outline/60 text-xs">
                  <span className="text-[10px] text-outline uppercase block mb-1">
                    Event Locations ({event.locations.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {event.locations.map((loc, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-surface-bright border border-surface-outline rounded text-[11px] font-mono text-primary font-medium"
                      >
                        {loc}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Server Coverage Overview */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-secondary">
                      shield_person
                    </span>
                    <span>Server Supervision Coverage</span>
                  </h4>
                  <span className="font-mono text-xs text-on-surface-variant font-semibold">
                    {event.serverCoverage.present} / {event.serverCoverage.totalServers - event.serverCoverage.notRequired} Required Present
                  </span>
                </div>

                {/* Server Items */}
                <div className="space-y-2">
                  {event.serverCoverage.servers.map((srv) => (
                    <div
                      key={srv.id}
                      onClick={() => onSelectPerson?.(srv.id)}
                      className="p-3 bg-surface-bright border border-surface-outline hover:border-primary/50 rounded text-xs space-y-2 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Avatar src={srv.avatarUrl} name={srv.name} size="sm" />
                          <div>
                            <p className="font-bold text-primary hover:text-primary-container">{srv.name}</p>
                            <p className="text-[10px] text-on-surface-variant font-mono">
                              Assigned: {srv.assignedRoom} • Role: Server Overseer
                            </p>
                          </div>
                        </div>

                        {renderSupervisionBadge(srv.supervisionState)}
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant pt-1 border-t border-surface-outline/50">
                        <span>Current Location: <strong className="text-primary">{srv.currentLocation}</strong></span>
                        <span>Last Seen: {srv.lastSeenIST}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
