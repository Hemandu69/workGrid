import { describe, it, expect } from 'vitest';
import {
  paginationQuerySchema,
  cursorQuerySchema,
  encodeCursor,
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from '../src/schemas/pagination.schema.js';

describe('Pagination schema', () => {
  it('applies the default limit and offset when neither is supplied', () => {
    const result = paginationQuerySchema.parse({});
    expect(result.limit).toBe(DEFAULT_PAGE_LIMIT);
    expect(result.offset).toBe(0);
  });

  it('accepts a limit within range', () => {
    const result = paginationQuerySchema.parse({ limit: '25', offset: '10' });
    expect(result.limit).toBe(25);
    expect(result.offset).toBe(10);
  });

  it('rejects a limit above the server maximum', () => {
    const result = paginationQuerySchema.safeParse({ limit: String(MAX_PAGE_LIMIT + 1) });
    expect(result.success).toBe(false);
  });

  it('rejects a limit below 1', () => {
    const result = paginationQuerySchema.safeParse({ limit: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects a negative offset', () => {
    const result = paginationQuerySchema.safeParse({ offset: '-1' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric limit', () => {
    const result = paginationQuerySchema.safeParse({ limit: 'not-a-number' });
    expect(result.success).toBe(false);
  });
});

describe('Cursor pagination', () => {
  it('round-trips a cursor through encode/decode', () => {
    const createdAt = new Date('2026-08-22T10:00:00.000Z');
    const id = 'audit-123';
    const cursor = encodeCursor(createdAt, id);
    const decoded = decodeCursor(cursor);

    expect(decoded).not.toBeNull();
    expect(decoded?.id).toBe(id);
    expect(decoded?.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it('returns null for a malformed cursor instead of throwing', () => {
    expect(decodeCursor('not-valid-base64url-cursor-data')).toBeNull();
  });

  it('returns null for a cursor with an invalid embedded date', () => {
    const bad = Buffer.from('not-a-date|some-id').toString('base64url');
    expect(decodeCursor(bad)).toBeNull();
  });

  it('applies the default limit when none is supplied', () => {
    const result = cursorQuerySchema.parse({});
    expect(result.limit).toBe(DEFAULT_PAGE_LIMIT);
    expect(result.cursor).toBeUndefined();
  });

  it('rejects a limit above the server maximum', () => {
    const result = cursorQuerySchema.safeParse({ limit: String(MAX_PAGE_LIMIT + 1) });
    expect(result.success).toBe(false);
  });
});
