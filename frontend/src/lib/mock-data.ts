import { User } from '../types/auth';
import { Task, TaskCampaign } from '../types/task';
import { Room, Subroom, RoomLetter } from '../types/room';
import { WeeklyAvailabilitySchedule, DayOfWeek, HourlySlot, SlotState } from '../types/availability';
import { Announcement } from '../types/announcement';
import { AppNotification } from '../types/notification';

// -----------------------------------------------------------------------------
// Demo / Role-Based Users
// -----------------------------------------------------------------------------
export const MOCK_USERS: Record<string, User> = {
  superAdmin: {
    id: 'usr-super-01',
    name: 'Elena Vance',
    email: 'elena.vance@workgrid.corp',
    role: 'SUPER_ADMIN',
    accountStatus: 'ACTIVE',
    title: 'Global Operations Director',
    status: 'ONLINE',
    capacityLimitHours: 40,
    currentAllocatedHours: 12,
    createdAt: '2026-01-15T09:00:00Z',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  admin: {
    id: 'usr-admin-01',
    name: 'Marcus Sterling',
    email: 'marcus.sterling@workgrid.corp',
    role: 'ADMIN',
    accountStatus: 'ACTIVE',
    title: 'Operations & Resource Admin',
    status: 'ONLINE',
    capacityLimitHours: 40,
    currentAllocatedHours: 24,
    createdAt: '2026-02-01T10:00:00Z',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  },
  hr: {
    id: 'usr-hr-01',
    name: 'Sarah Jenkins',
    email: 'sarah.jenkins@workgrid.corp',
    role: 'HR',
    accountStatus: 'ACTIVE',
    title: 'Head of People & Talent Operations',
    status: 'ONLINE',
    capacityLimitHours: 40,
    currentAllocatedHours: 8,
    createdAt: '2026-02-15T11:00:00Z',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  },
  server: {
    id: 'usr-server-01',
    name: 'David Chen',
    email: 'david.chen@workgrid.corp',
    role: 'SERVER',
    accountStatus: 'ACTIVE',
    title: 'Supervisor (Sector B)',
    room: 'Room B',
    subroom: 'B1',
    status: 'BUSY',
    capacityLimitHours: 40,
    currentAllocatedHours: 32,
    createdAt: '2026-03-01T08:30:00Z',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  },
  teamLead: {
    id: 'usr-lead-01',
    name: 'Alex Rivera',
    email: 'alex.rivera@workgrid.corp',
    role: 'TEAM_LEAD',
    accountStatus: 'ACTIVE',
    title: 'Infrastructure Specialist & Team Lead',
    room: 'Room B',
    subroom: 'B3',
    status: 'ONLINE',
    capacityLimitHours: 40,
    currentAllocatedHours: 36,
    createdAt: '2026-03-10T09:15:00Z',
    avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
  },
  member: {
    id: 'usr-member-01',
    name: 'Sarah Connor',
    email: 'sarah.connor@workgrid.corp',
    role: 'MEMBER',
    accountStatus: 'ACTIVE',
    title: 'Senior Systems Engineer',
    room: 'Room B',
    subroom: 'B3',
    status: 'ONLINE',
    capacityLimitHours: 35,
    currentAllocatedHours: 28,
    createdAt: '2026-03-15T10:00:00Z',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  },
};

// Additional Team Members for Room B
export const MOCK_ROOM_B_MEMBERS: User[] = [
  MOCK_USERS.member,
  MOCK_USERS.teamLead,
  {
    id: 'usr-member-03',
    name: 'Maya Patel',
    email: 'maya.patel@workgrid.corp',
    role: 'MEMBER',
    accountStatus: 'ACTIVE',
    title: 'Security Analyst',
    room: 'Room B',
    subroom: 'B2',
    status: 'BUSY',
    capacityLimitHours: 40,
    currentAllocatedHours: 38,
    createdAt: '2026-04-01T08:00:00Z',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  },
  {
    id: 'usr-member-04',
    name: 'Liam Vance',
    email: 'liam.vance@workgrid.corp',
    role: 'MEMBER',
    accountStatus: 'ACTIVE',
    title: 'QA Engineer',
    room: 'Room B',
    subroom: 'B4',
    status: 'OFFLINE',
    capacityLimitHours: 40,
    currentAllocatedHours: 15,
    createdAt: '2026-04-10T11:30:00Z',
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
  },
];

// Pending & Suspended Users for HR People Management
export const MOCK_PEOPLE_DIRECTORY: User[] = [
  MOCK_USERS.superAdmin,
  MOCK_USERS.admin,
  MOCK_USERS.hr,
  MOCK_USERS.server,
  MOCK_USERS.teamLead,
  ...MOCK_ROOM_B_MEMBERS.slice(0, 1), // Sarah Connor
  MOCK_ROOM_B_MEMBERS[2], // Maya Patel
  MOCK_ROOM_B_MEMBERS[3], // Liam Vance
  {
    id: 'usr-pending-01',
    name: 'John Doe',
    email: 'john.doe@workgrid.corp',
    role: 'MEMBER',
    accountStatus: 'PENDING',
    title: 'Junior DevOps Engineer (Onboarding)',
    status: 'OFFLINE',
    capacityLimitHours: 40,
    currentAllocatedHours: 0,
    createdAt: '2026-08-18T14:20:00Z',
  },
  {
    id: 'usr-pending-02',
    name: 'Rachel Green',
    email: 'rachel.green@workgrid.corp',
    role: 'MEMBER',
    accountStatus: 'PENDING',
    title: 'Product Designer (Onboarding)',
    status: 'OFFLINE',
    capacityLimitHours: 40,
    currentAllocatedHours: 0,
    createdAt: '2026-08-19T09:45:00Z',
  },
  {
    id: 'usr-suspended-01',
    name: 'Arthur Pendelton',
    email: 'arthur.p@workgrid.corp',
    role: 'MEMBER',
    accountStatus: 'SUSPENDED',
    title: 'Systems Specialist',
    status: 'OFFLINE',
    capacityLimitHours: 40,
    currentAllocatedHours: 0,
    createdAt: '2026-02-10T12:00:00Z',
  },
];

export const MOCK_ROLE_AUDIT_LOGS = [
  {
    id: 'audit-01',
    targetUserId: 'usr-hr-01',
    targetUserName: 'Sarah Jenkins',
    targetUserEmail: 'sarah.jenkins@workgrid.corp',
    targetUserAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    changedById: 'usr-super-01',
    changedByName: 'Elena Vance',
    changedByRole: 'SUPER_ADMIN' as const,
    previousRole: 'MEMBER' as const,
    newRole: 'HR' as const,
    reason: 'Provisioned as Head of People & Talent Operations',
    createdAt: '2026-02-15T11:00:00Z',
  },
  {
    id: 'audit-02',
    targetUserId: 'usr-server-01',
    targetUserName: 'David Chen',
    targetUserEmail: 'david.chen@workgrid.corp',
    targetUserAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    changedById: 'usr-hr-01',
    changedByName: 'Sarah Jenkins',
    changedByRole: 'HR' as const,
    previousRole: 'MEMBER' as const,
    newRole: 'SERVER' as const,
    reason: 'Assigned as Sector B Supervisor',
    createdAt: '2026-03-01T08:30:00Z',
  },
  {
    id: 'audit-03',
    targetUserId: 'usr-lead-01',
    targetUserName: 'Alex Rivera',
    targetUserEmail: 'alex.rivera@workgrid.corp',
    targetUserAvatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
    changedById: 'usr-hr-01',
    changedByName: 'Sarah Jenkins',
    changedByRole: 'HR' as const,
    previousRole: 'MEMBER' as const,
    newRole: 'TEAM_LEAD' as const,
    reason: 'Appointed as Infrastructure Team Lead',
    createdAt: '2026-03-10T09:15:00Z',
  },
];

// -----------------------------------------------------------------------------
// Rooms A through H (with Subrooms 1 through 8)
// -----------------------------------------------------------------------------
const ROOM_LETTERS: RoomLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export const MOCK_ROOMS: Room[] = ROOM_LETTERS.map((letter) => {
  const subrooms: Subroom[] = Array.from({ length: 8 }, (_, i) => {
    const num = i + 1;
    const subroomId = `${letter}${num}`;
    const isB3 = subroomId === 'B3';
    const isB1 = subroomId === 'B1';

    return {
      id: subroomId,
      roomLetter: letter,
      subroomNumber: num,
      name: `Subroom ${subroomId}`,
      memberCapacity: 2,
      membersCount: isB3 ? 2 : (num % 3 === 0 ? 1 : 2),
      serverSeatCount: 1,
      serverPresent: isB1 || isB3,
      serverUser: isB1 || isB3 ? MOCK_USERS.server : undefined,
      members: isB3 ? [MOCK_USERS.member, MOCK_ROOM_B_MEMBERS[1]] : [],
      status: isB3 ? 'FULL' : (num % 2 === 0 ? 'OPTIMAL' : 'NEAR_CAPACITY'),
    };
  });

  const totalMembers = subrooms.reduce((acc, s) => acc + s.membersCount, 0);
  const totalCapacity = subrooms.reduce((acc, s) => acc + s.memberCapacity, 0);

  return {
    id: `Room ${letter}`,
    letter,
    name: `Sector ${letter} — Core Operations`,
    leadServer: letter === 'B' ? MOCK_USERS.server : undefined,
    subrooms,
    totalMembers,
    totalCapacity,
    occupancyPercentage: Math.round((totalMembers / totalCapacity) * 100),
  };
});

// -----------------------------------------------------------------------------
// Tasks & Campaigns
// -----------------------------------------------------------------------------
export const MOCK_TASKS: Task[] = [
  {
    id: 'TSK-8421',
    title: 'Design System Migration & Audit',
    description: 'Audit legacy color codes, update Tailwind CSS configuration, and standardize typography scale across all room surfaces.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    assigneeId: MOCK_USERS.member.id,
    assigneeName: MOCK_USERS.member.name,
    assigneeAvatar: MOCK_USERS.member.avatarUrl,
    assigneeSubroom: 'B3',
    assigneeRoom: 'Room B',
    creatorId: MOCK_USERS.server.id,
    creatorName: MOCK_USERS.server.name,
    estimatedHours: 12,
    allocatedHours: 8,
    dueDate: '2026-08-20T18:00:00Z',
    createdAt: '2026-08-18T09:30:00Z',
    campaignTitle: 'Q3 Core UX Modernization',
    tags: ['Design System', 'Tailwind', 'Frontend'],
    commentsCount: 3,
    comments: [
      {
        id: 'cm-1',
        authorId: MOCK_USERS.server.id,
        authorName: MOCK_USERS.server.name,
        authorAvatar: MOCK_USERS.server.avatarUrl,
        content: 'Please ensure high-contrast accessibility standards are met for tabular figures.',
        createdAt: '2026-08-19T10:15:00Z',
      },
      {
        id: 'cm-2',
        authorId: MOCK_USERS.member.id,
        authorName: MOCK_USERS.member.name,
        authorAvatar: MOCK_USERS.member.avatarUrl,
        content: 'All status badges and table borders have been aligned with the Stitch specifications.',
        createdAt: '2026-08-20T08:45:00Z',
      },
    ],
  },
  {
    id: 'TSK-8422',
    title: 'PostgreSQL Connection Pooling Optimization',
    description: 'Configure Prisma connection pool parameters to support 2,000 concurrent user loads without exhausting worker limits.',
    status: 'SUBMITTED',
    priority: 'CRITICAL',
    assigneeId: 'usr-member-02',
    assigneeName: 'Alex Rivera',
    assigneeAvatar: MOCK_ROOM_B_MEMBERS[1].avatarUrl,
    assigneeSubroom: 'B3',
    assigneeRoom: 'Room B',
    creatorId: MOCK_USERS.admin.id,
    creatorName: MOCK_USERS.admin.name,
    estimatedHours: 8,
    allocatedHours: 8,
    dueDate: '2026-08-21T16:00:00Z',
    createdAt: '2026-08-18T11:00:00Z',
    campaignTitle: 'Database Scalability Overhaul',
    tags: ['Database', 'PostgreSQL', 'Prisma'],
    commentsCount: 1,
  },
  {
    id: 'TSK-8423',
    title: 'Redis Rate Limiting & Auth Token Rotation',
    description: 'Implement rotating refresh tokens with strict rate limits per IP and user session.',
    status: 'ASSIGNED',
    priority: 'MEDIUM',
    assigneeId: MOCK_USERS.member.id,
    assigneeName: MOCK_USERS.member.name,
    assigneeAvatar: MOCK_USERS.member.avatarUrl,
    assigneeSubroom: 'B3',
    assigneeRoom: 'Room B',
    creatorId: MOCK_USERS.server.id,
    creatorName: MOCK_USERS.server.name,
    estimatedHours: 6,
    allocatedHours: 4,
    dueDate: '2026-08-22T17:00:00Z',
    createdAt: '2026-08-19T14:00:00Z',
    tags: ['Security', 'Redis', 'Auth'],
    commentsCount: 0,
  },
  {
    id: 'TSK-8424',
    title: 'Subroom Capacity Exceeded Policy Guard',
    description: 'Transactional rejection on any membership writes that attempt to exceed the configured member limit.',
    status: 'BLOCKED',
    priority: 'HIGH',
    assigneeId: 'usr-member-03',
    assigneeName: 'Maya Patel',
    assigneeAvatar: MOCK_ROOM_B_MEMBERS[2].avatarUrl,
    assigneeSubroom: 'B2',
    assigneeRoom: 'Room B',
    creatorId: MOCK_USERS.admin.id,
    creatorName: MOCK_USERS.admin.name,
    estimatedHours: 10,
    allocatedHours: 5,
    dueDate: '2026-08-23T12:00:00Z',
    createdAt: '2026-08-19T16:30:00Z',
    tags: ['Backend', 'Policies', 'Transactions'],
    commentsCount: 4,
  },
  {
    id: 'TSK-8425',
    title: 'Global Announcement Broadcast Verification',
    description: 'Ensure Super Admin announcements propagate through SSE and Redis pub/sub to all active presence sessions.',
    status: 'COMPLETED',
    priority: 'LOW',
    assigneeId: MOCK_USERS.member.id,
    assigneeName: MOCK_USERS.member.name,
    assigneeAvatar: MOCK_USERS.member.avatarUrl,
    assigneeSubroom: 'B3',
    assigneeRoom: 'Room B',
    creatorId: MOCK_USERS.superAdmin.id,
    creatorName: MOCK_USERS.superAdmin.name,
    estimatedHours: 4,
    allocatedHours: 4,
    dueDate: '2026-08-19T18:00:00Z',
    createdAt: '2026-08-17T09:00:00Z',
    tags: ['PubSub', 'Announcements'],
    commentsCount: 2,
  },
];

export const MOCK_CAMPAIGNS: TaskCampaign[] = [
  {
    id: 'cmp-01',
    title: 'Q3 Core UX & Design System Modernization',
    description: 'Standardize enterprise UI, tabular layout, and high-density components across all 8 sectors.',
    priority: 'HIGH',
    targetRoom: 'Room B',
    tasksCount: 16,
    completedCount: 11,
    createdAt: '2026-08-15T08:00:00Z',
    dueDate: '2026-08-30T18:00:00Z',
  },
  {
    id: 'cmp-02',
    title: 'Database Scalability & Connection Pool Overhaul',
    description: 'Ensure 2,000-user concurrency readiness across all PostgreSQL replica pools.',
    priority: 'CRITICAL',
    tasksCount: 8,
    completedCount: 5,
    createdAt: '2026-08-16T09:00:00Z',
    dueDate: '2026-08-25T18:00:00Z',
  },
];

// -----------------------------------------------------------------------------
// Weekly Availability Schedules
// -----------------------------------------------------------------------------
const DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export function generateMockWeeklySchedule(userId: string): WeeklyAvailabilitySchedule {
  const days = {} as Record<DayOfWeek, HourlySlot[]>;

  DAYS.forEach((day, dayIndex) => {
    const isWeekend = day === 'SATURDAY' || day === 'SUNDAY';
    days[day] = Array.from({ length: 24 }, (_, hour) => {
      let state: SlotState = 'UNAVAILABLE';

      if (!isWeekend) {
        if (hour >= 9 && hour < 17) {
          if (dayIndex === 0 && hour >= 10 && hour < 14) {
            state = 'BUSY'; // Task TSK-8421
          } else if (dayIndex === 2 && hour >= 13 && hour < 16) {
            state = 'BUSY'; // Task TSK-8423
          } else if (hour === 9 || hour === 16) {
            state = 'PREFERRED';
          } else {
            state = 'AVAILABLE';
          }
        }
      }

      return {
        hour,
        state,
        taskId: state === 'BUSY' ? 'TSK-8421' : undefined,
        taskTitle: state === 'BUSY' ? 'Design System Migration' : undefined,
      };
    });
  });

  return {
    userId,
    timezone: 'UTC',
    days,
    totalCapacityHours: 35,
    allocatedHours: 28,
    remainingAvailableHours: 7,
  };
}

export const MOCK_SCHEDULE = generateMockWeeklySchedule(MOCK_USERS.member.id);

// -----------------------------------------------------------------------------
// Announcements
// -----------------------------------------------------------------------------
export const MOCK_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann-01',
    title: 'Scheduled System Maintenance: Database Replica Scaling',
    content: 'All sectors will undergo a brief read-only maintenance window on Saturday between 02:00 and 03:00 UTC for connection pool upgrades.',
    status: 'PUBLISHED',
    scope: 'GLOBAL',
    authorName: 'Elena Vance',
    authorRole: 'Super Admin',
    publishedAt: '2026-08-20T06:00:00Z',
    createdAt: '2026-08-19T15:00:00Z',
    pinned: true,
  },
  {
    id: 'ann-02',
    title: 'Room B Operational Capacity Review',
    content: 'Sector B subrooms are currently at 85% saturation. Leads are requested to audit pending task queues before scheduling additional campaigns.',
    status: 'PUBLISHED',
    scope: 'ROOM_SPECIFIC',
    targetRoom: 'Room B',
    authorName: 'Marcus Sterling',
    authorRole: 'Admin',
    publishedAt: '2026-08-19T11:30:00Z',
    createdAt: '2026-08-19T10:00:00Z',
    pinned: false,
  },
  {
    id: 'ann-03',
    title: 'Upcoming Q4 Task Priority Guidelines',
    content: 'Drafting new priority assignment criteria for high-load campaigns across Rooms E through H.',
    status: 'DRAFT',
    scope: 'ADMINS_ONLY',
    authorName: 'Elena Vance',
    authorRole: 'Super Admin',
    createdAt: '2026-08-20T08:00:00Z',
    pinned: false,
  },
];

