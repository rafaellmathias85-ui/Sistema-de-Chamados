import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { ensureEmailPollerRunning } from '@/lib/email-poller';
import jwt from 'jsonwebtoken';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        mfaToken: { label: 'MFA Token', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { company: true },
        });

        if (!user) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          return null;
        }

        // Check if MFA is required
        if (user.mfaEnabled) {
          // If no MFA token provided, signal that MFA is needed
          if (!credentials.mfaToken) {
            throw new Error(`MFA_REQUIRED:${user.id}`);
          }

          // Verify MFA token
          try {
            const decoded = jwt.verify(
              credentials.mfaToken,
              process.env.NEXTAUTH_SECRET || 'fallback'
            ) as { userId: string; mfaVerified: boolean };

            if (!decoded.mfaVerified || decoded.userId !== user.id) {
              throw new Error('MFA_INVALID');
            }
          } catch (err: any) {
            if (err.message?.startsWith('MFA_')) throw err;
            throw new Error('MFA_INVALID');
          }
        } else if (user.mfaEnforced && !user.mfaEnabled) {
          // Admin enforced MFA but user hasn't set it up yet → redirect to setup
          if (!credentials.mfaToken) {
            throw new Error(`MFA_SETUP_REQUIRED:${user.id}`);
          }
          // Verify MFA token (after setup flow)
          try {
            const decoded = jwt.verify(
              credentials.mfaToken,
              process.env.NEXTAUTH_SECRET || 'fallback'
            ) as { userId: string; mfaVerified: boolean };
            if (!decoded.mfaVerified || decoded.userId !== user.id) {
              throw new Error('MFA_INVALID');
            }
          } catch (err: any) {
            if (err.message?.startsWith('MFA_')) throw err;
            throw new Error('MFA_INVALID');
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
          companyName: user.company?.name || null,
          tenantId: user.tenantId,
          allowedMenus: user.allowedMenus || null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Iniciar poller de emails no primeiro request autenticado
      ensureEmailPollerRunning();
      
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.companyId = user.companyId;
        token.companyName = user.companyName;
        token.tenantId = user.tenantId;
        token.allowedMenus = (user as any).allowedMenus || null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.companyId = token.companyId as string;
        session.user.companyName = token.companyName as string;
        session.user.tenantId = token.tenantId as string;
        (session.user as any).allowedMenus = token.allowedMenus as string | null;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
