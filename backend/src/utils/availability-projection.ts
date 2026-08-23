import { PresenceState, UserStatus } from '@prisma/client';

/**
 * The operational availability states projected by every WorkGrid surface
 * (Operations Grid, People Availability, drawers, dashboards, KPIs). MEAL is a
 * temporary, reversible, self-only state (Lunch/Dinner — the frontend decides
 * which label to show) — the person remains checked in throughout.
 */
export type AvailabilityState = 'FREE' | 'BUSY' | 'PARTIALLY_AVAILABLE' | 'UNAVAILABLE' | 'MEAL';

export const AVAILABILITY_STATES: AvailabilityState[] = [
  'FREE',
  'BUSY',
  'PARTIALLY_AVAILABLE',
  'UNAVAILABLE',
  'MEAL',
];

/**
 * `User.status` is the authoritative STORED operational availability.
 * The existing `UserStatus` enum already covers these states exactly, so no
 * schema change is required to represent them:
 *
 *   FREE                ↔ ONLINE
 *   BUSY                ↔ BUSY
 *   PARTIALLY_AVAILABLE ↔ AWAY
 *   UNAVAILABLE         ↔ OFFLINE
 *   MEAL                ↔ MEAL
 */
export function availabilityFromUserStatus(status: UserStatus | string | null | undefined): AvailabilityState {
  switch (status) {
    case UserStatus.ONLINE:
    case 'ONLINE':
      return 'FREE';
    case UserStatus.BUSY:
    case 'BUSY':
      return 'BUSY';
    case UserStatus.AWAY:
    case 'AWAY':
      return 'PARTIALLY_AVAILABLE';
    case UserStatus.MEAL:
    case 'MEAL':
      return 'MEAL';
    default:
      return 'UNAVAILABLE';
  }
}

export function userStatusFromAvailability(state: AvailabilityState): UserStatus {
  switch (state) {
    case 'FREE':
      return UserStatus.ONLINE;
    case 'BUSY':
      return UserStatus.BUSY;
    case 'PARTIALLY_AVAILABLE':
      return UserStatus.AWAY;
    case 'MEAL':
      return UserStatus.MEAL;
    default:
      return UserStatus.OFFLINE;
  }
}

export function isPresent(state: PresenceState | string | null | undefined): boolean {
  return state === PresenceState.IN || state === 'IN';
}

export const AVAILABILITY_LABELS: Record<AvailabilityState, string> = {
  FREE: 'Free',
  BUSY: 'Busy',
  PARTIALLY_AVAILABLE: 'Partially Available',
  UNAVAILABLE: 'Unavailable',
  MEAL: 'Meal',
};

export interface AvailabilityProjection {
  /** Operational state every authorized surface must display. */
  state: AvailabilityState;
  label: string;
  reason: string;
  /** The stored state, retained while OUT so checking back IN restores it. */
  storedState: AvailabilityState;
  /** True when presence — not the stored state — forced UNAVAILABLE. */
  suppressedByPresence: boolean;
}

export interface AvailabilityProjectionInput {
  presenceState: PresenceState | string | null | undefined;
  /** Derived from the person's stored `User.status`. */
  storedState: AvailabilityState;
  activeTaskLabel?: string | null;
  /** Where the person sits when present, e.g. "B3" — used for the reason text. */
  locationLabel?: string | null;
}

/**
 * The ONE derivation every projection must use.
 *
 * Presence is dominant: a person who is not checked IN is UNAVAILABLE and
 * located "Outside" no matter what their stored availability says. This is the
 * rule that stops a checked-out person from still rendering as FREE in B2.
 * Their stored state is carried through untouched so that checking back IN
 * restores exactly the availability they had before leaving.
 */
export function deriveAvailability(input: AvailabilityProjectionInput): AvailabilityProjection {
  const { storedState, activeTaskLabel, locationLabel } = input;

  if (!isPresent(input.presenceState)) {
    const isUnknown = input.presenceState !== PresenceState.OUT && input.presenceState !== 'OUT';
    return {
      state: 'UNAVAILABLE',
      label: AVAILABILITY_LABELS.UNAVAILABLE,
      reason: isUnknown ? 'Presence unknown — not checked in' : 'Checked out / off-duty',
      storedState,
      suppressedByPresence: true,
    };
  }

  let reason: string;
  if (storedState === 'MEAL') {
    reason = 'Checked in — Lunch/Dinner';
  } else if (storedState === 'BUSY') {
    reason = activeTaskLabel ? `Active Task: ${activeTaskLabel}` : 'Marked busy';
  } else if (storedState === 'PARTIALLY_AVAILABLE') {
    reason = activeTaskLabel ? `Partially free alongside ${activeTaskLabel}` : 'Partially available';
  } else if (storedState === 'FREE') {
    reason = locationLabel ? `${locationLabel} · Available for assignment` : 'Available for assignment';
  } else {
    reason = 'Outside scheduled availability';
  }

  return {
    state: storedState,
    label: AVAILABILITY_LABELS[storedState],
    reason,
    storedState,
    suppressedByPresence: false,
  };
}

/**
 * Authoritative current location. A person who is not present is "Outside" —
 * their permanent room/subroom assignment is unchanged but is not where they
 * currently are.
 */
export function resolveCurrentLocation(input: {
  presenceState: PresenceState | string | null | undefined;
  currentLocationName?: string | null;
  subroomCode?: string | null;
  roomLetter?: string | null;
}): string {
  if (!isPresent(input.presenceState)) {
    return 'Outside';
  }
  return (
    input.currentLocationName ||
    input.subroomCode ||
    (input.roomLetter ? `Section ${input.roomLetter}` : 'UNKNOWN')
  );
}

/**
 * Task-driven availability transition.
 *
 * Tasks only ever move a person between FREE and BUSY. A person who has
 * deliberately set themselves to PARTIALLY_AVAILABLE or UNAVAILABLE keeps that
 * choice — task activity must not silently override an explicit decision.
 * Returns `null` when no change should be persisted.
 */
export function deriveTaskDrivenAvailability(
  storedState: AvailabilityState,
  hasActiveTask: boolean
): AvailabilityState | null {
  if (hasActiveTask && storedState === 'FREE') return 'BUSY';
  if (!hasActiveTask && storedState === 'BUSY') return 'FREE';
  return null;
}
