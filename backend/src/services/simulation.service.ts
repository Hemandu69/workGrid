import { SupervisoryPosition } from '../utils/server-positioning.js';

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
  presenceState: SimulatedPresenceState;
  attendanceState: 'IN' | 'OUT';
  availabilityState: SimulatedAvailabilityState;
  preferredServerPosition?: SupervisoryPosition;
  activeTaskId?: string;
  activeTaskTitle?: string;
  arrivedAtIST?: string;
  leftAtIST?: string;
  lastSeenIST: string;
  durationInWorkGrid?: string;
  capacityLimitHours: number;
  currentAllocatedHours: number;
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
 * Builds the complete deterministic simulation dataset:
 * - 128 Simulated Members (8 sections x 8 subrooms x 2 members)
 * - 24 Simulated Servers (8 sections x 3 servers @ positions 1, 3, 5)
 */
function buildInitialSimulationDataset(): SimulatedPerson[] {
  const sections = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const dataset: SimulatedPerson[] = [];

  let memberIndex = 0;
  let serverIndex = 0;

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

      // Specific named supervisors for Section B
      let displayName = fullName;
      if (section === 'B') {
        if (pos === 1) displayName = 'Karan Shah';
        if (pos === 3) displayName = 'Maya Lin';
        if (pos === 5) displayName = 'Alex Mercer';
      }

      // Initial presence: almost all IN for rich initial state
      const isOut = (secIdx === 3 && pos === 5) || (secIdx === 6 && pos === 3); // 2 servers initially OUT for variety
      const presenceState: SimulatedPresenceState = isOut ? 'OUT' : 'IN';
      const attendanceState: 'IN' | 'OUT' = isOut ? 'OUT' : 'IN';
      const availabilityState: SimulatedAvailabilityState = isOut ? 'UNAVAILABLE' : 'FREE';

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
        arrivedAtIST: isOut ? undefined : `08:${(posIdx * 15).toString().padStart(2, '0')} AM`,
        leftAtIST: isOut ? '11:00 AM' : undefined,
        lastSeenIST: isOut ? '11:00 AM' : 'Just now',
        durationInWorkGrid: isOut ? undefined : `${4 + posIdx}h 15m`,
        capacityLimitHours: 40,
        currentAllocatedHours: 20 + posIdx * 4,
        isSimulated: true,
      });
      serverIndex++;
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

        // Specific named fixtures for Section B to preserve familiar test personas
        let displayName = fullName;
        if (section === 'B') {
          if (subroomNum === 2 && slotNum === 1) displayName = 'Maya Patel';
          if (subroomNum === 2 && slotNum === 2) displayName = 'James Wilson';
          if (subroomNum === 4 && slotNum === 1) displayName = 'Liam Vance';
        }

        // Realistic deterministic presence mixture:
        // ~80% IN (mixture of BUSY and FREE), ~20% OUT
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

        const arrMin = ((subroomNum * 7 + slotNum * 13) % 45).toString().padStart(2, '0');
        const arrivedAtIST = isOut ? undefined : `08:${arrMin} AM`;

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
          arrivedAtIST,
          leftAtIST: isOut ? '11:15 AM' : undefined,
          lastSeenIST: isOut ? '11:15 AM' : 'Just now',
          durationInWorkGrid: isOut ? undefined : `${3 + (subroomNum % 3)}h ${arrMin}m`,
          capacityLimitHours: 40,
          currentAllocatedHours: hasTask ? 28 : 12,
          isSimulated: true,
        });

        memberIndex++;
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

  reset(): SimulatedPerson[] {
    this.personnel.clear();
    const dataset = buildInitialSimulationDataset();
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

  updatePresence(id: string, presenceState: SimulatedPresenceState): SimulatedPerson {
    const person = this.personnel.get(id);
    if (!person) {
      throw new Error(`Simulated person with ID ${id} not found.`);
    }

    person.presenceState = presenceState;
    person.attendanceState = presenceState === 'IN' ? 'IN' : 'OUT';
    if (presenceState === 'IN') {
      person.availabilityState = person.activeTaskId ? 'BUSY' : 'FREE';
      person.arrivedAtIST = person.arrivedAtIST || 'Just now';
      person.leftAtIST = undefined;
      person.lastSeenIST = 'Just now';
    } else {
      person.availabilityState = 'UNAVAILABLE';
      person.leftAtIST = 'Just now';
      person.lastSeenIST = 'Just now';
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

  static updateSimulatedPersonState(id: string, presenceState: SimulatedPresenceState): SimulatedPerson {
    return simulationStore.updatePresence(id, presenceState);
  }

  static resetSimulation(): SimulatedPerson[] {
    return simulationStore.reset();
  }
}
