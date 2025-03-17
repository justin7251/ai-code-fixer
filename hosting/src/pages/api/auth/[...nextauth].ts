import NextAuth, { AuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { FirestoreAdapter } from "@next-auth/firebase-adapter";
import admin from "firebase-admin";
import serviceAccount from '../../../../keys/serviceAccountKey.json';

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as any),
  });
}

export const authOptions: AuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: { scope: "read:user user:email repo" },
      },
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: profile.name || profile.login,
          email: profile.email,
          image: profile.avatar_url,
          username: profile.login,
        };
      },
    }),
  ],
  adapter: FirestoreAdapter(admin.firestore()),
  secret: process.env.NEXTAUTH_SECRET,
  // Use JWT strategy to avoid cross-domain cookie issues
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      console.log("JWT Callback - Token before update:", token);
      if (account && account.access_token) {
        token.accessToken = account.access_token;
        token.provider = account.provider;
        token.githubUsername = profile?.login || profile?.name;
        token.githubId = profile?.id?.toString();
      }
      console.log("JWT Callback - Token after update:", token);
      return token;
    },
    async session({ session, token, user }) {
      console.log("Session Callback - Session before update:", session);
      session.accessToken = token.accessToken as string;
      session.provider = token.provider as string;
      session.githubUsername = token.githubUsername as string;
      session.githubId = token.githubId as string;
      if (user) {
        session.user.id = user.id;
        session.user.username = (user as any).username || token.githubUsername;
      }
      console.log("Session Callback - Session after update:", session);
      return session;
    },
  },
  // Properly configure cookies to avoid SameSite issues
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true, 
        sameSite: "lax", // Use "lax" instead of "none" to avoid third-party cookie warnings
        path: "/",
        secure: process.env.NODE_ENV === "production"
      }
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production"
      }
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production"
      }
    }
  },
  // Add additional configuration
  pages: {
    signIn: '/login', // Custom login page
    error: '/auth/error', // Error code passed in query string as ?error=
  },
  // Debug mode - set to true only during development
  debug: process.env.NODE_ENV !== "production",
};

export default NextAuth(authOptions); 