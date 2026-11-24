// Test helper: missions as stored in MongoDB (the seed file), judged by the same
// data-driven engine the server uses. Mirrors the old labs/lessons/simulate API so the
// content-consistency tests keep checking the same things.
import { readFileSync } from 'node:fs';
import { evaluate } from '../../lib/mission-engine.ts';

export const seedMissions = JSON.parse(readFileSync(new URL('../../data/missions.seed.json', import.meta.url), 'utf8')).missions;
export const labs = seedMissions.map(m => ({ ...m, id: m.missionId }));
export const lessons = Object.fromEntries(seedMissions.map(m => [m.missionId, m.lesson]));
const byId = id => {
  const m = seedMissions.find(x => x.missionId === id);
  if (!m) throw new Error(`unknown mission ${id}`);
  return m;
};
export const simulate = (id, input, defense) => evaluate(byId(id).rule, input, defense);
/** Evidence template of a mission ({{flag}} is replaced by each user's own random flag). */
export const evidenceTemplate = id => byId(id).evidence;
export const flagPrefix = id => byId(id).flagPrefix;
