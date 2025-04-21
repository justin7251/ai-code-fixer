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
const nextAuthSecret = process.env.NEXTAUTH_SECRET || 'your-secure-key-here';
const githubClientId = process.env.GITHUB_CLIENT_ID_DEV;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET_DEV;

// Validate required environment variables
if (!githubClientId || !githubClientSecret) {
  console.error('Missing GitHub OAuth credentials. Please set GITHUB_CLIENT_ID_DEV and GITHUB_CLIENT_SECRET_DEV environment variables.');
}

export const authOptions: AuthOptions = {
  providers: [
    GitHubProvider({
      clientId: githubClientId || '',
      clientSecret: githubClientSecret || '',
      authorization: {
        params: { 
          scope: "read:user user:email repo",
          redirect_uri: `${nextAuthUrl}/api/auth/callback/github`
        },
      },
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.name || profile.login,
          email: profile.email,
          image: profile.avatar_url,
          username: profile.login,
        };
      },
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  secret: nextAuthSecret,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (account && account.access_token) {
        token.accessToken = account.access_token;
        token.provider = "github";
      }
      
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
        token.username = user.username;
        token.githubUsername = user.username;
        token.githubId = user.id;
      }
      
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.accessToken = token.accessToken as string;
        session.provider = token.provider as string;
        session.githubUsername = token.githubUsername as string;
        session.githubId = token.githubId as string;
        
        session.user.id = token.githubId as string;
        session.user.name = token.name as string || 'GitHub User';
        session.user.email = token.email as string || '';
        session.user.image = token.picture as string || '';
        session.user.username = token.username as string || '';
      }
      
      return session;
    },
    async redirect({ url, baseUrl }) {
      // If this is a sign-in callback, redirect to dashboard
      if (url.includes('/api/auth/callback')) {
        return `${baseUrl}/dashboard`;
      }
      // Allow relative URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // Allow URLs from the same origin
      else if (new URL(url).origin === baseUrl) return url;
      // Default to dashboard
      return `${baseUrl}/dashboard`;
    }
  },
  debug: process.env.NODE_ENV === 'development',
  // Optimize performance
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true
      }
    }
  },
  // Reduce token size and improve performance
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
    secret: nextAuthSecret,
    encode: async ({ secret, token }) => {
      return JSON.stringify(token);
    },
    decode: async ({ secret, token }) => {
      return JSON.parse(token as string);
    }
  }
};

export default NextAuth(authOptions);