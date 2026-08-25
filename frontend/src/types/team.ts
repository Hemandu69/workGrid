import { User } from './auth';

export interface Team {
  id: string;
  name: string;
  lead: User | null;
  memberCount: number;
  allocatedSection?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamDetail {
  id: string;
  name: string;
  lead: User | null;
  members: User[];
  createdAt: string;
  updatedAt: string;
}

export interface PlacementMember extends User {
  needsReplacement: boolean;
}

export interface PlacementSubroomSummary {
  subroomCode: string;
  capacity: number;
  placedCount: number;
  members: PlacementMember[];
}

export interface TeamPlacementPreview {
  team: { id: string; name: string; lead: User | null };
  event: { id: string; title: string };
  section: { letter: string; roomId: string };
  subrooms: PlacementSubroomSummary[];
  totalPositioned: number;
  totalCapacity: number;
  totalTeamMembers: number;
  pool: User[];
  poolCount: number;
  /** Non-null when the team is currently positioned in a DIFFERENT section for this event. */
  currentSectionLetter: string | null;
}
