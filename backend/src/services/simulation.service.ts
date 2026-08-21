import { SupervisoryPosition } from '../utils/server-positioning.js';
import { formatToISTTime } from '../utils/time.js';

export type SimulatedRole = 'SERVER' | 'MEMBER' | 'TEAM_LEAD';
export type SimulatedPresenceState = 'IN' | 'OUT' | 'UNKNOWN';
export type SimulatedAvailabilityState = 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE';

export interface SimulatedPerson {
  id: string;
  name: string;
  email: string;
  role: SimulatedRole;
  sectionLetter: string; // 'A' .. 'H'
  subroomCode: string; // e.g. 'A1' .. 'H8'
  avatarUrl?: string;
  title: string;

  // Authoritative mutable state
  presenceState: SimulatedPresenceState;
  attendanceState: 'IN' | 'OUT';
  availabilityState: SimulatedAvailabilityState;

  // Authoritative timestamps (Date objects)
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  lastSeenAt: Date;

  // Task & Workload metadata
  activeTaskId?: string;
  activeTaskTitle?: string;
  capacityLimitHours: number;
  currentAllocatedHours: number;

  preferredServerPosition?: SupervisoryPosition;
  isSimulated: true;
}

const FIRST_NAMES = [
  'Aarav', 'Riya', 'Arjun', 'Neha', 'Rohan', 'Ananya', 'Vikram', 'Priya',
  'Dev', 'Kavya', 'Siddharth', 'Pooja', 'Kabir', 'Sneha', 'Aditya', 'Meera',
  'Ishaan', 'Tanvi', 'Kunal', 'Shruti', 'Varun', 'Deepika', 'Rahul', 'Isha',
  'Manish', 'Simran', 'Akash', 'Divya', 'Nikhil', 'Swati', 'Harsh', 'Anushka',
  'Sameer', 'Preeti', 'Gaurav', 'Shreya', 'Amit', 'Payal', 'Rajesh', 'Komal',
  'Yash', 'Bhavna', 'Pranav', 'Roshni', 'Vivek', 'Nidhi', 'Alok', 'Pallavi',
  'Sanjay', 'Geeta', 'Chetan', 'Ritika', 'Manoj', 'Jyoti', 'Tarun', 'Monika',
  'Kiran', 'Radhika', 'Abhay', 'Natasha', 'Ashwin', 'Vidya', 'Deepak', 'Sonia'
];

const LAST_NAMES = [
  'Mehta', 'Sharma', 'Kapoor', 'Verma', 'Gupta', 'Das', 'Joshi', 'Nair',
  'Patel', 'Reddy', 'Rao', 'Iyer', 'Malhotra', 'Choudhury', 'Sen', 'Bhatt',
  'Saxena', 'Deshmukh', 'Chopra', 'Menon', 'Bansal', 'Bose', 'Mishra', 'Pillai',
  'Chatterjee', 'Kulkarni', 'Agarwal', 'Thakur', 'Nambiar', 'Ghosh', 'Pandey', 'Dutta',
  'Venkatesh', 'Chauhan', 'Singhania', 'Sinha', 'Mukherjee', 'Mahajan', 'Trivedi', 'Kaul',
  'Dubey', 'Sengupta', 'Prasad', 'Ranganathan', 'Bhatia', 'Subramanian', 'Gokhale', 'Seth',
  'Tyagi', 'Puri', 'Sarin', 'Trehan', 'Kohli', 'Chawla', 'Ahluwalia', 'Sodhi',
  'Oberoi', 'Bakshi', 'Suri', 'Luthra', 'Khosla', 'Grover', 'Dhawan', 'Sawhney'
];

const MEMBER_TITLES = [
  'Systems Reliability Engineer',
  'Core Backend Engineer',
  'Frontend UI Architect',
  'Cloud Infrastructure Specialist',
  'Security Operations Analyst',
  'Data Pipeline Engineer',
  'DevOps Automation Engineer',
  'QA Automation Lead',
  'Network Operations Engineer',
  'Database Performance Analyst',
];

const TASK_TEMPLATES = [
  { idPrefix: 'TSK', title: 'PostgreSQL Connection Pooling Optimization' },
  { idPrefix: 'TSK', title: 'Subroom Capacity Exceeded Policy Guard' },
  { idPrefix: 'TSK', title: 'Global Announcement Broadcast Verification' },
  { idPrefix: 'TSK', title: 'Socket.IO Cluster Heartbeat Telemetry' },
  { idPrefix: 'TSK', title: 'Tailwind Design System Token Migration' },
  { idPrefix: 'TSK', title: 'Prisma Transaction Deadlock Prevention' },
  { idPrefix: 'TSK', title: 'Multi-Room Supervisory Telemetry Sync' },
  { idPrefix: 'TSK', title: 'Session Cookie Cross-Site Partition Audit' },
];

