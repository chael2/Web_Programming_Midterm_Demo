// SERVER-ONLY helpers for the wargame Route Handlers: guest identity/state cookie and
// rate limiting. Mission content and flags are NOT here anymore — missions live in
// MongoDB (lib/missions.ts) and every user gets their own random flag.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Cookie signing key: WARGAME_FLAG_SECRET, else derived from AUTH_SECRET, else a
// random per-process key (kept on globalThis so dev hot-reloads don't rotate it).
// ---------------------------------------------------------------------------
const globalKeys = globalThis as unknown as { __sgEphemeralKey?: string };
function ephemeralKey() {
  if (!globalKeys.__sgEphemeralKey) globalKeys.__sgEphemeralKey = randomBytes(32).toString('hex');
  return globalKeys.__sgEphemeralKey;
}
function derive(label: string, secret: string) {
  return createHmac('sha256', secret).update(`secureguard:${label}`).digest('hex');
}
function guestKey() {
  const base = process.env.WARGAME_FLAG_SECRET ?? process.env.AUTH_SECRET;
  return derive('guest-state', base ?? ephemeralKey());
}

// ---------------------------------------------------------------------------
// Rate limiting: small in-memory sliding window, per server instance.
// ---------------------------------------------------------------------------
const windows = new Map<string, number[]>();
export const SUBMIT_LIMIT = 8;
export const SUBMIT_WINDOW_MS = 60_000;
export function rateLimit(key: string, now = Date.now(), limit = SUBMIT_LIMIT, windowMs = SUBMIT_WINDOW_MS) {
  const recent = (windows.get(key) ?? []).filter(t => now - t < windowMs);
  if (recent.length >= limit) {
    windows.set(key, recent);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  windows.set(key, recent);
  if (windows.size > 5000) for (const [k, v] of windows) if (!v.some(t => now - t < windowMs)) windows.delete(k);
  return { ok: true, retryAfter: 0 };
}

// ---------------------------------------------------------------------------
// Guest state. A guest gets a random guest id (their flag owner key is "g:<id>") and
// per-mission verification/penalty counters, kept in an HMAC-signed, HttpOnly cookie.
// The submit API computes guest scores from this cookie, never from the request body.
// ---------------------------------------------------------------------------
export const GUEST_COOKIE = 'sg_guest';
export type GuestMission = { a: boolean; d: boolean; h: number; w: number; t?: number; b?: number };
export type GuestState = { id: string; m: Record<string, GuestMission> };
const MISSION_ID = /^[a-z][a-z0-9-]{1,39}$/;
const GUEST_ID = /^[a-f0-9]{32}$/;
const clampN = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.trunc(v))) : 0;
const sign = (payload: string) => createHmac('sha256', guestKey()).update(payload).digest('base64url');

export function newGuestId() { return randomBytes(16).toString('hex'); }
export function emptyGuestMission(): GuestMission { return { a: false, d: false, h: 0, w: 0 }; }
export function encodeGuestState(state: GuestState) {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
/** Returns the verified state, or a fresh guest for a missing, malformed or tampered cookie. */
export function decodeGuestState(value: string | undefined | null): GuestState {
  const fresh = (): GuestState => ({ id: newGuestId(), m: {} });
  if (!value || value.length > 4096) return fresh();
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra !== undefined) return fresh();
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return fresh();
  try {
    const raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { id?: unknown; m?: Record<string, Record<string, unknown>> };
    if (typeof raw?.id !== 'string' || !GUEST_ID.test(raw.id)) return fresh();
    const m: Record<string, GuestMission> = {};
    for (const [id, v] of Object.entries(raw.m ?? {}).slice(0, 100)) {
      if (!MISSION_ID.test(id) || !v || typeof v !== 'object') continue;
      m[id] = { a: v.a === true, d: v.d === true, h: clampN(v.h, 3), w: clampN(v.w, 1000) };
      if (clampN(v.t, 1000)) m[id].t = clampN(v.t, 1000);
      if (clampN(v.b, 3)) m[id].b = clampN(v.b, 3);
    }
    return { id: raw.id, m };
  } catch { return fresh(); }
}
export function readGuestState(request: Request): GuestState {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.split(';').map(c => c.trim()).find(c => c.startsWith(`${GUEST_COOKIE}=`));
  return decodeGuestState(match ? decodeURIComponent(match.slice(GUEST_COOKIE.length + 1)) : null);
}
/** Set-Cookie header value. `Secure` only over HTTPS so a plain-HTTP local run still works. */
export function guestCookieHeader(request: Request, state: GuestState) {
  const https = new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  return `${GUEST_COOKIE}=${encodeGuestState(state)}; Path=/api/wargame; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${https ? '; Secure' : ''}`;
}

export function clientKey(request: Request, userId?: string) {
  if (userId) return `u:${userId}`;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `ip:${forwarded || request.headers.get('x-real-ip') || 'local'}`;
}