// -----------------------------------------------------------------------------
// Notifications
// -----------------------------------------------------------------------------
export const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-01',
    type: 'TASK_ASSIGNED',
    title: 'New Task Assigned',
    message: 'David Chen assigned you to "Design System Migration & Audit" (Due Today).',
    read: false,
    createdAt: '2026-08-20T08:30:00Z',
    link: '/member',
    priority: 'HIGH',
  },
  {
    id: 'notif-02',
    type: 'ANNOUNCEMENT',
    title: 'Global Announcement',
    message: 'Scheduled System Maintenance: Database Replica Scaling.',
    read: false,
    createdAt: '2026-08-20T06:00:00Z',
    link: '/super-admin/announcements',
    priority: 'NORMAL',
  },
  {
    id: 'notif-03',
    type: 'TASK_COMMENT',
    title: 'New Comment on TSK-8421',
    message: 'David Chen: "Please ensure high-contrast accessibility standards are met..."',
    read: true,
    createdAt: '2026-08-19T10:15:00Z',
    link: '/member',
    priority: 'NORMAL',
  },
  {
    id: 'notif-04',
    type: 'CAPACITY_WARNING',
    title: 'Subroom B3 Near Capacity',
    message: 'Subroom B3 has reached 2/2 member capacity.',
    read: true,
    createdAt: '2026-08-18T14:20:00Z',
    link: '/admin/rooms',
    priority: 'HIGH',
  },
];