const AVATAR_URLS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
];

/**
 * Builds the initial stateful simulation dataset relative to wall-clock time
 */
function buildInitialSimulationDataset(now: Date = new Date()): SimulatedPerson[] {
  const sections = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const dataset: SimulatedPerson[] = [];

  for (const [secIdx, section] of sections.entries()) {
    // 1. Generate 3 Simulated Servers per Section (Positions 1, 3, 5)
    const serverPositions: SupervisoryPosition[] = [1, 3, 5];
    for (const [posIdx, pos] of serverPositions.entries()) {
      const srvId = `sim-server-${section.toLowerCase()}-0${pos}`;
      const fName = FIRST_NAMES[(secIdx * 7 + posIdx * 3 + 12) % FIRST_NAMES.length];
      const lName = LAST_NAMES[(secIdx * 5 + posIdx * 4 + 7) % LAST_NAMES.length];
      const fullName = `${fName} ${lName}`;
      const email = `server.${section.toLowerCase()}${pos}@workgrid.corp`;
      const avatarUrl = AVATAR_URLS[(secIdx * 3 + posIdx) % AVATAR_URLS.length];

      let displayName = fullName;
      if (section === 'B') {
        if (pos === 1) displayName = 'Karan Shah';
        if (pos === 3) displayName = 'Maya Lin';
        if (pos === 5) displayName = 'Alex Mercer';
      }

      // Initial presence configuration
      const isOut = (secIdx === 3 && pos === 5) || (secIdx === 6 && pos === 3);
      const presenceState: SimulatedPresenceState = isOut ? 'OUT' : 'IN';
      const attendanceState: 'IN' | 'OUT' = isOut ? 'OUT' : 'IN';
      const availabilityState: SimulatedAvailabilityState = isOut ? 'UNAVAILABLE' : 'FREE';

      const initialElapsedMs = (180 + posIdx * 20) * 60 * 1000;
      const checkedInAt = isOut ? new Date(now.getTime() - 4 * 3600000) : new Date(now.getTime() - initialElapsedMs);
      const checkedOutAt = isOut ? new Date(now.getTime() - 1 * 3600000) : null;
      const lastSeenAt = isOut ? checkedOutAt! : now;

      dataset.push({
        id: srvId,
        name: displayName,
        email,
        role: 'SERVER',
        sectionLetter: section,
        subroomCode: `${section}${pos}`,
        avatarUrl,
        title: `Supervisor (Section ${section} - Pos ${pos})`,
        presenceState,
        attendanceState,
        availabilityState,
        preferredServerPosition: pos,
        checkedInAt,
        checkedOutAt,
        lastSeenAt,
        capacityLimitHours: 40,
        currentAllocatedHours: 20 + posIdx * 4,
        isSimulated: true,
      });
    }

    // 2. Generate 16 Simulated Members per Section (2 members per subroom x 8 subrooms)
    for (let subroomNum = 1; subroomNum <= 8; subroomNum++) {
      const subroomCode = `${section}${subroomNum}`;

      for (let slotNum = 1; slotNum <= 2; slotNum++) {
        const memId = `sim-member-${section.toLowerCase()}${subroomNum}-0${slotNum}`;
        const nameIdx = (secIdx * 16 + (subroomNum - 1) * 2 + (slotNum - 1)) % FIRST_NAMES.length;
        const fName = FIRST_NAMES[nameIdx];
        const lName = LAST_NAMES[(nameIdx + 5) % LAST_NAMES.length];
        const fullName = `${fName} ${lName}`;
        const email = `${fName.toLowerCase()}.${lName.toLowerCase()}@workgrid.corp`;
        const avatarUrl = AVATAR_URLS[(nameIdx + slotNum) % AVATAR_URLS.length];
        const title = MEMBER_TITLES[(secIdx + subroomNum + slotNum) % MEMBER_TITLES.length];

        let displayName = fullName;
        if (section === 'B') {
          if (subroomNum === 2 && slotNum === 1) displayName = 'Maya Patel';
          if (subroomNum === 2 && slotNum === 2) displayName = 'James Wilson';
          if (subroomNum === 4 && slotNum === 1) displayName = 'Liam Vance';
        }

        const isOut = (subroomNum === 4 && slotNum === 1) || ((secIdx + subroomNum + slotNum) % 7 === 0);
        const presenceState: SimulatedPresenceState = isOut ? 'OUT' : 'IN';
        const attendanceState: 'IN' | 'OUT' = isOut ? 'OUT' : 'IN';

        const hasTask = !isOut && (subroomNum % 2 === 0 || slotNum === 1);
        const taskTpl = hasTask ? TASK_TEMPLATES[(secIdx + subroomNum + slotNum) % TASK_TEMPLATES.length] : null;
        const taskId = taskTpl ? `${taskTpl.idPrefix}-${8400 + (secIdx * 16 + subroomNum * 2 + slotNum)}` : undefined;
        const taskTitle = taskTpl ? taskTpl.title : undefined;

        let availabilityState: SimulatedAvailabilityState = 'FREE';
        if (isOut) {
          availabilityState = 'UNAVAILABLE';
        } else if (hasTask) {
          availabilityState = (secIdx + subroomNum) % 3 === 0 ? 'PARTIALLY_AVAILABLE' : 'BUSY';
        }

        const initialElapsedMs = (120 + ((subroomNum * 13 + slotNum * 17) % 150)) * 60 * 1000;
        const checkedInAt = isOut ? new Date(now.getTime() - 4 * 3600000) : new Date(now.getTime() - initialElapsedMs);
        const checkedOutAt = isOut ? new Date(now.getTime() - 1 * 3600000) : null;
        const lastSeenAt = isOut ? checkedOutAt! : now;

        dataset.push({
          id: memId,
          name: displayName,
          email,
          role: 'MEMBER',
          sectionLetter: section,
          subroomCode,
          avatarUrl,
          title,
          presenceState,
          attendanceState,
          availabilityState,
          activeTaskId: taskId,
          activeTaskTitle: taskTitle,
          checkedInAt,
          checkedOutAt,
          lastSeenAt,
          capacityLimitHours: 40,
          currentAllocatedHours: hasTask ? 28 : 12,
          isSimulated: true,
        });
      }
    }
  }

  return dataset;
}

