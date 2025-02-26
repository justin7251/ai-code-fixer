import NextAuth, { AuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { FirestoreAdapter } from "@next-auth/firebase-adapter";
import { cert } from "firebase-admin/app";
import admin from "firebase-admin";

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.NEXT_PUBLIC_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

export const authOptions: AuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      authorization: {
        params: {
          scope: "read:user user:email repo" // Explicitly define scopes
        }
      },
      // Add profile mapping to ensure correct data extraction
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: profile.name || profile.login,
          email: profile.email,
          image: profile.avatar_url,
          username: profile.login
        };
      }
    }),
  ],
  adapter: FirestoreAdapter(admin.firestore()),
  callbacks: {
    async jwt({ token, account, profile }) {
      // Add GitHub-specific information to the token
      if (account) {
        token.accessToken = account.access_token;
        token.provider = account.provider;
        
        // Use optional chaining and provide fallbacks
        token.githubUsername = (profile as any)?.login || (profile as any)?.username;
        token.githubId = (profile as any)?.id?.toString();
      }
      return token;
    },
    async session({ session, token, user }) {
      // Attach additional information to the session
      session.accessToken = token.accessToken as string;
      session.provider = token.provider as string;
      session.githubUsername = token.githubUsername as string;
      session.githubId = token.githubId as string;

      // Ensure user details are complete
      session.user.id = user.id;
      session.user.username = (user as any).username || token.githubUsername;

      return session;
    },
  },
  // Add additional configuration
  pages: {
    signIn: '/login', // Custom login page
    error: '/auth/error', // Error code passed in query string as ?error=
  },
};

export default NextAuth(authOptions); 