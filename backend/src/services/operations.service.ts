import { prisma } from '../db/client.js';
import { EventScope, EventStatus, PresenceState, UserRole } from '@prisma/client';
import {
  formatToISTTime,
  formatToISTDate,
  formatToISTDateTime,
} from '../utils/time.js';
import { calculateServerPositions, SupervisoryPosition } from '../utils/server-positioning.js';
import {
  AvailabilityState,
  availabilityFromUserStatus,
  deriveAvailability,
} from '../utils/availability-projection.js';
import { AvailabilityService } from './availability.service.js';
import { publishDomainEvent } from '../events/domain-events.js';
import { deriveEventStatus } from './org-event.service.js';

export type SupervisionState =
  | 'PRESENT_IN_EVENT'
  | 'IN_ROOM_DIFFERENT_SUBROOM'
  | 'OUTSIDE_ROOM'
  | 'UNKNOWN'
  | 'NOT_REQUIRED';

export interface GridMemberItem {
  id: string;
  name: string;
  role: UserRole | string;
  title?: string;
  avatarUrl?: string;
  presenceState: PresenceState | string;
  presenceLabel: string;
  /** Authoritative operational availability — presence-suppressed when OUT. */
  availabilityState: AvailabilityState;
  availabilityLabel: string;
  currentLocation: string; // e.g. "B4", "UNKNOWN"
  arrivedAt?: string;
  arrivedAtIST?: string;
  leftAt?: string;
  leftAtIST?: string;
  durationInWorkGrid?: string;
  lastSeenIST: string;
  activeTaskId?: string;
  activeTaskTitle?: string;
  /** Event-specific attendance response when an event context is active. */
  eventResponse?: 'ATTENDING' | 'MAYBE' | 'NOT_ATTENDING' | 'NO_RESPONSE';
}

export interface GridServerItem {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  assignedRoomLetter: string;
  presenceState: PresenceState | string;
  availabilityState: AvailabilityState;
  availabilityLabel: string;
  currentLocation: string; // e.g. "B4", "UNKNOWN", "Outside"
  isCurrentlyInSubroom: boolean;
  supervisoryPosition?: SupervisoryPosition;
  arrivedAtIST?: string;
  lastSeenIST: string;
  /** Event-specific attendance response when an event context is active. */
  eventResponse?: 'ATTENDING' | 'MAYBE' | 'NOT_ATTENDING' | 'NO_RESPONSE';
}

export interface GridSubroomCell {
  id: string;
  code: string; // e.g. "B3"
  number: number;
  roomLetter: string;
  memberCapacity: number;
  serverSeatCount: number;
  occupancyCount: number;
  members: GridMemberItem[];
  serversPresent: GridServerItem[];
  activeRoomEvent?: {
    id: string;
    title: string;
    startTimeIST: string;
    endTimeIST: string;
    serverCoverageSummary: string;
  };
}

export interface GridRoomColumn {
  id: string;
  letter: string;
  name: string;
  assignedServers: Array<{
    id: string;
    name: string;
    presenceState: PresenceState | string;
    availabilityState: AvailabilityState;
    availabilityLabel: string;
    currentLocation: string;
    preferredPosition?: SupervisoryPosition;
    assignedPosition?: SupervisoryPosition;
    eventResponse?: 'ATTENDING' | 'MAYBE' | 'NOT_ATTENDING' | 'NO_RESPONSE';
  }>;
  serverPresenceCount: number;
  serverTotalCount: number;
  serverCoverageSummary: string; // e.g. "2 / 3 Present"
  subrooms: GridSubroomCell[];
}

export interface SelectedEventContext {
  id: string;
  title: string;
  description?: string;
  dateIST: string;
  timeIST: string;
  endTimeIST: string;
  status: string;
  totalEligible: number;
  attendingCount: number;
  maybeCount: number;
  notAttendingCount: number;
  noResponseCount: number;
}

export interface AvailableEventSummary {
  id: string;
  title: string;
  dateIST: string;
  timeIST: string;
  endTimeIST: string;
  status: string;
}

