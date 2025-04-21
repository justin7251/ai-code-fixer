import NextAuth, { AuthOptions } from "next-auth";
import { Session } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import admin from "firebase-admin";
import serviceAccount from '../../../../keys/serviceAccountKey.json';

// Extend the Session type
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    provider?: string;
    githubUsername?: string;
    githubId?: string;
  }
}

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as any),
  });
}

// Get environment variables with fallbacks for development
const nextAuthUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const nextAuthSecret = process.env.NEXTAUTH_SECRET;
const githubClientId = process.env.GITHUB_CLIENT_ID_DEV;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET_DEV;

// Validate required environment variables
if (!githubClientId || !githubClientSecret) {
  console.error('Missing GitHub OAuth credentials. Please set GITHUB_CLIENT_ID_DEV and GITHUB_CLIENT_SECRET_DEV environment variables.');
}

export const authOptions: AuthOptions = {
  providers: [
    GitHubProvider({
      clientId: githubClientId as string,
      clientSecret: githubClientSecret as string,
      authorization: {
        params: {
          scope: 'read:user user:email repo',
        },
      },
    }),
  ],
  secret: nextAuthSecret,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider;
      }
      if (profile) {
        token.githubUsername = profile.login;
        token.githubId = String(profile.id);
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.accessToken = token.accessToken;
        session.provider = token.provider;
        session.githubUsername = token.githubUsername;
        session.githubId = token.githubId;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      else if (new URL(url).origin === baseUrl) return url;
      return `${baseUrl}/dashboard`;
    }
  },
  debug: process.env.NODE_ENV === 'development',
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true, 
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production"
      }
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  events: {
    async signIn({ user, account, profile }) {
      console.log('User signed in:', user.email);
    },
    async signOut({ token, session }) {
      console.log('User signed out');
    },
  }
};

export default NextAuth(authOptions);