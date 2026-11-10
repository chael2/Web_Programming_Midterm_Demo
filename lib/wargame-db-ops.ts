// Filters and update documents for the wargame progress records (Progress.wargame[]).
// Every state change is one conditional, atomic MongoDB update instead of
// read-modify-save, so concurrent requests cannot create duplicate mission
// records, lose counter increments, or clear the same verified run twice.
// Kept free of imports so tests/ can load it with Node's type stripping.
type Counters = { hintsUsed: number; wrongSubmissions: number };

/** Matches the user's progress document (users only ever touch their own). */
export const userFilter = (userId: string) => ({ userId });
/** Creates the document if missing; legacy documents without `wargame` keep working. */
export const ensureDocUpdate = () => ({ $setOnInsert: { completed: [], wargame: [] } });

/** Matches only when the mission record does not exist yet → push happens at most once. */
export const missingRecordFilter = (userId: string, missionId: string) => ({ userId, 'wargame.missionId': { $ne: missionId } });
export const pushRecordUpdate = (record: { missionId: string }) => ({ $push: { wargame: record } });

export const recordFilter = (userId: string, missionId: string) => ({ userId, 'wargame.missionId': missionId });

export function verifyUpdate(attack: boolean, defense: boolean) {
  const $set: Record<string, boolean> = {};
  if (attack) $set['wargame.$.attackVerified'] = true;
  if (defense) $set['wargame.$.defenseVerified'] = true;
  return { $set };
}

/** Hints must be revealed in order: level n only matches when level n-1 was already used. */
export const hintFilter = (userId: string, missionId: string, level: number) => ({ userId, wargame: { $elemMatch: { missionId, hintsUsed: { $gte: level - 1 } } } });
export const hintUpdate = (level: number) => ({ $max: { 'wargame.$.hintsUsed': level } });

export const wrongUpdate = () => ({ $inc: { 'wargame.$.wrongSubmissions': 1 } });

/**
 * A clear only applies to the exact run the score was computed from: both checks
 * verified and the same hint/wrong counters. A duplicate or concurrent submit finds
 * the flags already reset (or counters changed) and matches nothing.
 */
export const clearFilter = (userId: string, missionId: string, seen: Counters) => ({
  userId,
  wargame: { $elemMatch: { missionId, attackVerified: true, defenseVerified: true, hintsUsed: seen.hintsUsed, wrongSubmissions: seen.wrongSubmissions } },
});
export const clearUpdate = (missionId: string, score: number, now: Date) => ({
  $set: { 'wargame.$.lastScore': score, 'wargame.$.solvedAt': now, 'wargame.$.wrongSubmissions': 0, 'wargame.$.attackVerified': false, 'wargame.$.defenseVerified': false },
  $max: { 'wargame.$.bestScore': score },
  $inc: { 'wargame.$.clears': 1 },
  $addToSet: { completed: missionId },
});
/** firstSolvedAt is written only once. */
export const firstSolveFilter = (userId: string, missionId: string) => ({ userId, wargame: { $elemMatch: { missionId, firstSolvedAt: null } } });
export const firstSolveUpdate = (now: Date) => ({ $set: { 'wargame.$.firstSolvedAt': now } });
