// Seeds the `missions` collection from data/missions.seed.json.
//   npm run seed:missions                 → uses .env.local (local/dev database)
//   node --env-file=<file> scripts/seed-missions.mjs [--force]
// Without --force, missions that already exist are left untouched (admin edits are kept).
// Every mission is validated first; nothing is written if any mission is invalid.
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { validateMission } from '../lib/mission-engine.ts';
import { FlagInstance, Mission } from '../lib/db.ts';

const force = process.argv.includes('--force');
if (!process.env.MONGODB_URI) { console.error('MONGODB_URI is not set (use --env-file).'); process.exit(1); }

const seed = JSON.parse(readFileSync(new URL('../data/missions.seed.json', import.meta.url), 'utf8'));
const invalid = seed.missions.map(m => [m.missionId, validateMission(m).errors]).filter(([, e]) => e.length);
if (invalid.length) { for (const [id, e] of invalid) console.error(`${id}: ${e.join(' / ')}`); process.exit(1); }

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  await Mission.init();
  await FlagInstance.init(); // unique (owner, mission) + TTL index for guest flags
  let inserted = 0, updated = 0, kept = 0;
  for (const raw of seed.missions) {
    const mission = validateMission(raw).mission;
    if (force) {
      const r = await Mission.updateOne({ missionId: mission.missionId }, { $set: { ...mission, updatedBy: 'seed' } }, { upsert: true });
      if (r.upsertedCount) inserted++; else updated++;
    } else {
      const r = await Mission.updateOne({ missionId: mission.missionId }, { $setOnInsert: { ...mission, updatedBy: 'seed' } }, { upsert: true });
      if (r.upsertedCount) inserted++; else kept++;
    }
  }
  console.log(`database: ${mongoose.connection.name} · inserted ${inserted}, updated ${updated}, kept ${kept} (total ${await Mission.countDocuments()})`);
} finally {
  await mongoose.disconnect();
}
