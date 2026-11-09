// Server-side helpers shared by app/api/wargame/* Route Handlers.
import { auth } from '@/auth';
import { connectDB, databaseConfigured, Progress } from '@/lib/db';
import { labs, normalizeCompleted } from '@/lib/labs';
import { emptyRecord, normalizeRecords, type MissionRecord } from '@/lib/wargame';

export const missionIds = labs.map(lab => lab.id) as string[];
export function findMission(id: unknown) {
  return typeof id === 'string' ? labs.find(lab => lab.id === id) : undefined;
}
export function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}
/** Same-origin check used by the existing notices/progress APIs. */
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch { return null; }
}
/** Returns the authenticated user id from the server session, never from the request body. */
export async function sessionUserId() {
  if (!databaseConfigured()) return null;
  const session = await auth();
  return session?.user?.id ?? null;
}

type ProgressDoc = {
  completed: string[];
  wargame: (MissionRecord & { toObject?: () => unknown })[];
  save: () => Promise<unknown>;
};
export async function loadProgress(userId: string): Promise<ProgressDoc> {
  await connectDB();
  const found = await Progress.findOne({ userId });
  if (found) return found as unknown as ProgressDoc;
  try {
    return await Progress.create({ userId, completed: [], wargame: [] }) as unknown as ProgressDoc;
  } catch {
    // Unique-index race with a parallel request: the other request created it.
    return await Progress.findOne({ userId }) as unknown as ProgressDoc;
  }
}
/** Returns the mutable sub-document for a mission, creating it when missing. */
export function recordIn(doc: ProgressDoc, missionId: string) {
  let record = doc.wargame.find(r => r.missionId === missionId);
  if (!record) {
    doc.wargame.push(emptyRecord(missionId));
    record = doc.wargame[doc.wargame.length - 1];
  }
  return record;
}
export function plainRecords(doc: Pick<ProgressDoc, 'wargame'>) {
  return normalizeRecords(doc.wargame.map(r => typeof r.toObject === 'function' ? r.toObject() : r), missionIds);
}
export function plainCompleted(doc: Pick<ProgressDoc, 'completed'>) {
  return normalizeCompleted(doc.completed);
}
