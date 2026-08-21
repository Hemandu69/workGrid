import { SupervisoryPosition } from '../utils/server-positioning.js';

export type SimulatedRole = 'SERVER' | 'MEMBER' | 'TEAM_LEAD';
export type SimulatedPresenceState = 'IN' | 'OUT' | 'UNKNOWN';
export type SimulatedAvailabilityState = 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE';

export interface SimulatedPerson {
  id: string;
  name: string;
  email: string;
  role: SimulatedRole;
  sectionLetter: string; // 'B'
  subroomCode: string; // 'B1', 'B2', 'B3', 'B4', 'B5'
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
  isSimulated: true;
}

const INITIAL_SIMULATED_PERSONNEL: SimulatedPerson[] = [
  // 1) Simulated Server (Maya Lin) -> Pos 3
  {
    id: 'sim-maya-lin',
    name: 'Maya Lin',
    email: 'maya.lin@workgrid.corp',
    role: 'SERVER',
    sectionLetter: 'B',
    subroomCode: 'B3',
    title: 'Simulated Supervisor (Pos 3)',
    preferredServerPosition: 3,
    presenceState: 'IN',
    attendanceState: 'IN',
    availabilityState: 'FREE',
    arrivedAtIST: '08:00 AM',
    lastSeenIST: 'Just now',
    durationInWorkGrid: '4h 15m',
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    isSimulated: true,
  },
  // 2) Simulated Server (Alex Mercer) -> Pos 5
  {
    id: 'sim-alex-mercer',
    name: 'Alex Mercer',
    email: 'alex.mercer@workgrid.corp',
    role: 'SERVER',
    sectionLetter: 'B',
    subroomCode: 'B5',
    title: 'Simulated Supervisor (Pos 5)',
    preferredServerPosition: 5,
    presenceState: 'IN',
    attendanceState: 'IN',
    availabilityState: 'FREE',
    arrivedAtIST: '08:15 AM',
    lastSeenIST: 'Just now',
    durationInWorkGrid: '4h 00m',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
    isSimulated: true,
  },
  // 3) Simulated Member (Maya Patel) -> Subroom B2
  {
    id: 'sim-maya-patel',
    name: 'Maya Patel',
    email: 'maya.patel@workgrid.corp',
    role: 'MEMBER',
    sectionLetter: 'B',
    subroomCode: 'B2',
    title: 'Security Analyst',
    presenceState: 'IN',
    attendanceState: 'IN',
    availabilityState: 'BUSY',
    activeTaskId: 'TSK-8424',
    activeTaskTitle: 'Subroom Capacity Exceeded Policy Guard',
    arrivedAtIST: '07:52 AM',
    lastSeenIST: 'Just now',
    durationInWorkGrid: '4h 23m',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    isSimulated: true,
  },
  // 4) Simulated Member (James Wilson) -> Subroom B2
  {
    id: 'sim-james-wilson',
    name: 'James Wilson',
    email: 'james.wilson@workgrid.corp',
    role: 'MEMBER',
    sectionLetter: 'B',
    subroomCode: 'B2',
    title: 'Site Reliability Engineer',
    presenceState: 'IN',
    attendanceState: 'IN',
    availabilityState: 'FREE',
    activeTaskId: 'TSK-8422',
    activeTaskTitle: 'PostgreSQL Connection Pooling Optimization',
    arrivedAtIST: '08:30 AM',
    lastSeenIST: 'Just now',
    durationInWorkGrid: '3h 45m',
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
    isSimulated: true,
  },
  // 5) Simulated Member (Liam Vance) -> Subroom B4
  {
    id: 'sim-liam-vance',
    name: 'Liam Vance',
    email: 'liam.vance@workgrid.corp',
    role: 'MEMBER',
    sectionLetter: 'B',
    subroomCode: 'B4',
    title: 'QA Engineer',
    presenceState: 'OUT',
    attendanceState: 'OUT',
    availabilityState: 'UNAVAILABLE',
    activeTaskId: 'TSK-8425',
    activeTaskTitle: 'Global Announcement Broadcast Verification',
    leftAtIST: '11:30 AM',
    lastSeenIST: '11:30 AM',
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    isSimulated: true,
  },
];

class SimulationStore {
  private personnel: Map<string, SimulatedPerson> = new Map();

  constructor() {
    this.reset();
  }

  reset(): SimulatedPerson[] {
    this.personnel.clear();
    for (const p of INITIAL_SIMULATED_PERSONNEL) {
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
