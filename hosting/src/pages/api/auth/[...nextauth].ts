import NextAuth, { AuthOptions } from "next-auth";
import { Session } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import admin from "firebase-admin";
import serviceAccount from '../../../../keys/serviceAccountKey.json';
import jwt from 'jsonwebtoken';

// Extend the Session type
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    provider?: string;
    githubUsername?: string;
    githubId?: string;
    error?: string;
    jwtToken?: string;
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

// Log environment variables for debugging
console.log('NEXTAUTH_URL:', nextAuthUrl);
console.log('NEXTAUTH_SECRET set:', !!nextAuthSecret);

export const authOptions: AuthOptions = {
  providers: [
    GitHubProvider({
      clientId: githubClientId as string,
      clientSecret: githubClientSecret as string,
      authorization: {
        params: {
          scope: 'read:user user:email repo',
        },
      }
    }),
  ],
  secret: nextAuthSecret,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    secret: nextAuthSecret,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      console.log('JWT callback - account:', JSON.stringify(account, null, 2));
      console.log('JWT callback - token before:', JSON.stringify(token, null, 2));
      
      if (account) {
        console.log('Account access token:', account.access_token);
        
        // Explicitly transfer the token information
        token.accessToken = account.access_token;
        token.provider = account.provider;
        
        if (profile) {
          token.githubUsername = profile.login;
          token.githubId = String(profile.id);
        }
        
        console.log('JWT callback - token after update:', JSON.stringify(token, null, 2));
      }
      
      return token;
    },
    async session({ session, token, user }) {
      console.log('Session callback - token:', JSON.stringify(token, null, 2));
      console.log('Session callback - session before:', JSON.stringify(session, null, 2));
      
      // Explicitly transfer from token to session
      session.accessToken = token.accessToken as string;
      session.provider = token.provider as string;
      session.githubUsername = token.githubUsername as string;
      session.githubId = token.githubId as string;
      
      // Create a custom JWT token that contains the GitHub access token
      if (token.accessToken && nextAuthSecret) {
        try {
          // Create a JWT that our backend can verify
          const jwtToken = jwt.sign(
            { 
              accessToken: token.accessToken,
              provider: token.provider,
              githubUsername: token.githubUsername,
              githubId: token.githubId,
              sub: token.sub,
              iat: Math.floor(Date.now() / 1000),
              exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24), // 24 hours
            },
            nextAuthSecret
          );
          
          // Add the JWT token to the session
          session.jwtToken = jwtToken;
          console.log('Created JWT token for backend authentication');
        } catch (error) {
          console.error('Error creating JWT token:', error);
        }
      }
      
      console.log('Session callback - session after:', JSON.stringify(session, null, 2));
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      else if (new URL(url).origin === baseUrl) return url;
      return `${baseUrl}/dashboard`;
    }
  },
  debug: true, // Always enable debug for troubleshooting
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
      console.log('Account during sign in:', JSON.stringify(account, null, 2));
    },
    async signOut({ token, session }) {
      console.log('User signed out');
    },
  }
};

export default NextAuth(authOptions);