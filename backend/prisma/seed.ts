import { PrismaClient, UserRole, AccountStatus, UserStatus, TaskStatus, TaskPriority, AnnouncementStatus, AudienceScope, PresenceState, EventScope, EventStatus, EventResponseChoice } from '@prisma/client';
import bcrypt from 'bcryptjs';
import process from 'node:process';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting WorkGrid database seed (6 Core Authenticated Accounts)...');

  // 1. Clean existing records in reverse dependency order
  await prisma.eventParticipant.deleteMany();
  await prisma.eventRequiredServer.deleteMany();
  await prisma.eventLocation.deleteMany();
  await prisma.event.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.roleAuditLog.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.organizationEventResponse.deleteMany();
  await prisma.organizationEvent.deleteMany();
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

  // 3) Server (David Chen) — Section B Supervisor (Position 1)
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

  // 4) Member 1 (Sarah Connor) — Subroom B3
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

  // 5) Team Lead (Alex Rivera) — Subroom B3
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

  // 6) Pending Onboarding User (John Doe)
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
  for (const u of [superAdmin, admin, server1, member1, member2]) {
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
      targetUserId: member2.id,
      changedById: superAdmin.id,
      previousRole: UserRole.MEMBER,
      newRole: UserRole.TEAM_LEAD,
      reason: 'Provisioned as Infrastructure Specialist & Team Lead',
    },
  });

  console.log(`✓ Created 6 official authenticated accounts (Super Admin, Admin, Server, Member, Team Lead, Pending)`);

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

  // 9. Create demo Organization Events with attendance responses. This is
  // the actual availability model now — a person's attendance belongs to a
  // specific event, never to a generic day. Two events deliberately share
  // the same calendar date to demonstrate that their attendance is fully
  // independent: Sarah Connor is ATTENDING the conference but only MAYBE for
  // the mixer immediately afterward, on the very same day.
  const conferenceStart = new Date(now.getTime() + 3 * 24 * 3600000);
  conferenceStart.setUTCHours(4, 30, 0, 0); // 10:00 AM IST
  const conferenceEnd = new Date(conferenceStart);
  conferenceEnd.setUTCHours(12, 30, 0, 0); // 6:00 PM IST

  const mixerStart = new Date(conferenceStart);
  mixerStart.setUTCHours(13, 30, 0, 0); // 7:00 PM IST, same day
  const mixerEnd = new Date(conferenceStart);
  mixerEnd.setUTCHours(15, 30, 0, 0); // 9:00 PM IST

  const techConference = await prisma.organizationEvent.create({
    data: {
      organizationId: org.id,
      title: 'Cloud Infrastructure Summit',
      description: 'Annual company-wide technical conference covering platform scalability and reliability.',
      scheduledAt: conferenceStart,
      scheduledEndAt: conferenceEnd,
      createdById: superAdmin.id,
    },
  });

  const networkingMixer = await prisma.organizationEvent.create({
    data: {
      organizationId: org.id,
      title: 'Post-Summit Networking Mixer',
      description: 'Informal social mixer for attendees immediately following the summit.',
      scheduledAt: mixerStart,
      scheduledEndAt: mixerEnd,
      createdById: admin.id,
    },
  });

  await prisma.organizationEventResponse.createMany({
    data: [
      { eventId: techConference.id, userId: member1.id, response: EventResponseChoice.ATTENDING },
      { eventId: techConference.id, userId: member2.id, response: EventResponseChoice.ATTENDING },
      { eventId: techConference.id, userId: server1.id, response: EventResponseChoice.NOT_ATTENDING },
      { eventId: networkingMixer.id, userId: member1.id, response: EventResponseChoice.MAYBE },
      { eventId: networkingMixer.id, userId: member2.id, response: EventResponseChoice.ATTENDING },
    ],
  });

  console.log(`✓ Created 2 organization events (same day, independent attendance) with 5 responses`);

  // 10. Create two demo Teams — a standing MEMBER roster led by a Team Lead,
  // entirely independent of the Room/Subroom desk hierarchy above. Each team
  // has 24 members, more than a single Section can hold (16 = 8 subrooms x 2),
  // so the bulk-allocation "positioned vs. available pool" split has
  // something real to demonstrate and QA against.
  const teamAlphaLead = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'priya.natarajan@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Priya Natarajan',
      role: UserRole.TEAM_LEAD,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.ONLINE,
      presenceState: PresenceState.IN,
      currentLocationName: 'Main Auditorium',
      arrivedAt: arrivalTime,
      lastSeenAt: now,
      title: 'Team Alpha Lead',
      avatarUrl: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 10,
    },
  });

  const teamBetaLead = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'marcus.obi@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Marcus Obi',
      role: UserRole.TEAM_LEAD,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.ONLINE,
      presenceState: PresenceState.IN,
      currentLocationName: 'Main Auditorium',
      arrivedAt: arrivalTime,
      lastSeenAt: now,
      title: 'Team Beta Lead',
      avatarUrl: 'https://images.unsplash.com/photo-1552058544-f2b08422138a?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 8,
    },
  });

  const teamAlpha = await prisma.team.create({
    data: { organizationId: org.id, name: 'Team Alpha', leadId: teamAlphaLead.id },
  });
  const teamBeta = await prisma.team.create({
    data: { organizationId: org.id, name: 'Team Beta', leadId: teamBetaLead.id },
  });

  const rosterFirstNames = [
    'Nora', 'Kai', 'Leah', 'Theo', 'Ruby', 'Finn', 'Zara', 'Owen', 'Iris', 'Milo',
    'Nina', 'Jasper', 'Vera', 'Leon', 'Freya', 'Axel', 'Talia', 'Rhys', 'Wren', 'Dario',
    'Ines', 'Sami', 'Coral', 'Ezra', 'Yara', 'Beckett', 'Maren', 'Idris', 'Selma', 'Cyrus',
  ];
  const rosterLastNames = [
    'Whitfield', 'Osei', 'Kowalski', 'Marchetti', 'Delgado', 'Okafor', 'Lindgren', 'Petrov', 'Suzuki', 'Alvarado',
    'Beaumont', 'Nakashima', 'Farouk', 'Castellano', 'Brennan', 'Yilmaz', 'Adeyemi', 'Solheim', 'Vasquez', 'Renner',
  ];

  function rosterName(globalIndex: number): string {
    const first = rosterFirstNames[globalIndex % rosterFirstNames.length];
    const last = rosterLastNames[(globalIndex * 7 + 3) % rosterLastNames.length];
    return `${first} ${last}`;
  }

  async function seedTeamRoster(team: { id: string }, teamSlug: string, globalOffset: number, count: number) {
    for (let i = 0; i < count; i++) {
      const name = rosterName(globalOffset + i);
      // Stagger presence/status so the eligible pool demonstrably contains a
      // mix of live-available and currently-unavailable members.
      const presenceState = i % 4 === 0 ? PresenceState.OUT : PresenceState.IN;
      const status = i % 5 === 0 ? UserStatus.AWAY : i % 7 === 0 ? UserStatus.BUSY : UserStatus.ONLINE;
      await prisma.user.create({
        data: {
          organizationId: org.id,
          email: `${teamSlug}.roster${String(i + 1).padStart(2, '0')}@workgrid.corp`,
          passwordHash: defaultPasswordHash,
          name,
          role: UserRole.MEMBER,
          accountStatus: AccountStatus.ACTIVE,
          status,
          presenceState,
          currentLocationName: presenceState === PresenceState.IN ? 'Main Auditorium' : 'Outside',
          arrivedAt: presenceState === PresenceState.IN ? arrivalTime : undefined,
          lastSeenAt: now,
          title: 'Event Operations Associate',
          capacityLimitHours: 40,
          currentAllocatedHours: 0,
          teamId: team.id,
        },
      });
    }
  }

  await seedTeamRoster(teamAlpha, 'alpha', 0, 24);
  await seedTeamRoster(teamBeta, 'beta', 24, 24);

  console.log(`✓ Created 2 demo Teams (Team Alpha, Team Beta) with leads and 24 MEMBER rosters each`);

  console.log('✅ WorkGrid seed finished successfully (6 authentic users)!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