export interface OperationalGridResponse {
  currentTimeIST: string;
  selectedEvent: SelectedEventContext | null;
  availableEvents: AvailableEventSummary[];
  activeCompanyEvent?: {
    id: string;
    title: string;
    description?: string;
    scope: EventScope;
    locations: string[];
    startTimeIST: string;
    endTimeIST: string;
    requiredServersCount?: number;
    serversPresentCount: number;
    serverCoverageSummary: string;
  };
  totalRooms: number;
  totalSubrooms: number;
  totalPeoplePresent: number;
  totalServersPresent: number;
  /**
   * Authoritative availability KPIs recomputed from the same projection the
   * cells render, so the numbers can never drift from the grid itself.
   */
  availabilitySummary: {
    totalPeople: number;
    freeCount: number;
    busyCount: number;
    partialCount: number;
    unavailableCount: number;
  };
  rooms: GridRoomColumn[];
}

/** Normalize presence so both the Prisma enum and plain string form compare consistently. */
function isPresenceIn(state: PresenceState | string | null | undefined): boolean {
  return state === PresenceState.IN || state === 'IN';
}

/** Resolve the authoritative current presence, normalizing the stored enum. */
function resolveAuthoritativePresence(
  _personId: string,
  fallback: PresenceState | string
): 'IN' | 'OUT' | 'UNKNOWN' {
  if (isPresenceIn(fallback)) return 'IN';
  if (fallback === PresenceState.OUT || fallback === 'OUT') return 'OUT';
  return 'UNKNOWN';
}

