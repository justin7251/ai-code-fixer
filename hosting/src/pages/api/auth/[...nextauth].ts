import NextAuth, { AuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import admin from "firebase-admin";
import serviceAccount from '../../../../keys/serviceAccountKey.json';

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as any),
  });
}

// Get environment variables with fallbacks for development
const nextAuthUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const nextAuthSecret = process.env.NEXTAUTH_SECRET || 'your-secret-key-here';
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
        console.log('[GITHUB] Profile received:', {
          id: profile.id,
          login: profile.login,
          name: profile.name,
          email: profile.email,
          avatar: profile.avatar_url,
        });
        
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
    async signIn({ user, account, profile }) {
      try {
        console.log('[NEXTAUTH] SignIn callback:', { 
          hasUser: !!user,
          hasAccount: !!account,
          hasProfile: !!profile
        });

        if (!account || !profile) {
          console.error('[NEXTAUTH] Missing account or profile in signIn callback');
          return false;
        }

        return true;
      } catch (error) {
        console.error('[NEXTAUTH] Error in signIn callback:', error);
        return false;
      }
    },
    async redirect({ url, baseUrl }) {
      // Log the redirect attempt
      console.log('[NEXTAUTH] Redirect callback:', { url, baseUrl });
      
      try {
        // Handle redirects consistently
        if (url.startsWith("/")) {
          const redirectUrl = `${baseUrl}${url}`;
          console.log('[NEXTAUTH] Redirecting to:', redirectUrl);
          return redirectUrl;
        } else if (new URL(url).origin === baseUrl) {
          console.log('[NEXTAUTH] Redirecting to same origin:', url);
          return url;
        }
        console.log('[NEXTAUTH] Fallback redirect to baseUrl:', baseUrl);
        return baseUrl;
      } catch (error) {
        console.error('[NEXTAUTH] Error in redirect callback:', error);
        return baseUrl;
      }
    },
    async jwt({ token, account, profile, user }) {
      try {
        console.log('[NEXTAUTH] JWT callback:', { 
          hasToken: !!token,
          hasAccount: !!account,
          hasProfile: !!profile,
          hasUser: !!user
        });
        
        if (user) {
          // Always save user info to token when available
          token.id = user.id;
          token.name = user.name;
          token.email = user.email;
          token.picture = user.image;
          token.username = user.username;
          token.githubUsername = user.username;
          token.githubId = user.id;
        }
        
        if (account && account.access_token) {
          token.accessToken = account.access_token;
          token.provider = "github";
        }
        
        return token;
      } catch (error) {
        console.error('[NEXTAUTH] Error in JWT callback:', error);
        return token;
      }
    },
    async session({ session, token, user }) {
      try {
        console.log('[NEXTAUTH] Session callback:', { 
          hasSession: !!session,
          hasToken: !!token,
          hasUser: !!session?.user
        });
        
        // Ensure session always has a user object
        if (!session.user) {
          session.user = {};
        }
        
        // Add data from token to session
        session.accessToken = token.accessToken;
        session.provider = token.provider;
        session.githubUsername = token.githubUsername as string;
        session.githubId = token.githubId;
        
        // Make sure user object has all properties
        session.user.id = token.githubId as string;
        session.user.name = token.name as string || 'GitHub User';
        session.user.email = token.email as string || '';
        session.user.image = token.picture as string || '';
        session.user.username = token.username as string || '';
        
        console.log('[NEXTAUTH] Updated session:', {
          user: session.user ? { 
            id: session.user.id,
            name: session.user.name
          } : null
        });
        
        return session;
      } catch (error) {
        console.error('[NEXTAUTH] Error in session callback:', error);
        return session;
      }
    }
  },
  debug: true, // Always enable debug for troubleshooting
  logger: {
    error(code, ...message) {
      console.error('[NEXTAUTH ERROR]', code, message);
    },
    warn(code, ...message) {
      console.warn('[NEXTAUTH WARNING]', code, message);
    },
    debug(code, ...message) {
      console.log('[NEXTAUTH DEBUG]', code, message);
    },
  },
};

export default NextAuth(authOptions);