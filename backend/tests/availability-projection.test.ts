import { describe, it, expect } from 'vitest';
import { PresenceState, UserStatus } from '@prisma/client';
import {
  AVAILABILITY_STATES,
  AvailabilityState,
  availabilityFromUserStatus,
  userStatusFromAvailability,
  deriveAvailability,
  deriveTaskDrivenAvailability,
  resolveCurrentLocation,
  isPresent,
} from '../src/utils/availability-projection.js';

describe('Availability projection — the single authoritative derivation', () => {
  describe('UserStatus ↔ AvailabilityState mapping', () => {
    it('1. round-trips every availability state through the stored UserStatus enum', () => {
      for (const state of AVAILABILITY_STATES) {
        expect(availabilityFromUserStatus(userStatusFromAvailability(state))).toBe(state);
      }
    });

    it('2. maps each stored status to its operational counterpart', () => {
      expect(availabilityFromUserStatus(UserStatus.ONLINE)).toBe('FREE');
      expect(availabilityFromUserStatus(UserStatus.BUSY)).toBe('BUSY');
      expect(availabilityFromUserStatus(UserStatus.AWAY)).toBe('PARTIALLY_AVAILABLE');
      expect(availabilityFromUserStatus(UserStatus.OFFLINE)).toBe('UNAVAILABLE');
    });

    it('3. treats a missing or unrecognised stored status as UNAVAILABLE', () => {
      expect(availabilityFromUserStatus(null)).toBe('UNAVAILABLE');
      expect(availabilityFromUserStatus(undefined)).toBe('UNAVAILABLE');
      expect(availabilityFromUserStatus('NONSENSE')).toBe('UNAVAILABLE');
    });
  });

  describe('presence dominates availability', () => {
    it('4. projects UNAVAILABLE for a checked-OUT person even when stored FREE', () => {
      const projection = deriveAvailability({
        presenceState: PresenceState.OUT,
        storedState: 'FREE',
      });

      expect(projection.state).toBe('UNAVAILABLE');
      expect(projection.suppressedByPresence).toBe(true);
      expect(projection.reason).toMatch(/checked out/i);
    });

    it('5. projects UNAVAILABLE for a checked-OUT person even when stored BUSY', () => {
      expect(deriveAvailability({ presenceState: 'OUT', storedState: 'BUSY' }).state).toBe('UNAVAILABLE');
    });

    it('6. distinguishes UNKNOWN presence from a deliberate check-out', () => {
      const projection = deriveAvailability({
        presenceState: PresenceState.UNKNOWN,
        storedState: 'FREE',
      });

      expect(projection.state).toBe('UNAVAILABLE');
      expect(projection.reason).toMatch(/unknown/i);
    });

    it('7. preserves the stored state while OUT so checking back IN restores it', () => {
      const projection = deriveAvailability({ presenceState: 'OUT', storedState: 'PARTIALLY_AVAILABLE' });

      expect(projection.state).toBe('UNAVAILABLE');
      expect(projection.storedState).toBe('PARTIALLY_AVAILABLE');
    });

    it('8. projects the stored state verbatim once the person is IN', () => {
      for (const state of AVAILABILITY_STATES) {
        const projection = deriveAvailability({ presenceState: PresenceState.IN, storedState: state });
        expect(projection.state).toBe(state);
        expect(projection.suppressedByPresence).toBe(false);
      }
    });

    it('9. names the active task in the reason when BUSY and present', () => {
      const projection = deriveAvailability({
        presenceState: 'IN',
        storedState: 'BUSY',
        activeTaskLabel: 'TSK-8421',
      });

      expect(projection.state).toBe('BUSY');
      expect(projection.reason).toContain('TSK-8421');
    });

    it('10. reports FREE against the person’s location when present and unloaded', () => {
      const projection = deriveAvailability({
        presenceState: 'IN',
        storedState: 'FREE',
        locationLabel: 'Subroom B3',
      });

      expect(projection.state).toBe('FREE');
      expect(projection.label).toBe('Free');
      expect(projection.reason).toContain('Subroom B3');
    });
  });

  describe('current location follows presence, not assignment', () => {
    it('11. reports "Outside" for a checked-OUT person despite an assigned subroom', () => {
      expect(
        resolveCurrentLocation({
          presenceState: 'OUT',
          currentLocationName: 'B2',
          subroomCode: 'B2',
          roomLetter: 'B',
        })
      ).toBe('Outside');
    });

    it('12. reports the live location for a present person', () => {
      expect(
        resolveCurrentLocation({ presenceState: 'IN', currentLocationName: 'C4', subroomCode: 'C4' })
      ).toBe('C4');
    });

    it('13. falls back to the assigned subroom, then the section, then UNKNOWN', () => {
      expect(resolveCurrentLocation({ presenceState: 'IN', subroomCode: 'D7' })).toBe('D7');
      expect(resolveCurrentLocation({ presenceState: 'IN', roomLetter: 'D' })).toBe('Section D');
      expect(resolveCurrentLocation({ presenceState: 'IN' })).toBe('UNKNOWN');
    });

    it('14. treats UNKNOWN presence as Outside as well', () => {
      expect(resolveCurrentLocation({ presenceState: 'UNKNOWN', subroomCode: 'A1' })).toBe('Outside');
    });
  });

  describe('task-driven transitions preserve deliberate choices', () => {
    it('15. moves a FREE person to BUSY when work becomes active', () => {
      expect(deriveTaskDrivenAvailability('FREE', true)).toBe('BUSY');
    });

    it('16. restores a BUSY person to FREE when the last task closes', () => {
      expect(deriveTaskDrivenAvailability('BUSY', false)).toBe('FREE');
    });

    it('17. leaves an explicitly PARTIALLY_AVAILABLE person untouched either way', () => {
      expect(deriveTaskDrivenAvailability('PARTIALLY_AVAILABLE', true)).toBeNull();
      expect(deriveTaskDrivenAvailability('PARTIALLY_AVAILABLE', false)).toBeNull();
    });

    it('18. leaves an explicitly UNAVAILABLE person untouched either way', () => {
      expect(deriveTaskDrivenAvailability('UNAVAILABLE', true)).toBeNull();
      expect(deriveTaskDrivenAvailability('UNAVAILABLE', false)).toBeNull();
    });

    it('19. does not rewrite a state that already matches the workload', () => {
      expect(deriveTaskDrivenAvailability('BUSY', true)).toBeNull();
      expect(deriveTaskDrivenAvailability('FREE', false)).toBeNull();
    });
  });

  describe('presence predicate', () => {
    it('20. accepts both the Prisma enum and the simulation string form', () => {
      expect(isPresent(PresenceState.IN)).toBe(true);
      expect(isPresent('IN')).toBe(true);
      expect(isPresent(PresenceState.OUT)).toBe(false);
      expect(isPresent('UNKNOWN')).toBe(false);
      expect(isPresent(null)).toBe(false);
    });
  });

  describe('rapid consecutive changes converge on the latest state', () => {
    it('21. reflects only the final stored state after FREE→BUSY→FREE→BUSY', () => {
      const sequence: AvailabilityState[] = ['FREE', 'BUSY', 'FREE', 'BUSY'];
      const finalStored = sequence[sequence.length - 1];

      // The projection is a pure function of the latest authoritative state —
      // there is no accumulated history that an out-of-order update could skew.
      expect(deriveAvailability({ presenceState: 'IN', storedState: finalStored }).state).toBe('BUSY');
    });
  });
});
