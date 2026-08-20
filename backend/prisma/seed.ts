import { PrismaClient, UserRole, AccountStatus, UserStatus, TaskStatus, TaskPriority, AnnouncementStatus, AudienceScope, DayOfWeek, SlotState } from '@prisma/client';
import bcrypt from 'bcryptjs';
import process from 'node:process';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting WorkGrid database seed (Development / Demo Environment)...');

  // 1. Clean existing records in reverse dependency order
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

  // 3. Create Rooms A through H
  const roomLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const roomNames: Record<string, string> = {
    A: 'Sector A — Core Operations',
    B: 'Sector B — Infrastructure & Security',
    C: 'Sector C — Systems Architecture',
    D: 'Sector D — Frontend & UI Engineering',
    E: 'Sector E — Database & Scalability',
    F: 'Sector F — Network Operations',
    G: 'Sector G — Quality Assurance',
    H: 'Sector H — Global Strategy',
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

    // Create 8 Subrooms per Room (e.g. B1 through B8)
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
  console.log(`✓ Created 8 Rooms and 64 Subrooms (A1 through H8)`);

  // 4. Create Development/Demo Users with Hashed Passwords
  const defaultPasswordHash = await bcrypt.hash('password123', 10);

  // Super Admin (Global Administrative Authority)
  const superAdmin = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'elena.vance@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Elena Vance',
      role: UserRole.SUPER_ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.ONLINE,
      title: 'Global Operations Director',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 12,
    },
  });

  // Admin (Operational Administration)
  const admin = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'marcus.sterling@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Marcus Sterling',
      role: UserRole.ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.ONLINE,
      title: 'Operations & Resource Admin',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 24,
    },
  });

  // HR (People Management Authority)
  const hrUser = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'sarah.jenkins@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Sarah Jenkins',
      role: UserRole.HR,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.ONLINE,
      title: 'Head of People & Talent Operations',
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 8,
    },
  });

  // Server (Room/Event Supervisor for Room B)
  const server = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'david.chen@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'David Chen',
      role: UserRole.SERVER,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.BUSY,
      title: 'Supervisor (Sector B)',
      roomId: createdRooms['B'].id,
      subroomId: createdSubrooms['B1'].id,
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 32,
    },
  });

  // Assign Server as Lead for Room B
  await prisma.room.update({
    where: { id: createdRooms['B'].id },
    data: { leadServerId: server.id },
  });

  // Member 1 (Sarah Connor - Subroom B3)
  const member1 = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'sarah.connor@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Sarah Connor',
      role: UserRole.MEMBER,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.ONLINE,
      title: 'Senior Systems Engineer',
      roomId: createdRooms['B'].id,
      subroomId: createdSubrooms['B3'].id,
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 35,
      currentAllocatedHours: 28,
    },
  });

  // Member 2 / Team Lead (Alex Rivera - Subroom B3)
  const member2 = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'alex.rivera@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Alex Rivera',
      role: UserRole.TEAM_LEAD,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.ONLINE,
      title: 'Infrastructure Specialist & Team Lead',
      roomId: createdRooms['B'].id,
      subroomId: createdSubrooms['B3'].id,
      avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 36,
    },
  });

  // Member 3 (Maya Patel - Subroom B2)
  const member3 = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'maya.patel@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Maya Patel',
      role: UserRole.MEMBER,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.BUSY,
      title: 'Security Analyst',
      roomId: createdRooms['B'].id,
      subroomId: createdSubrooms['B2'].id,
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 38,
    },
  });

  // Member 4 (Liam Vance - Subroom B4)
  const member4 = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'liam.vance@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'Liam Vance',
      role: UserRole.MEMBER,
      accountStatus: AccountStatus.ACTIVE,
      status: UserStatus.OFFLINE,
      title: 'QA Engineer',
      roomId: createdRooms['B'].id,
      subroomId: createdSubrooms['B4'].id,
      avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
      capacityLimitHours: 40,
      currentAllocatedHours: 15,
    },
  });

  // Pending Onboarding User (John Doe - Awaiting HR Role Assignment & Activation)
  const pendingUser = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: 'john.doe@workgrid.corp',
      passwordHash: defaultPasswordHash,
      name: 'John Doe',
      accountStatus: AccountStatus.PENDING,
      status: UserStatus.OFFLINE,
      title: 'Junior DevOps Engineer (Onboarding)',
      capacityLimitHours: 40,
      currentAllocatedHours: 0,
    },
  });

  // Demo Role Audit Log Entry (Super Admin provisioned HR user)
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

  console.log(`✓ Created demo users (Super Admin, Admin, HR, Team Lead, Server, Members, Pending User)`);

  // 5. Create Task Campaigns
  const campaign1 = await prisma.taskCampaign.create({
    data: {
      organizationId: org.id,
      title: 'Q3 Core UX & Design System Modernization',
      description: 'Standardize enterprise UI, tabular layout, and high-density components across all 8 sectors.',
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
      creatorId: server.id,
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

  await prisma.task.create({
    data: {
      organizationId: org.id,
      taskIdDisplay: 'TSK-8423',
      title: 'Redis Rate Limiting & Auth Token Rotation',
      description: 'Implement rotating refresh tokens with strict rate limits per IP and user session.',
      status: TaskStatus.ASSIGNED,
      priority: TaskPriority.MEDIUM,
      assigneeId: member1.id,
      creatorId: server.id,
      estimatedHours: 6,
      allocatedHours: 4,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      tags: ['Security', 'Redis', 'Auth'],
    },
  });

  await prisma.task.create({
    data: {
      organizationId: org.id,
      taskIdDisplay: 'TSK-8424',
      title: 'Subroom Capacity Exceeded Policy Guard',
      description: 'Transactional rejection on any membership writes that attempt to exceed the configured member limit.',
      status: TaskStatus.BLOCKED,
      priority: TaskPriority.HIGH,
      assigneeId: member3.id,
      creatorId: admin.id,
      estimatedHours: 10,
      allocatedHours: 5,
      dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
      tags: ['Backend', 'Policies', 'Transactions'],
    },
  });

  await prisma.task.create({
    data: {
      organizationId: org.id,
      taskIdDisplay: 'TSK-8425',
      title: 'Global Announcement Broadcast Verification',
      description: 'Ensure Super Admin announcements propagate through SSE and Redis pub/sub to all active presence sessions.',
      status: TaskStatus.COMPLETED,
      priority: TaskPriority.LOW,
      assigneeId: member1.id,
      creatorId: superAdmin.id,
      estimatedHours: 4,
      allocatedHours: 4,
      dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      tags: ['PubSub', 'Announcements'],
    },
  });

  // Task Comments
  await prisma.taskComment.create({
    data: {
      taskId: task1.id,
      authorId: server.id,
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
      content: 'All sectors will undergo a brief read-only maintenance window on Saturday between 02:00 and 03:00 UTC for connection pool upgrades.',
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
      title: 'Sector B Operational Capacity Review',
      content: 'Sector B subrooms are currently at 85% saturation. Leads are requested to audit pending task queues before scheduling additional campaigns.',
      status: AnnouncementStatus.PUBLISHED,
      scope: AudienceScope.ROOM_SPECIFIC,
      targetRoom: 'Room B',
      authorId: admin.id,
      pinned: false,
      publishedAt: new Date(),
    },
  });

  await prisma.announcement.create({
    data: {
      organizationId: org.id,
      title: 'Upcoming Q4 Task Priority Guidelines',
      content: 'Drafting new priority assignment criteria for high-load campaigns across Rooms E through H.',
      status: AnnouncementStatus.DRAFT,
      scope: AudienceScope.ADMINS_ONLY,
      authorId: superAdmin.id,
      pinned: false,
    },
  });
  console.log(`✓ Created announcements (Global, Sector-specific, and Drafts)`);

  // 8. Create 7-Day Weekly Availability Slots for member1
  const days = [
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
    DayOfWeek.SUNDAY,
  ];

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

      await prisma.availabilitySlot.create({
        data: {
          userId: member1.id,
          day,
          hour,
          state,
          taskId,
        },
      });
    }
  }
  console.log(`✓ Generated 7-day 24h recurring availability schedule for Sarah Connor`);

  console.log('✅ WorkGrid seed finished successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
