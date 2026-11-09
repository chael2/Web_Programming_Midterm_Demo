import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { connectDB, User } from '@/lib/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [Credentials({
    credentials: { email: {}, password: {} },
    async authorize(credentials) {
      if (typeof credentials.email !== 'string' || typeof credentials.password !== 'string' || credentials.email.length > 254 || Buffer.byteLength(credentials.password, 'utf8') > 72) return null;
      await connectDB();
      const user = await User.findOne({ email: credentials.email.trim().toLowerCase() });
      if (!user || !await bcrypt.compare(credentials.password, user.passwordHash)) return null;
      return { id: String(user._id), name: user.name, email: user.email };
    },
  })],
  callbacks: {
    jwt({ token, user }) { if (user) token.sub = user.id; return token; },
    session({ session, token }) { if (session.user && token.sub) session.user.id = token.sub; return session; },
  },
});
