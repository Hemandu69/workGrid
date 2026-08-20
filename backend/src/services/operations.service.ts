import { prisma } from '../db/client.js';
import { EventScope, EventStatus, PresenceState, UserRole } from '@prisma/client';
import {
  formatToISTTime,
  formatToISTDate,
  formatToISTDateTime,
} from '../utils/time.js';

export type SupervisionState =
  | 'PRESENT_IN_EVENT'
  | 'IN_ROOM_DIFFERENT_SUBROOM'
  | 'OUTSIDE_ROOM'
  | 'UNKNOWN'
  | 'NOT_REQUIRED';

export interface GridMemberItem {
  id: string;
  name: string;
  role: UserRole;
  title?: string;
  avatarUrl?: string;
  presenceState: PresenceState;
  presenceLabel: string;
  currentLocation: string; // e.g. "B4", "UNKNOWN"
  arrivedAt?: string;
  arrivedAtIST?: string;
  leftAt?: string;
  leftAtIST?: string;
  durationInWorkGrid?: string;
  lastSeenIST: string;
  activeTaskId?: string;
  activeTaskTitle?: string;
}

export interface GridServerItem {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  assignedRoomLetter: string;
  presenceState: PresenceState;
  currentLocation: string; // e.g. "B4", "UNKNOWN", "Outside"
  isCurrentlyInSubroom: boolean;
  arrivedAtIST?: string;
  lastSeenIST: string;
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
    presenceState: PresenceState;
    currentLocation: string;
  }>;
  serverPresenceCount: number;
  serverTotalCount: number;
  serverCoverageSummary: string; // e.g. "2 / 3 Present"
  subrooms: GridSubroomCell[];
}

export interface OperationalGridResponse {
  currentTimeIST: string;
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
  rooms: GridRoomColumn[];
}

export class OperationsService {
  /**
   * Builds the Operational Room Grid dynamically from database Rooms and Subrooms
   */
  static async getOperationalGrid(filters: {
    room?: string;
    organizationId?: string;
    search?: string;
  }): Promise<OperationalGridResponse> {
    const now = new Date();

    const roomWhere: any = {};
    if (filters.organizationId) roomWhere.organizationId = filters.organizationId;
    if (filters.room && filters.room !== 'ALL') {
      const letter = filters.room.toUpperCase().replace('ROOM', '').replace('SECTOR', '').trim();
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
              where: { role: UserRole.MEMBER },
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
      const roomServers = room.members.map((srv) => {
        const isPresent = srv.presenceState === PresenceState.IN;
        if (isPresent) totalServersPresent++;

        return {
          id: srv.id,
          name: srv.name,
          email: srv.email,
          avatarUrl: srv.avatarUrl || undefined,
          assignedRoomLetter: room.letter,
          presenceState: srv.presenceState,
          currentLocation: srv.currentLocationName || 'UNKNOWN',
          isCurrentlyInSubroom: false,
          arrivedAtIST: srv.arrivedAt ? formatToISTTime(srv.arrivedAt) : undefined,
          lastSeenIST: srv.lastSeenAt ? formatToISTTime(srv.lastSeenAt) : formatToISTTime(now),
        };
      });

      const serverPresenceCount = roomServers.filter((s) => s.presenceState === PresenceState.IN).length;
      const serverTotalCount = roomServers.length;

      const subrooms: GridSubroomCell[] = room.subrooms.map((subroom) => {
        totalSubrooms++;

        // Map occupying members
        const members: GridMemberItem[] = subroom.members.map((m) => {
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

          return {
            id: m.id,
            name: m.name,
            role: m.role,
            title: m.title || undefined,
            avatarUrl: m.avatarUrl || undefined,
            presenceState: m.presenceState,
            presenceLabel: m.presenceState === PresenceState.IN ? 'In Subroom' : m.presenceState === PresenceState.OUT ? 'Outside' : 'Unknown',
            currentLocation: m.currentLocationName || subroom.code,
            arrivedAt: m.arrivedAt ? m.arrivedAt.toISOString() : undefined,
            arrivedAtIST: m.arrivedAt ? formatToISTTime(m.arrivedAt) : undefined,
            leftAt: m.leftAt ? m.leftAt.toISOString() : undefined,
            leftAtIST: m.leftAt ? formatToISTTime(m.leftAt) : undefined,
            durationInWorkGrid,
            lastSeenIST: m.lastSeenAt ? formatToISTTime(m.lastSeenAt) : formatToISTTime(now),
            activeTaskId: m.assignedTasks[0]?.taskIdDisplay || m.assignedTasks[0]?.id,
            activeTaskTitle: m.assignedTasks[0]?.title,
          };
        });

        // Find supervisory servers currently located in this specific subroom
        const serversPresentInSubroom: GridServerItem[] = roomServers
          .filter(
            (s) =>
              s.presenceState === PresenceState.IN &&
              s.currentLocation.toUpperCase().trim() === subroom.code.toUpperCase().trim()
          )
          .map((s) => ({ ...s, isCurrentlyInSubroom: true }));

        // Check if there is an active event in this subroom
        const activeSubroomEvent = activeRoomEvents.find(
          (e) => e.subroomId === subroom.id || (e.roomId === room.id && e.locations.some((l) => l.subroomId === subroom.id || l.name === subroom.code))
        );

        return {
          id: subroom.id,
          code: subroom.code,
          number: subroom.number,
          roomLetter: room.letter,
          memberCapacity: subroom.memberCapacity,
          serverSeatCount: subroom.serverSeatCount,
          occupancyCount: members.filter((m) => m.presenceState === PresenceState.IN).length,
          members,
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
        assignedServers: roomServers.map((s) => ({
          id: s.id,
          name: s.name,
          presenceState: s.presenceState,
          currentLocation: s.currentLocation,
        })),
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

    return {
      currentTimeIST: formatToISTTime(now),
      activeCompanyEvent: formattedCompanyEvent,
      totalRooms: roomColumns.length,
      totalSubrooms,
      totalPeoplePresent,
      totalServersPresent,
      rooms: roomColumns,
    };
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
      // If event has a subroom code or location matching
      const targetSubroomMatches =
        (event.subroomId && server.currentLocationSubroomId === event.subroomId) ||
        event.locations.some((l) => l.name.toUpperCase().trim() === loc);

      if (targetSubroomMatches) {
        return 'PRESENT_IN_EVENT';
      }

      // Check if server is in the same room but different subroom
      if (server.roomId && event.roomId && server.roomId === event.roomId) {
        return 'IN_ROOM_DIFFERENT_SUBROOM';
      }

      return 'OUTSIDE_ROOM';
    }

    // Company event with multi-locations
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
        assignedRoom: srv.room ? `Sector ${srv.room.letter}` : '—',
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
      room: event.room ? `Sector ${event.room.letter} (${event.room.name})` : undefined,
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
        room: p.user.room ? `Sector ${p.user.room.letter}` : '—',
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
