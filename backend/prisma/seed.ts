import { PrismaClient, UserRole, AccountStatus, UserStatus, TaskStatus, TaskPriority, AnnouncementStatus, AudienceScope, DayOfWeek, SlotState, PresenceState, EventScope, EventStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import process from 'node:process';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting WorkGrid database seed (7 Core Authenticated Accounts)...');

  // 1. Clean existing records in reverse dependency order
  await prisma.eventParticipant.deleteMany();
  await prisma.eventRequiredServer.deleteMany();
  await prisma.eventLocation.deleteMany();
  await prisma.event.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.roleAuditLog.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.availabilitySlot.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.taskCampaign.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.user.deleteMany();
  await prisma.subroom.deleteMany();
  await prisma.room.deleteMany();
  await prisma.organization.deleteMany();

  // 2. Create Default Organization
  const org = await prisma.organization.create({
    data: {
      name: 'WorkGrid Corporation',
      slug: 'workgrid',
    },
  });
  console.log(`✓ Organization created: ${org.name}`);

  // 3. Create Sections (Rooms) A through H
  const roomLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const roomNames: Record<string, string> = {
    A: 'Section A — Core Operations',
    B: 'Section B — Infrastructure & Security',
    C: 'Section C — Systems Architecture',
    D: 'Section D — Frontend & UI Engineering',
    E: 'Section E — Database & Scalability',
    F: 'Section F — Network Operations',
    G: 'Section G — Quality Assurance',
    H: 'Section H — Global Strategy',
  };

  const createdRooms: Record<string, { id: string }> = {};
  const createdSubrooms: Record<string, { id: string }> = {};

  for (const letter of roomLetters) {
    const room = await prisma.room.create({
      data: {
        organizationId: org.id,
        letter,
        name: roomNames[letter],
      },
    });
    createdRooms[letter] = room;

    // Create 8 Subrooms per Section (e.g. B1 through B8) with 2 members capacity
    for (let num = 1; num <= 8; num++) {
      const code = `${letter}${num}`;
      const subroom = await prisma.subroom.create({
        data: {
          organizationId: org.id,
          roomId: room.id,
          code,
          number: num,
          memberCapacity: 2,
          serverSeatCount: 1,
        },
      });
      createdSubrooms[code] = subroom;
    }
  }
  console.log(`✓ Created 8 Sections and 64 Subrooms (A1 through H8) with 2-member capacity`);

  // 4. Create the 7 Official Test/Authentication Accounts
  const defaultPasswordHash = await bcrypt.hash('password123', 10);
  const now = new Date();
  const arrivalTime = new Date(now.getTime() - 4 * 3600000); // 4 hours ago

  // 1) Super Admin (Elena Vance)
  const superAdmin = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'elena.vance@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Elena Vance',
      role: UserRole.SUPER_ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.ONLINE,
      presenceState: PresenceState.IN,
      currentLocationName: 'Main Auditorium',
      arrivedAt: arrivalTime,
      lastSeenAt: now,
      title: 'Global Operations Director',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 12,
    },
  });

  // 2) Admin (Marcus Sterling)
  const admin = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'marcus.sterling@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Marcus Sterling',
      role: UserRole.ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.ONLINE,
      presenceState: PresenceState.IN,
      currentLocationName: 'B1',
      arrivedAt: arrivalTime,
      lastSeenAt: now,
      title: 'Operations & Resource Admin',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 24,
    },
  });

  // 3) HR (Sarah Jenkins)
  const hrUser = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'sarah.jenkins@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Sarah Jenkins',
      role: UserRole.HR,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.ONLINE,
      presenceState: PresenceState.IN,
      currentLocationName: 'A1',
      arrivedAt: arrivalTime,
      lastSeenAt: now,
      title: 'Head of People & Talent Operations',
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 8,
    },
  });

  // 4) Server (David Chen) — Section B Supervisor (Position 1)
  const server1 = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'david.chen@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'David Chen',
      role: UserRole.SERVER,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.BUSY,
      presenceState: PresenceState.IN,
      currentLocationName: 'B1',
      arrivedAt: arrivalTime,
      lastSeenAt: now,
      title: 'Supervisor (Section B - Pos 1)',
      roomId: createdRooms['B'].id,
      subroomId: createdSubrooms['B1'].id,
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 32,
    },
  });

  // Assign Server 1 as Lead for Room B
  await prisma.room.update({
    where: { id: createdRooms['B'].id },
    data: { leadServerId: server1.id },
  });

  // 5) Member 1 (Sarah Connor) — Subroom B3
  const member1 = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'sarah.connor@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Sarah Connor',
      role: UserRole.MEMBER,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.ONLINE,
      presenceState: PresenceState.IN,
      currentLocationName: 'B3',
      arrivedAt: arrivalTime,
      lastSeenAt: now,
      title: 'Senior Systems Engineer',
      roomId: createdRooms['B'].id,
      subroomId: createdSubrooms['B3'].id,
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 35,
      currentAllocatedHours: 28,
    },
  });

  // 6) Team Lead (Alex Rivera) — Subroom B3
  const member2 = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'alex.rivera@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Alex Rivera',
      role: UserRole.TEAM_LEAD,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.ONLINE,
      presenceState: PresenceState.IN,
      currentLocationName: 'B3',
      arrivedAt: arrivalTime,
      lastSeenAt: now,
      title: 'Infrastructure Specialist & Team Lead',
      roomId: createdRooms['B'].id,
      subroomId: createdSubrooms['B3'].id,
      avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 36,
    },
  });

  // 7) Pending Onboarding User (John Doe)
  const pendingUser = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'john.doe@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'John Doe',
      accountStatus: AccountStatus.PENDING,
      status: UserStatus.OFFLINE,
      presenceState: PresenceState.OUT,
      currentLocationName: 'Outside',
      title: 'Junior DevOps Engineer (Onboarding)',
      capacityLimitHours: 40,
      currentAllocatedHours: 0,
    },
  });

  // Attendance Records for Active Users
  for (const u of [superAdmin, admin, hrUser, server1, member1, member2]) {
    await prisma.attendanceRecord.create({
      data: {
        userId: u.id,
        organizationId: org.id,
        arrivedAt: arrivalTime,
      },
    });
  }

  // Demo Role Audit Log Entry
  await prisma.roleAuditLog.create({
    data: {
      organizationId: org.id,
      targetUserId: hrUser.id,
      changedById: superAdmin.id,
      previousRole: UserRole.MEMBER,
      newRole: UserRole.HR,
      reason: 'Provisioned as Head of People & Talent Operations',
    },
  });

  console.log(`✓ Created 7 official authenticated accounts (Super Admin, Admin, HR, Server, Member, Team Lead, Pending)`);

  // 5. Create Task Campaigns
  const campaign1 = await prisma.taskCampaign.create({
    data: {
      organizationId: org.id,
      title: 'Q3 Core UX & Design System Modernization',
      description: 'Standardize enterprise UI, tabular layout, and high-density components across all 8 sections.',
      priority: TaskPriority.HIGH,
      targetRoom: 'Room B',
      createdById: admin.id,
      dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    },
  });

  const campaign2 = await prisma.taskCampaign.create({
    data: {
      organizationId: org.id,
      title: 'Database Scalability & Connection Pool Overhaul',
      description: 'Ensure 2,000-user concurrency readiness across all PostgreSQL replica pools.',
      priority: TaskPriority.CRITICAL,
      createdById: admin.id,
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
  });

  // 6. Create Tasks
  const task1 = await prisma.task.create({
    data: {
      organizationId: org.id,
      taskIdDisplay: 'TSK-8421',
      title: 'Design System Migration & Audit',
      description: 'Audit legacy color codes, update Tailwind CSS configuration, and standardize typography scale across all room surfaces.',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      assigneeId: member1.id,
      creatorId: server1.id,
      campaignId: campaign1.id,
      estimatedHours: 12,
      allocatedHours: 8,
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      tags: ['Design System', 'Tailwind', 'Frontend'],
    },
  });

  await prisma.task.create({
    data: {
      organizationId: org.id,
      taskIdDisplay: 'TSK-8422',
      title: 'PostgreSQL Connection Pooling Optimization',
      description: 'Configure Prisma connection pool parameters to support 2,000 concurrent user loads without exhausting worker limits.',
      status: TaskStatus.SUBMITTED,
      priority: TaskPriority.CRITICAL,
      assigneeId: member2.id,
      creatorId: admin.id,
      campaignId: campaign2.id,
      estimatedHours: 8,
      allocatedHours: 8,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      tags: ['Database', 'PostgreSQL', 'Prisma'],
    },
  });

  // Task Comments
  await prisma.taskComment.create({
    data: {
      taskId: task1.id,
      authorId: server1.id,
      content: 'Please ensure high-contrast accessibility standards are met for tabular figures.',
    },
  });

  await prisma.taskComment.create({
    data: {
      taskId: task1.id,
      authorId: member1.id,
      content: 'All status badges and table borders have been aligned with the Stitch specifications.',
    },
  });

  console.log(`✓ Created initial tasks, campaigns, and comment feeds`);

  // 7. Create Announcements
  await prisma.announcement.create({
    data: {
      organizationId: org.id,
      title: 'Scheduled System Maintenance: Database Replica Scaling',
      content: 'All sections will undergo a brief read-only maintenance window on Saturday between 02:00 and 03:00 UTC for connection pool upgrades.',
      status: AnnouncementStatus.PUBLISHED,
      scope: AudienceScope.GLOBAL,
      authorId: superAdmin.id,
      pinned: true,
      publishedAt: new Date(),
    },
  });

  await prisma.announcement.create({
    data: {
      organizationId: org.id,
      title: 'Section B Operational Capacity Review',
      content: 'Section B subrooms are currently at 85% saturation. Leads are requested to audit pending task queues before scheduling additional campaigns.',
      status: AnnouncementStatus.PUBLISHED,
      scope: AudienceScope.ROOM_SPECIFIC,
      targetRoom: 'Room B',
      authorId: admin.id,
      pinned: false,
      publishedAt: new Date(),
    },
  });

  console.log(`✓ Created announcements (Global & Section-specific)`);

  // 8. Create Live Events for Operations Grid Telemetry
  const eventStartTime = new Date(now.getTime() - 1 * 3600000);
  const eventEndTime = new Date(now.getTime() + 2 * 3600000);

  const companyEvent = await prisma.event.create({
    data: {
      organizationId: org.id,
      title: 'Annual Company All-Hands & Strategy Briefing',
      description: 'Organization-wide review, leadership address, and infrastructure deployment sync.',
      scope: EventScope.COMPANY,
      status: EventStatus.ACTIVE,
      startTime: eventStartTime,
      endTime: eventEndTime,
      requiredServersCount: 3,
    },
  });

  await prisma.eventLocation.create({
    data: {
      eventId: companyEvent.id,
      name: 'Main Auditorium',
    },
  });

  await prisma.eventLocation.create({
    data: {
      eventId: companyEvent.id,
      name: 'Section B Briefing Room',
    },
  });

  await prisma.eventRequiredServer.create({
    data: {
      eventId: companyEvent.id,
      serverId: server1.id,
    },
  });

  // Room Event in Section B Subroom B4
  const roomEvent = await prisma.event.create({
    data: {
      organizationId: org.id,
      title: 'AI Infrastructure Workshop & Live Demo',
      description: 'Deep dive into GPU clustering and real-time streaming architectures.',
      scope: EventScope.ROOM,
      roomId: createdRooms['B'].id,
      subroomId: createdSubrooms['B4'].id,
      status: EventStatus.ACTIVE,
      startTime: eventStartTime,
      endTime: eventEndTime,
      requiredServersCount: 1,
    },
  });

  await prisma.eventLocation.create({
    data: {
      eventId: roomEvent.id,
      roomId: createdRooms['B'].id,
      subroomId: createdSubrooms['B4'].id,
      name: 'B4',
    },
  });

  await prisma.eventRequiredServer.create({
    data: {
      eventId: roomEvent.id,
      serverId: server1.id,
    },
  });

  console.log(`✓ Created live events with multi-location and server requirements`);

  // 9. Create 7-Day Weekly Availability Slots for member1
  const days = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
    DayOfWeek.SUNDAY,
  ];

  const slotsToCreate: any[] = [];
  for (const [dayIndex, day] of days.entries()) {
    const isWeekend = day === DayOfWeek.SATURDAY || day === DayOfWeek.SUNDAY;
    for (let hour = 0; hour < 24; hour++) {
      let state: SlotState = SlotState.UNAVAILABLE;
      let taskId: string | undefined = undefined;

      if (!isWeekend) {
        if (hour >= 9 && hour < 17) {
          if (dayIndex === 0 && hour >= 10 && hour < 14) {
            state = SlotState.BUSY;
            taskId = task1.id;
          } else if (hour === 9 || hour === 16) {
            state = SlotState.PREFERRED;
          } else {
            state = SlotState.AVAILABLE;
          }
        }
      }

      slotsToCreate.push({
        userId: member1.id,
        day,
        hour,
        state,
        taskId,
      });
    }
  }

  await prisma.availabilitySlot.createMany({
    data: slotsToCreate,
  });
  console.log(`✓ Generated 7-day 24h recurring availability schedule for Sarah Connor`);

  console.log('✅ WorkGrid seed finished successfully (7 authentic users)!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