class SimulationStore {
  private personnel: Map<string, SimulatedPerson> = new Map();

  constructor() {
    this.reset();
  }

  reset(now: Date = new Date()): SimulatedPerson[] {
    this.personnel.clear();
    const dataset = buildInitialSimulationDataset(now);
    for (const p of dataset) {
      this.personnel.set(p.id, { ...p });
    }
    return this.getAll();
  }

  getAll(): SimulatedPerson[] {
    return Array.from(this.personnel.values());
  }

  getById(id: string): SimulatedPerson | undefined {
    return this.personnel.get(id);
  }

  updatePresence(id: string, presenceState: SimulatedPresenceState, asOf: Date = new Date()): SimulatedPerson {
    const person = this.personnel.get(id);
    if (!person) {
      throw new Error(`Simulated person with ID ${id} not found.`);
    }

    if (presenceState === 'IN') {
      person.presenceState = 'IN';
      person.attendanceState = 'IN';
      person.availabilityState = person.activeTaskId ? 'BUSY' : 'FREE';
      person.checkedInAt = asOf;
      person.checkedOutAt = null;
      person.lastSeenAt = asOf;
    } else {
      person.presenceState = 'OUT';
      person.attendanceState = 'OUT';
      person.availabilityState = 'UNAVAILABLE';
      person.checkedOutAt = asOf;
      person.lastSeenAt = asOf;
    }

    return { ...person };
  }
}

export const simulationStore = new SimulationStore();

export class SimulationService {
  static getSimulatedPersons(): SimulatedPerson[] {
    return simulationStore.getAll();
  }

  static getSimulatedPerson(id: string): SimulatedPerson | undefined {
    return simulationStore.getById(id);
  }

  static updateSimulatedPersonState(id: string, presenceState: SimulatedPresenceState, asOf?: Date): SimulatedPerson {
    return simulationStore.updatePresence(id, presenceState, asOf);
  }

  static resetSimulation(now?: Date): SimulatedPerson[] {
    return simulationStore.reset(now);
  }

  /**
   * Computes live duration string dynamically based on checkedInAt and checkedOutAt relative to now
   */
  static getFormattedDuration(person: SimulatedPerson, now: Date = new Date()): string | undefined {
    if (!person.checkedInAt) return undefined;

    let diffMs = 0;
    if (person.presenceState === 'IN') {
      diffMs = Math.max(0, now.getTime() - person.checkedInAt.getTime());
    } else if (person.checkedOutAt) {
      diffMs = Math.max(0, person.checkedOutAt.getTime() - person.checkedInAt.getTime());
    } else {
      return undefined;
    }

    const hours = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `0m ${secs}s`;
  }
}
