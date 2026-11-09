import mongoose from 'mongoose';

let connecting: Promise<typeof mongoose> | null = null;
export function databaseConfigured() { return Boolean(process.env.MONGODB_URI && process.env.AUTH_SECRET); }
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
}, { _id: false });
const progressSchema = new mongoose.Schema({ userId: { type: String, required: true, unique: true }, completed: { type: [String], default: [] }, wargame: { type: [missionRecordSchema], default: [] } }, { timestamps: true });
const noticeSchema = new mongoose.Schema({ title: { type: String, required: true }, content: { type: String, required: true }, authorId: { type: String, required: true }, author: { type: String, required: true } }, { timestamps: true });
export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Progress = mongoose.models.Progress || mongoose.model('Progress', progressSchema);
export const Notice = mongoose.models.Notice || mongoose.model('Notice', noticeSchema);
