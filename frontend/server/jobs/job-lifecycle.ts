import type { JobStatus } from "@/lib/api/contract";

/**
 * The publishing and expiry rules of a job, as pure functions over dates so they can be tested without
 * a database. Ported from the former `JobService` (`applyLifecycleDefaults`, `changeStatus`, `extend`).
 *
 * Background: a published job is visible until `expiresAt`; a daily sweep then marks it CLOSED.
 * Drafts have no posted date and no expiry until they are published.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** `date` plus a number of days. Instants are UTC, so a day is always exactly 24 hours. */
export function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** The status and the two lifecycle dates of a job. */
export interface Schedule {
  status: JobStatus;
  postedAt: Date | null;
  expiresAt: Date | null;
}

/**
 * Dates of a newly created job. An explicit `postedAt` / `expiresAt` from the request wins. Otherwise
 * a draft has no posted date, and any other status is posted now; the expiry defaults to
 * `expiryDays` after the posted date (and stays empty for a draft without one).
 */
export function initialSchedule(
  status: JobStatus,
  requestedPostedAt: Date | null,
  requestedExpiresAt: Date | null,
  now: Date,
  expiryDays: number,
): Schedule {
  const postedAt = requestedPostedAt ?? (status === "DRAFT" ? null : now);
  const expiresAt = requestedExpiresAt ?? (postedAt !== null ? plusDays(postedAt, expiryDays) : null);
  return { status, postedAt, expiresAt };
}

/**
 * Moves a job to `next`. Publishing gives a draft its posted date, and when the job has no expiry or
 * its expiry has already passed (a draft, or reopening a closed job), it starts a fresh expiry window
 * of `expiryDays` from now. An expiry still in the future is kept. Other transitions change only the
 * status.
 */
export function changeStatus(current: Schedule, next: JobStatus, now: Date, expiryDays: number): Schedule {
  let { postedAt, expiresAt } = current;
  if (next === "PUBLISHED") {
    if (postedAt === null) postedAt = now;
    if (expiresAt === null || expiresAt.getTime() <= now.getTime()) expiresAt = plusDays(now, expiryDays);
  }
  return { status: next, postedAt, expiresAt };
}

/**
 * New expiry for "extend": `days` are added to the current expiry if it is still in the future, or to
 * now if it has passed. So extending a live job adds to its remaining time, while extending a closed
 * one reopens it for exactly `days` from now.
 */
export function extendedExpiry(currentExpiresAt: Date | null, now: Date, days: number): Date {
  const base = currentExpiresAt !== null && currentExpiresAt.getTime() > now.getTime() ? currentExpiresAt : now;
  return plusDays(base, days);
}