export class OperationsService {
  /**
   * Builds the Operational Room Grid dynamically from database Rooms and Subrooms.
   */
  static async getOperationalGrid(filters: {
    room?: string;
    organizationId?: string;
    search?: string;
    eventId?: string;
  }): Promise<OperationalGridResponse> {
    const now = new Date();

    // 1. Fetch available Organization Events for the event selector dropdown
    const eventWhere: any = {};
    if (filters.organizationId) eventWhere.organizationId = filters.organizationId;

    const allOrgEvents =
      typeof prisma.organizationEvent?.findMany === 'function'
        ? await prisma.organizationEvent.findMany({
            where: eventWhere,
            orderBy: { scheduledAt: 'asc' },
            take: 100,
          })
        : [];

    const mappedEvents: AvailableEventSummary[] = allOrgEvents.map((e) => ({
      id: e.id,
      title: e.title,
      dateIST: formatToISTDate(e.scheduledAt),
      timeIST: formatToISTTime(e.scheduledAt),
      endTimeIST: formatToISTTime(e.scheduledEndAt),
      status: deriveEventStatus(e.scheduledAt, e.scheduledEndAt, e.completedAt, e.status, now),
    }));

    // Operations Grid selector must ONLY contain LIVE / ongoing or UPCOMING events (never COMPLETED or CANCELLED)
    const availableEvents: AvailableEventSummary[] = mappedEvents.filter(
      (e) => e.status !== 'COMPLETED' && e.status !== 'CANCELLED'
    );

    // 2. Resolve selected event context if eventId is provided (explicitly, never silently defaulted)
    let selectedEvent: SelectedEventContext | null = null;
    const responseMap = new Map<string, 'ATTENDING' | 'MAYBE' | 'NOT_ATTENDING'>();

    if (filters.eventId) {
      const targetEvent =
        allOrgEvents.find((e) => e.id === filters.eventId) ||
        (typeof prisma.organizationEvent?.findUnique === 'function'
          ? await prisma.organizationEvent.findUnique({
              where: { id: filters.eventId },
            })
          : null);

      if (!targetEvent || (filters.organizationId && targetEvent.organizationId !== filters.organizationId)) {
        const error = new Error(`Event with ID ${filters.eventId} not found`);
        (error as any).statusCode = 404;
        throw error;
      }

      const eventStatus = deriveEventStatus(
        targetEvent.scheduledAt,
        targetEvent.scheduledEndAt,
        targetEvent.completedAt,
        targetEvent.status,
        now
      );

      // If the event is COMPLETED or CANCELLED, it is no longer an active operational event
      if (eventStatus !== 'COMPLETED' && eventStatus !== 'CANCELLED') {
        const responses =
          typeof prisma.organizationEventResponse?.findMany === 'function'
            ? await prisma.organizationEventResponse.findMany({
                where: { eventId: targetEvent.id },
                select: { userId: true, response: true },
              })
            : [];

        for (const r of responses) {
          responseMap.set(r.userId, r.response as 'ATTENDING' | 'MAYBE' | 'NOT_ATTENDING');
        }

        const attendingCount = responses.filter((r) => r.response === 'ATTENDING').length;
        const maybeCount = responses.filter((r) => r.response === 'MAYBE').length;
        const notAttendingCount = responses.filter((r) => r.response === 'NOT_ATTENDING').length;

        const userCountWhere: any = { accountStatus: 'ACTIVE' };
        if (filters.organizationId) userCountWhere.organizationId = filters.organizationId;
        const eligibleCount =
          typeof prisma.user?.count === 'function' ? await prisma.user.count({ where: userCountWhere }) : 0;
        const noResponseCount = Math.max(0, eligibleCount - responses.length);

        selectedEvent = {
          id: targetEvent.id,
          title: targetEvent.title,
          description: targetEvent.description || undefined,
          dateIST: formatToISTDate(targetEvent.scheduledAt),
          timeIST: formatToISTTime(targetEvent.scheduledAt),
          endTimeIST: formatToISTTime(targetEvent.scheduledEndAt),
          status: eventStatus,
          totalEligible: eligibleCount,
          attendingCount,
          maybeCount,
          notAttendingCount,
          noResponseCount,
        };
      }
    }

    const roomWhere: any = {};
    if (filters.organizationId) roomWhere.organizationId = filters.organizationId;
    if (filters.room && filters.room !== 'ALL') {
      const letter = filters.room.toUpperCase().replace('ROOM', '').replace('SECTOR', '').replace('SECTION', '').trim();
      roomWhere.letter = letter;
    }

    // Load rooms and subrooms dynamically from the database
    const rooms = await prisma.room.findMany({
      where: roomWhere,
      orderBy: { letter: 'asc' },
      include: {
        subrooms: {
          orderBy: { number: 'asc' },
          include: {
            members: {
              where: { role: { in: [UserRole.MEMBER, UserRole.TEAM_LEAD] } },
              include: {
                assignedTasks: {
                  where: { status: 'IN_PROGRESS' },
                  take: 1,
                },
              },
            },
          },
        },
        members: {
          where: { role: UserRole.SERVER },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Check for active Company-wide event
    const activeCompanyEvent = await prisma.event.findFirst({
      where: {
        scope: EventScope.COMPANY,
        status: EventStatus.ACTIVE,
        startTime: { lte: now },
        endTime: { gte: now },
      },
      include: {
        locations: true,
        requiredServers: {
          include: { server: true },
        },
      },
    });

    // Check for active Room events
    const activeRoomEvents = await prisma.event.findMany({
      where: {
        scope: EventScope.ROOM,
        status: EventStatus.ACTIVE,
        startTime: { lte: now },
        endTime: { gte: now },
      },
      include: {
        locations: true,
        requiredServers: {
          include: { server: true },
        },
      },
    });

    let totalPeoplePresent = 0;
    let totalServersPresent = 0;
    let totalSubrooms = 0;

    const roomColumns: GridRoomColumn[] = rooms.map((room) => {
      // Real database servers for this room
      const allRoomServers: GridServerItem[] = room.members.map((srv) => {
        const presenceState = resolveAuthoritativePresence(srv.id, srv.presenceState);
        const availability = deriveAvailability({
          presenceState,
          storedState: availabilityFromUserStatus(srv.status),
          locationLabel: srv.currentLocationName,
        });
        const serverEventResponse = filters.eventId ? responseMap.get(srv.id) || 'NO_RESPONSE' : undefined;

        return {
          id: srv.id,
          name: srv.name,
          email: srv.email,
          avatarUrl: srv.avatarUrl || undefined,
          assignedRoomLetter: room.letter,
          presenceState,
          availabilityState: availability.state,
          availabilityLabel: availability.label,
          currentLocation:
            presenceState === 'IN' ? srv.currentLocationName || 'UNKNOWN' : presenceState === 'OUT' ? 'Outside' : srv.currentLocationName || 'UNKNOWN',
          isCurrentlyInSubroom: false,
          arrivedAtIST: srv.arrivedAt ? formatToISTTime(srv.arrivedAt) : undefined,
          lastSeenIST: srv.lastSeenAt ? formatToISTTime(srv.lastSeenAt) : formatToISTTime(now),
          eventResponse: serverEventResponse,
        };
      });

      // Assign UNIQUE preferred supervisory identities (1, 3, 5) to the room's
      // real servers, in a stable order (oldest-assigned first).
      const usedPreferred = new Set<SupervisoryPosition>();
      const preferredByServerId = new Map<string, SupervisoryPosition>();

      for (const srv of allRoomServers) {
        const next = ([1, 3, 5] as SupervisoryPosition[]).find((slot) => !usedPreferred.has(slot));
        if (next) {
          preferredByServerId.set(srv.id, next);
          usedPreferred.add(next);
        }
      }

      // Format for server positioning algorithm — presence + preferred identity
      const serverPositionInputs = allRoomServers.map((srv) => {
        const presenceState = resolveAuthoritativePresence(srv.id, srv.presenceState);
        return {
          id: srv.id,
          name: srv.name,
          presenceState,
          preferredSlot: preferredByServerId.get(srv.id),
        };
      });

      // Recalculate CURRENT operational positions whenever presence changes
      const serverPositionResults = calculateServerPositions(serverPositionInputs);

      const serverPositionMap = new Map<string, SupervisoryPosition>();
      serverPositionResults.forEach((pos) => {
        serverPositionMap.set(pos.server.id, pos.position);
      });

      // After positioning: operational location for IN servers is their ASSIGNED slot, not preferred home
      for (const srv of allRoomServers) {
        const presenceState = resolveAuthoritativePresence(srv.id, srv.presenceState);
        srv.presenceState = presenceState;
        if (presenceState === 'IN') {
          const assigned = serverPositionMap.get(srv.id);
          srv.currentLocation = assigned ? `${room.letter}${assigned}` : srv.currentLocation;
        } else if (presenceState === 'OUT') {
          srv.currentLocation = 'Outside';
        }
      }

      const serverPresenceCount = allRoomServers.filter((s) => isPresenceIn(s.presenceState)).length;
      const serverTotalCount = allRoomServers.length;
      totalServersPresent += serverPresenceCount;

      const subrooms: GridSubroomCell[] = room.subrooms.map((subroom) => {
        totalSubrooms++;

        // Real database members in this subroom
        const allSubroomMembers: GridMemberItem[] = subroom.members.map((m) => {
          if (m.presenceState === PresenceState.IN) {
            totalPeoplePresent++;
          }

          let durationInWorkGrid: string | undefined;
          if (m.arrivedAt && m.presenceState === PresenceState.IN) {
            const diffMs = now.getTime() - m.arrivedAt.getTime();
            const hours = Math.floor(diffMs / 3600000);
            const mins = Math.floor((diffMs % 3600000) / 60000);
            durationInWorkGrid = `${hours}h ${mins}m`;
          }

          const memberAvailability = deriveAvailability({
            presenceState: m.presenceState,
            storedState: availabilityFromUserStatus(m.status),
            activeTaskLabel: m.assignedTasks[0]?.taskIdDisplay || m.assignedTasks[0]?.title || null,
            locationLabel: subroom.code,
          });

          const memberEventResponse = filters.eventId ? responseMap.get(m.id) || 'NO_RESPONSE' : undefined;

          return {
            id: m.id,
            name: m.name,
            role: m.role || UserRole.MEMBER,
            title: m.title || undefined,
            avatarUrl: m.avatarUrl || undefined,
            presenceState: m.presenceState,
            presenceLabel: m.presenceState === PresenceState.IN ? 'In Subroom' : m.presenceState === PresenceState.OUT ? 'Outside' : 'Unknown',
            availabilityState: memberAvailability.state,
            availabilityLabel: memberAvailability.label,
            currentLocation: m.presenceState === PresenceState.IN ? m.currentLocationName || subroom.code : 'Outside',
            arrivedAt: m.arrivedAt ? m.arrivedAt.toISOString() : undefined,
            arrivedAtIST: m.arrivedAt ? formatToISTTime(m.arrivedAt) : undefined,
            leftAt: m.leftAt ? m.leftAt.toISOString() : undefined,
            leftAtIST: m.leftAt ? formatToISTTime(m.leftAt) : undefined,
            durationInWorkGrid,
            lastSeenIST: m.lastSeenAt ? formatToISTTime(m.lastSeenAt) : formatToISTTime(now),
            activeTaskId: m.assignedTasks[0]?.taskIdDisplay || m.assignedTasks[0]?.id,
            activeTaskTitle: m.assignedTasks[0]?.title,
            eventResponse: memberEventResponse,
          };
        });

        // Supervisory overseer for this cell: ONLY the server currently assigned to this slot (1/3/5)
        // and currently IN. Preferred home subroom / fixture metadata must NEVER place an OUT server here.
        const assignedPositionForCell = [1, 3, 5].includes(subroom.number)
          ? (subroom.number as SupervisoryPosition)
          : undefined;

        const serversPresentInSubroom: GridServerItem[] = assignedPositionForCell
          ? allRoomServers
              .filter((s) => {
                const presence = resolveAuthoritativePresence(s.id, s.presenceState);
                const assigned = serverPositionMap.get(s.id);
                return presence === 'IN' && assigned === assignedPositionForCell;
              })
              .map((s) => ({
                ...s,
                presenceState: resolveAuthoritativePresence(s.id, s.presenceState),
                isCurrentlyInSubroom: true,
                supervisoryPosition: serverPositionMap.get(s.id),
              }))
          : [];

        // Check if there is an active event in this subroom
        const activeSubroomEvent = activeRoomEvents.find(
          (e) => e.subroomId === subroom.id || (e.roomId === room.id && e.locations.some((l) => l.subroomId === subroom.id || l.name === subroom.code))
        );

        const occupancyCount = allSubroomMembers.filter((m) => isPresenceIn(m.presenceState)).length;

        return {
          id: subroom.id,
          code: subroom.code,
          number: subroom.number,
          roomLetter: room.letter,
          memberCapacity: subroom.memberCapacity,
          serverSeatCount: subroom.serverSeatCount,
          occupancyCount,
          members: allSubroomMembers,
          serversPresent: serversPresentInSubroom,
          activeRoomEvent: activeSubroomEvent
            ? {
                id: activeSubroomEvent.id,
                title: activeSubroomEvent.title,
                startTimeIST: formatToISTTime(activeSubroomEvent.startTime),
                endTimeIST: formatToISTTime(activeSubroomEvent.endTime),
                serverCoverageSummary: `${activeSubroomEvent.requiredServers.filter((rs) => rs.server.presenceState === PresenceState.IN).length} / ${activeSubroomEvent.requiredServers.length || activeSubroomEvent.requiredServersCount || 1} Present`,
              }
            : undefined,
        };
      });

      return {
        id: room.id,
        letter: room.letter,
        name: room.name,
        assignedServers: allRoomServers.map((s) => {
          const presenceState = resolveAuthoritativePresence(s.id, s.presenceState);
          return {
            id: s.id,
            name: s.name,
            presenceState,
            // Already presence-suppressed when the roster entry was built above.
            availabilityState: s.availabilityState,
            availabilityLabel: s.availabilityLabel,
            currentLocation: presenceState === 'IN' ? s.currentLocation : 'Outside',
            preferredPosition: preferredByServerId.get(s.id),
            // Only IN servers receive an assigned supervisory position
            assignedPosition: presenceState === 'IN' ? serverPositionMap.get(s.id) : undefined,
            eventResponse: s.eventResponse,
          };
        }),
        serverPresenceCount,
        serverTotalCount,
        serverCoverageSummary: `${serverPresenceCount} / ${serverTotalCount} Present`,
        subrooms,
      };
    });

    let formattedCompanyEvent: OperationalGridResponse['activeCompanyEvent'];
    if (activeCompanyEvent) {
      const locations = activeCompanyEvent.locations.map((l) => l.name);
      const reqServers = activeCompanyEvent.requiredServers.map((rs) => rs.server);
      const presentCount = reqServers.filter((s) => s.presenceState === PresenceState.IN).length;
      const totalReq = reqServers.length || activeCompanyEvent.requiredServersCount || 0;

      formattedCompanyEvent = {
        id: activeCompanyEvent.id,
        title: activeCompanyEvent.title,
        description: activeCompanyEvent.description || undefined,
        scope: activeCompanyEvent.scope,
        locations: locations.length > 0 ? locations : ['Organization-Wide'],
        startTimeIST: formatToISTTime(activeCompanyEvent.startTime),
        endTimeIST: formatToISTTime(activeCompanyEvent.endTime),
        requiredServersCount: totalReq,
        serversPresentCount: presentCount,
        serverCoverageSummary: totalReq > 0 ? `${presentCount} / ${totalReq} Present` : 'Normal Coverage',
      };
    }

    // Derive availability KPIs from the projected cells themselves — never by
    // incrementing counters, so repeated changes cannot make the numbers drift.
    const everyone = roomColumns.flatMap((r) => [
      ...r.subrooms.flatMap((s) => s.members),
      ...r.assignedServers,
    ]);
    const countBy = (state: AvailabilityState) =>
      everyone.filter((p) => p.availabilityState === state).length;

    return {
      currentTimeIST: formatToISTTime(now),
      selectedEvent,
      availableEvents,
      activeCompanyEvent: formattedCompanyEvent,
      totalRooms: roomColumns.length,
      totalSubrooms,
      totalPeoplePresent,
      totalServersPresent,
      availabilitySummary: {
        totalPeople: everyone.length,
        freeCount: countBy('FREE'),
        busyCount: countBy('BUSY'),
        partialCount: countBy('PARTIALLY_AVAILABLE'),
        unavailableCount: countBy('UNAVAILABLE'),
      },
      rooms: roomColumns,
    };
  }

  /**
   * Retrieves person detail drawer information for a real, authenticated user.
   */
  static async getPersonDetail(personId: string) {
    return AvailabilityService.getPersonDetailedAvailability(personId);
  }

  /**
   * Evaluates Dynamic Server Supervision State for a specific event
   */
  static evaluateServerSupervisionStatus(
    server: {
      id: string;
      roomId?: string | null;
      currentLocationRoomId?: string | null;
      currentLocationSubroomId?: string | null;
      currentLocationName?: string | null;
      presenceState: PresenceState;
    },
    event: {
      scope: EventScope;
      roomId?: string | null;
      subroomId?: string | null;
      locations: Array<{ name: string; roomId?: string | null; subroomId?: string | null }>;
      requiredServers: Array<{ serverId: string }>;
    }
  ): SupervisionState {
    const isRequired =
      event.requiredServers.length === 0 || event.requiredServers.some((rs) => rs.serverId === server.id);

    if (!isRequired) {
      return 'NOT_REQUIRED';
    }

    if (server.presenceState === PresenceState.OUT) {
      return 'OUTSIDE_ROOM';
    }

    if (server.presenceState === PresenceState.UNKNOWN || !server.currentLocationName) {
      return 'UNKNOWN';
    }

    const loc = server.currentLocationName.toUpperCase().trim();

    if (event.scope === EventScope.ROOM) {
      const targetSubroomMatches =
        (event.subroomId && server.currentLocationSubroomId === event.subroomId) ||
        event.locations.some((l) => l.name.toUpperCase().trim() === loc);

      if (targetSubroomMatches) {
        return 'PRESENT_IN_EVENT';
      }

      if (server.roomId && event.roomId && server.roomId === event.roomId) {
        return 'IN_ROOM_DIFFERENT_SUBROOM';
      }

      return 'OUTSIDE_ROOM';
    }

    const matchedLocation = event.locations.some((l) => l.name.toUpperCase().trim() === loc);
    if (matchedLocation || loc === 'MAIN HALL' || loc === 'MAIN AUDITORIUM') {
      return 'PRESENT_IN_EVENT';
    }

    return 'PRESENT_IN_EVENT';
  }

  /**
   * Detailed Event Overview with Multi-Location and Dynamic Server Supervision List
   */
  static async getEventDetail(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        room: true,
        subroom: true,
        locations: true,
        requiredServers: {
          include: {
            server: {
              include: { room: true },
            },
          },
        },
        participants: {
          include: {
            user: {
              include: { room: true, subroom: true },
            },
          },
        },
      },
    });

    if (!event) {
      throw new Error(`Event with ID ${eventId} not found`);
    }

    const allServersInScope = await prisma.user.findMany({
      where: {
        role: UserRole.SERVER,
        ...(event.scope === EventScope.ROOM && event.roomId ? { roomId: event.roomId } : {}),
      },
      include: { room: true },
    });

    const evaluatedServers = allServersInScope.map((srv) => {
      const supervisionState = this.evaluateServerSupervisionStatus(
        {
          id: srv.id,
          roomId: srv.roomId,
          currentLocationRoomId: srv.currentLocationRoomId,
          currentLocationSubroomId: srv.currentLocationSubroomId,
          currentLocationName: srv.currentLocationName,
          presenceState: srv.presenceState,
        },
        {
          scope: event.scope,
          roomId: event.roomId,
          subroomId: event.subroomId,
          locations: event.locations,
          requiredServers: event.requiredServers,
        }
      );

      return {
        id: srv.id,
        name: srv.name,
        email: srv.email,
        avatarUrl: srv.avatarUrl || undefined,
        assignedRoom: srv.room ? `Section ${srv.room.letter}` : '—',
        currentLocation: srv.currentLocationName || 'UNKNOWN',
        presenceState: srv.presenceState,
        supervisionState,
        lastSeenIST: srv.lastSeenAt ? formatToISTTime(srv.lastSeenAt) : 'Just now',
      };
    });

    const presentCount = evaluatedServers.filter((s) => s.supervisionState === 'PRESENT_IN_EVENT').length;
    const differentSubroomCount = evaluatedServers.filter((s) => s.supervisionState === 'IN_ROOM_DIFFERENT_SUBROOM').length;
    const outsideCount = evaluatedServers.filter((s) => s.supervisionState === 'OUTSIDE_ROOM').length;
    const unknownCount = evaluatedServers.filter((s) => s.supervisionState === 'UNKNOWN').length;
    const notRequiredCount = evaluatedServers.filter((s) => s.supervisionState === 'NOT_REQUIRED').length;

    return {
      id: event.id,
      title: event.title,
      description: event.description,
      scope: event.scope,
      status: event.status,
      room: event.room ? `Section ${event.room.letter} (${event.room.name})` : undefined,
      subroom: event.subroom?.code,
      locations: event.locations.map((l) => l.name),
      startTimeIST: formatToISTDateTime(event.startTime),
      endTimeIST: formatToISTDateTime(event.endTime),
      dateFormatted: formatToISTDate(event.startTime),
      participantCount: event.participants.length,
      participants: event.participants.map((p) => ({
        id: p.user.id,
        name: p.user.name,
        role: p.user.role,
        avatarUrl: p.user.avatarUrl,
        room: p.user.room ? `Section ${p.user.room.letter}` : '—',
        subroom: p.user.subroom?.code || '—',
        currentLocation: p.user.currentLocationName || 'UNKNOWN',
        presenceState: p.user.presenceState,
      })),
      serverCoverage: {
        totalServers: evaluatedServers.length,
        present: presentCount,
        inDifferentSubroom: differentSubroomCount,
        outside: outsideCount,
        unknown: unknownCount,
        notRequired: notRequiredCount,
        coveragePercentage: evaluatedServers.length > 0 ? Math.round((presentCount / (evaluatedServers.length - notRequiredCount || 1)) * 100) : 100,
        servers: evaluatedServers,
      },
    };
  }

  /**
   * Updates real user presence (check-in, check-out, location update)
   */
  static async updateUserPresence(
    userId: string,
    data: {
      presenceState?: PresenceState;
      currentLocationName?: string | null;
      currentLocationRoomId?: string | null;
      currentLocationSubroomId?: string | null;
    }
  ) {
    const now = new Date();
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error(`User ${userId} not found`);

    const updatePayload: any = {
      lastSeenAt: now,
    };

    if (data.presenceState !== undefined) {
      updatePayload.presenceState = data.presenceState;
      if (data.presenceState === PresenceState.IN && user.presenceState !== PresenceState.IN) {
        updatePayload.arrivedAt = now;
        updatePayload.leftAt = null;
      } else if (data.presenceState === PresenceState.OUT) {
        updatePayload.leftAt = now;
        updatePayload.currentLocationName = 'Outside';
      }
    }

    if (data.currentLocationName !== undefined) {
      updatePayload.currentLocationName = data.currentLocationName;
    }
    if (data.currentLocationRoomId !== undefined) {
      updatePayload.currentLocationRoomId = data.currentLocationRoomId;
    }
    if (data.currentLocationSubroomId !== undefined) {
      updatePayload.currentLocationSubroomId = data.currentLocationSubroomId;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updatePayload,
    });

    publishDomainEvent({
      type: 'LOCATION_CHANGED',
      organizationId: updated.organizationId,
      entityId: updated.id,
      targetUserId: updated.id,
      actorId: userId,
      payload: {
        userId: updated.id,
        userName: updated.name,
        userRole: updated.role,
        currentLocation: updated.currentLocationName,
        presenceState: updated.presenceState,
        roomId: updated.roomId,
        subroomId: updated.subroomId,
        timestamp: now.toISOString(),
      },
    });

    publishDomainEvent({
      type: 'ROOM_STATUS_CHANGED',
      organizationId: updated.organizationId,
      entityId: updated.roomId || updated.id,
      targetUserId: updated.id,
      actorId: userId,
      payload: {
        userId: updated.id,
        roomId: updated.roomId,
        subroomId: updated.subroomId,
        presenceState: updated.presenceState,
      },
    });

    publishDomainEvent({
      type: 'ATTENDANCE_UPDATED',
      organizationId: updated.organizationId,
      entityId: updated.id,
      targetUserId: updated.id,
      actorId: userId,
      payload: {
        userId: updated.id,
        state: updated.presenceState === PresenceState.IN ? 'IN' : 'OUT',
        presenceState: updated.presenceState,
        arrivedAt: updated.arrivedAt?.toISOString(),
        leftAt: updated.leftAt?.toISOString(),
      },
    });

    publishDomainEvent({
      type: 'AVAILABILITY_CHANGED',
      organizationId: updated.organizationId,
      entityId: updated.id,
      targetUserId: updated.id,
      actorId: userId,
      payload: {
        userId: updated.id,
        presenceState: updated.presenceState,
        status: updated.presenceState === PresenceState.IN ? 'ONLINE' : 'OFFLINE',
      },
    });

    return {
      userId: updated.id,
      name: updated.name,
      presenceState: updated.presenceState,
      currentLocation: updated.currentLocationName || 'UNKNOWN',
      arrivedAtIST: updated.arrivedAt ? formatToISTTime(updated.arrivedAt) : undefined,
      lastSeenIST: formatToISTTime(updated.lastSeenAt || now),
    };
  }
}
