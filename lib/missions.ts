// SERVER-ONLY: missions are read from MongoDB, never from code.
// Also issues and verifies per-user random flags (flag_instances).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { connectDB, FlagInstance, Mission } from '@/lib/db';
import { owaspCategories } from '@/lib/labs';
import { classify, fillTemplate, toPublicMissions as stripForBrowser, type MissionData, type PublicMission } from '@/lib/mission-engine';

const CACHE_MS = 30_000;
let cache: { at: number; list: MissionData[] } | null = null;

function clean(doc: Record<string, unknown>): MissionData {
  const { _id, __v, createdAt, updatedAt, updatedBy, ...rest } = doc;
  void _id; void __v; void createdAt; void updatedAt; void updatedBy;
  return rest as unknown as MissionData;
}

/** All missions (including unpublished), ordered. Cached briefly; admin edits invalidate it. */
export async function loadMissions(force = false): Promise<MissionData[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.list;
  await connectDB();
  const docs = await Mission.find({}).sort({ order: 1, missionId: 1 }).lean<Record<string, unknown>[]>();
  cache = { at: Date.now(), list: docs.map(clean) };
  return cache.list;
}
export function invalidateMissions() { cache = null; }
export async function publishedMissions() {
  return (await loadMissions()).filter(m => m.published);
}
export async function findMission(id: unknown) {
  return typeof id === 'string' ? (await publishedMissions()).find(m => m.missionId === id) : undefined;
}

/** Strips every answer-related field before data reaches the browser (see lib/mission-engine.ts). */
export function toPublicMissions(list: MissionData[]): PublicMission[] {
  return stripForBrowser(list, id => owaspCategories.find(c => c.id === id)?.title ?? '');
}

// ---------------------------------------------------------------------------
// Per-user random flags
// ---------------------------------------------------------------------------
const GUEST_FLAG_TTL_MS = 7 * 24 * 3600 * 1000;
export const ownerForUser = (userId: string) => `u:${userId}`;
export const ownerForGuest = (guestId: string) => `g:${guestId}`;

/** Returns this owner's flag for the mission, creating a new random one on first use. */
export async function flagForOwner(ownerKey: string, mission: MissionData): Promise<string> {
  await connectDB();
  const existing = await FlagInstance.findOne({ ownerKey, missionId: mission.missionId }).lean<{ flag: string }>();
  if (existing) return existing.flag;
  const flag = `SG{${mission.flagPrefix}_${randomBytes(8).toString('hex')}}`;
  try {
    await FlagInstance.create({ ownerKey, missionId: mission.missionId, flag, expiresAt: ownerKey.startsWith('g:') ? new Date(Date.now() + GUEST_FLAG_TTL_MS) : null });
    return flag;
  } catch (error) {
    // Concurrent first attack from the same owner: the other request created it.
    if ((error as { code?: number })?.code !== 11000) throw error;
    const raced = await FlagInstance.findOne({ ownerKey, missionId: mission.missionId }).lean<{ flag: string }>();
    if (!raced) throw error;
    return raced.flag;
  }
}

/** Compares a submission with this owner's own flag only (timing-safe). */
export async function verifyOwnerFlag(ownerKey: string, missionId: string, submitted: string) {
  await connectDB();
  const instance = await FlagInstance.findOne({ ownerKey, missionId }).lean<{ flag: string }>();
  if (!instance) return false;
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(instance.flag), digest(submitted.trim()));
}

/** Evidence is computed from the learner's own input (same template variables as the rule outputs) plus their own flag. */
export function fillEvidence(mission: MissionData, flag: string, input: string) {
  return fillTemplate(mission.evidence, { ...classify(mission.rule, input).vars, flag });
}
