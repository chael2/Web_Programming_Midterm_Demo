// SERVER-ONLY: who may manage missions. Admins are listed in the ADMIN_EMAILS
// environment variable (comma-separated). The check always uses the server session.
import { auth } from '@/auth';
import { databaseConfigured } from '@/lib/db';

export function isAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

/** Returns the admin's session identity, or null when not signed in or not an admin. */
export async function adminSession() {
  if (!databaseConfigured()) return null;
  const session = await auth();
  const email = session?.user?.email;
  return session?.user?.id && isAdminEmail(email) ? { id: session.user.id, email: email! } : null;
}
