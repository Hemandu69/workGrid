/**
 * Central, named TTL configuration for every Redis key this app writes.
 * Redis is used only as an optimization/coordination layer — PostgreSQL
 * remains the source of truth everywhere. Every TTL here should be
 * justified by what it protects; add a comment when adding a new one.
 */

/** Rolling rate-limit window for GET /api/v1/auth/email-availability — unauthenticated, worth a tight window to blunt email-enumeration probing. */
export const EMAIL_AVAILABILITY_RATE_LIMIT_TTL_SECONDS = 60;

/** Rolling rate-limit window for POST /api/v1/auth/login — blunts credential-stuffing/brute-force. */
export const LOGIN_RATE_LIMIT_TTL_SECONDS = 60;

/** Rolling rate-limit window for POST /api/v1/auth/register — unauthenticated, prevents account-creation abuse. */
export const REGISTER_RATE_LIMIT_TTL_SECONDS = 60;

/** Rolling rate-limit window for POST /api/v1/auth/forgot-password — the most abuse-sensitive of the four, since each request sends an email. */
export const PASSWORD_RESET_RATE_LIMIT_TTL_SECONDS = 300;

/** How long a claimed Idempotency-Key stays valid — covers a realistic "closed the tab, retried later" window without unbounded Redis growth. */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/** Default TTL for data that's explicitly safe to be briefly stale (stable reference/metadata, non-critical aggregates) — never used for availability, presence, or attendance, which must stay live. */
export const SHORT_CACHE_TTL_SECONDS = 60;
