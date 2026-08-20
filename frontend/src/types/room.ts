import { User } from './auth';

export type RoomLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export interface Subroom {
  id: string; // e.g. 'B3'
  roomLetter: RoomLetter;
  subroomNumber: number; // 1 - 8
  name: string; // e.g. 'Subroom B3'
  memberCapacity: number; // default: 2
  membersCount: number;
  serverSeatCount: number; // default: 1
  serverPresent: boolean;
  serverUser?: User;
  members: User[];
  status: 'OPTIMAL' | 'NEAR_CAPACITY' | 'FULL' | 'UNDERUTILIZED';
}

export interface Room {
  id: string; // e.g. 'Room B'
  letter: RoomLetter;
  name: string;
  leadServer?: User;
  subrooms: Subroom[];
  totalMembers: number;
  totalCapacity: number;
  occupancyPercentage: number;
}
