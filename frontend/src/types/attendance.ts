export type AttendanceState = 'IN' | 'OUT';

export interface AttendanceSession {
  id: string;
  arrivedAt: string;
  arrivedAtIST: string;
  leftAt: string | null;
  leftAtIST: string | null;
  durationSeconds: number;
  durationFormatted: string;
}

export interface AttendanceMeResponse {
  state: AttendanceState;
  presenceState: 'IN' | 'OUT' | 'UNKNOWN';
  availabilityState: 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE' | 'MEAL';
  availabilityLabel: string;
  currentSession: {
    id: string;
    arrivedAt: string;
    arrivedAtIST: string;
    durationSeconds: number;
  } | null;
  todaySummary: {
    totalSeconds: number;
    totalFormatted: string;
    sessionCount: number;
    firstArrivedAt?: string;
    firstArrivedAtIST?: string;
    lastLeftAt?: string;
    lastLeftAtIST?: string;
  };
  recentSessions: AttendanceSession[];
}

export interface AttendanceDayGroup {
  date: string;
  dateFormatted: string;
  totalSeconds: number;
  totalFormatted: string;
  sessions: AttendanceSession[];
}

export interface AttendanceHistoryResponse {
  userId: string;
  userName: string;
  totalDays: number;
  history: AttendanceDayGroup[];
}

export interface AttendanceOverviewPerson {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  title?: string;
  avatarUrl?: string;
  room?: string;
  subroom?: string;
  presenceState: 'IN' | 'OUT' | 'UNKNOWN';
  isCurrentlyIn: boolean;
  arrivedAt?: string;
  arrivedAtIST?: string;
  leftAt?: string;
  leftAtIST?: string;
  currentDurationSeconds: number;
  currentDurationFormatted: string;
  todayTotalSeconds: number;
  todayTotalFormatted: string;
  sessionCount: number;
}

export interface AttendanceOverviewResponse {
  stats: {
    totalActiveUsers: number;
    totalPresentIn: number;
    totalPresentOut: number;
  };
  people: AttendanceOverviewPerson[];
}
