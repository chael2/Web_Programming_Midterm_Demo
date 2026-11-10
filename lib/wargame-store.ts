// Server-side helpers shared by app/api/wargame/* Route Handlers.
// All progress changes go through single atomic MongoDB updates (lib/wargame-db-ops.ts);
// every query is scoped to the session user's own document.
import { auth } from '@/auth';
import { connectDB, databaseConfigured, Progress } from '@/lib/db';
import { labs, normalizeCompleted } from '@/lib/labs';
import { emptyRecord, normalizeRecords, type MissionRecord } from '@/lib/wargame';
import * as ops from '@/lib/wargame-db-ops';
export { parseJsonBody, sameOrigin } from '@/lib/http';

export const missionIds = labs.map(lab => lab.id) as string[];
export function findMission(id: unknown) {
  return typeof id === 'string' ? labs.find(lab => lab.id === id) : undefined;
}
export function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}
/** Returns the authenticated user id from the server session, never from the request body. */
export async function sessionUserId() {
  if (!databaseConfigured()) return null;
  const session = await auth();
  return session?.user?.id ?? null;
}

type LeanProgress = { completed?: unknown; wargame?: unknown } | null;

/** Creates the user's document and the mission record if missing (each at most once, race-safe). */
async function ensureRecord(userId: string, missionId: string) {
  await connectDB();
  try {
    await Progress.updateOne(ops.userFilter(userId), ops.ensureDocUpdate(), { upsert: true });
  } catch (error) {
    // Two parallel upserts on the unique userId index: the other one created the document.
    if ((error as { code?: number })?.code !== 11000) throw error;
  }
  await Progress.updateOne(ops.missingRecordFilter(userId, missionId), ops.pushRecordUpdate(emptyRecord(missionId)));
}
async function readRecord(userId: string, missionId: string): Promise<MissionRecord> {
  const doc = await Progress.findOne(ops.userFilter(userId), { wargame: { $elemMatch: { missionId } } }).lean<LeanProgress>();
  return normalizeRecords(doc?.wargame, missionIds)[missionId] ?? emptyRecord(missionId);
}

export async function getRecord(userId: string, missionId: string) {
  await ensureRecord(userId, missionId);
  return readRecord(userId, missionId);
}
/** Marks attack success / defense check for the current run. */
export async function markVerified(userId: string, missionId: string, attack: boolean, defense: boolean) {
  await ensureRecord(userId, missionId);
  if (attack || defense) await Progress.updateOne(ops.recordFilter(userId, missionId), ops.verifyUpdate(attack, defense));
  return readRecord(userId, missionId);
}
/** Raises the hint level (never lowers it). Returns null when an earlier level was skipped. */
export async function raiseHints(userId: string, missionId: string, level: number) {
  await ensureRecord(userId, missionId);
  if (level > 0) {
    const result = await Progress.updateOne(ops.hintFilter(userId, missionId, level), ops.hintUpdate(level));
    if (result.matchedCount === 0) return null;
  }
  return readRecord(userId, missionId);
}
export async function addWrongSubmission(userId: string, missionId: string) {
  await Progress.updateOne(ops.recordFilter(userId, missionId), ops.wrongUpdate());
  return readRecord(userId, missionId);
}
/** Applies a clear only if the run is still exactly the one the score was computed from. */
export async function claimClear(userId: string, missionId: string, seen: MissionRecord, score: number) {
  const now = new Date();
  const result = await Progress.updateOne(ops.clearFilter(userId, missionId, seen), ops.clearUpdate(missionId, score, now));
  if (result.matchedCount === 0) return false;
  await Progress.updateOne(ops.firstSolveFilter(userId, missionId), ops.firstSolveUpdate(now));
  return true;
}
export async function loadProgress(userId: string) {
  const doc = await Progress.findOne(ops.userFilter(userId)).lean<LeanProgress>();
  return { records: normalizeRecords(doc?.wargame, missionIds), completed: normalizeCompleted(doc?.completed) };
}
