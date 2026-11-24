import mongoose from 'mongoose';

let connecting: Promise<typeof mongoose> | null = null;
export function databaseConfigured() { return Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET); }
/** Missions live in MongoDB, so the wargame only needs the connection string (login additionally needs AUTH_SECRET). */
export function missionsConfigured() { return Boolean(process.env.MONGODB_URI); }
export async function connectDB() {
  if (!process.env.MONGODB_URI) throw new Error('MongoDB 연결 설정이 필요합니다.');
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!connecting) connecting = mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 }).catch(error => { connecting = null; throw error; });
  return connecting;
}
const userSchema = new mongoose.Schema({ name: { type: String, required: true }, email: { type: String, unique: true, required: true }, passwordHash: { type: String, required: true } }, { timestamps: true });
// Wargame records live next to the legacy `completed` list so existing progress
// documents stay valid; a missing `wargame` array simply means no scored missions yet.
const missionRecordSchema = new mongoose.Schema({
  missionId: { type: String, required: true },
  hintsUsed: { type: Number, default: 0, min: 0, max: 3 },
  wrongSubmissions: { type: Number, default: 0, min: 0 },
  attackVerified: { type: Boolean, default: false },
  defenseVerified: { type: Boolean, default: false },
  bestScore: { type: Number, default: 0, min: 0 },
  lastScore: { type: Number, default: 0, min: 0 },
  clears: { type: Number, default: 0, min: 0 },
  firstSolvedAt: { type: Date, default: null },
  solvedAt: { type: Date, default: null },
  defenseTries: { type: Number, default: 0, min: 0 },
  defenseFirstTry: { type: Boolean, default: false },
  defenseDepth: { type: Boolean, default: false },
}, { _id: false });
const progressSchema = new mongoose.Schema({ userId: { type: String, required: true, unique: true }, completed: { type: [String], default: [] }, wargame: { type: [missionRecordSchema], default: [] } }, { timestamps: true });
const noticeSchema = new mongoose.Schema({ title: { type: String, required: true }, content: { type: String, required: true }, authorId: { type: String, required: true }, author: { type: String, required: true } }, { timestamps: true });
// Wargame problems. The app reads missions only from here (seeded once from
// data/missions.seed.json, then managed on /admin). Validated by validateMission().
const missionSchema = new mongoose.Schema({
  missionId: { type: String, required: true, unique: true },
  order: { type: Number, required: true, index: true },
  published: { type: Boolean, default: true },
  categoryId: { type: String, required: true },
  level: { type: String, required: true },
  title: String, ko: String, category: String, icon: String, color: String,
  description: String, objective: String, field: String,
  sample: String, normal: String,
  cause: String, defense: String, vulnerable: String, secure: String,
  rule: { type: mongoose.Schema.Types.Mixed, required: true },
  flagPrefix: { type: String, required: true },
  evidence: { type: String, required: true },
  hints: { type: [String], default: [] },
  lesson: { type: mongoose.Schema.Types.Mixed, required: true },
  trace: String,
  defenseLab: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedBy: { type: String, default: null },
}, { timestamps: true, minimize: false });
// One random flag per (owner, mission). owner = "u:<userId>" or "g:<guestId>".
// Guest flags expire automatically (TTL index on expiresAt; null never expires).
const flagInstanceSchema = new mongoose.Schema({
  ownerKey: { type: String, required: true },
  missionId: { type: String, required: true },
  flag: { type: String, required: true },
  expiresAt: { type: Date, default: null },
}, { timestamps: true });
flagInstanceSchema.index({ ownerKey: 1, missionId: 1 }, { unique: true });
flagInstanceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Mission = mongoose.models.Mission || mongoose.model('Mission', missionSchema);
export const FlagInstance = mongoose.models.FlagInstance || mongoose.model('FlagInstance', flagInstanceSchema);
export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Progress = mongoose.models.Progress || mongoose.model('Progress', progressSchema);
export const Notice = mongoose.models.Notice || mongoose.model('Notice', noticeSchema);
