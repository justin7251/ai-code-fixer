import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useRouter } from 'next/router';
import { initializeApp } from "firebase/app";
import { getAuth, GithubAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import axios from 'axios';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const githubProvider = new GithubAuthProvider();
githubProvider.addScope('repo');

// User type definition
interface User {
  githubId?: string;
  username?: string;
  role?: string;
  avatar_url?: string;
  id?: string;
  name?: string;
  email?: string;
  accessToken?: string;
}

// Auth context type definition
interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

// Default values for the context
const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  refreshAuth: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  
  // Add debug flag to track initial load
  const [initialCheckComplete, setInitialCheckComplete] = useState(false);

  // Function to extract cookies
  const getCookieValue = (name: string): string | null => {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  };

  // Enhanced check auth function with debug
  const checkAuth = useCallback(async () => {
    console.log('[AUTH] Starting authentication check');
    setLoading(true);
    
    try {
      // First try the Next.js API route for session (this works cross-domain)
      const response = await fetch('/api/auth/session');
      const sessionData = await response.json();
      
      console.log('[AUTH] Session API response:', sessionData);
      
      if (sessionData.authenticated && sessionData.user) {
        setUser({
          githubId: sessionData.user.id,
          username: sessionData.user.username,
          name: sessionData.user.name,
          avatar_url: sessionData.user.image
        });
        localStorage.setItem('user', JSON.stringify(sessionData.user));
        localStorage.setItem('auth_state', 'authenticated');
      } else {
        // If Next.js API fails, try the client-accessible cookie
        const authClientCookie = getCookieValue('auth_client');
        if (authClientCookie) {
          try {
            // Use this token to fetch user data
            const isDev = process.env.NODE_ENV === 'development';
            const baseUrl = isDev 
              ? 'http://localhost:5001/ai-code-fixer/us-central1/auth'
              : 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth';
            
            const verifyResponse = await fetch(`${baseUrl}/verify-session`, {
              headers: {
                'Authorization': `Bearer ${authClientCookie}`
              }
            });
            
            if (verifyResponse.ok) {
              const userData = await verifyResponse.json();
              if (userData.authenticated) {
                setUser(userData);
                localStorage.setItem('user', JSON.stringify(userData));
                localStorage.setItem('auth_state', 'authenticated');
              } else {
                setUser(null);
                localStorage.setItem('auth_state', 'unauthenticated');
              }
            }
          } catch (e) {
            console.error('[AUTH] Error verifying with direct token:', e);
          }
        } else {
          setUser(null);
          localStorage.setItem('auth_state', 'unauthenticated');
        }
      }
    } catch (error) {
      console.error('[AUTH] Auth check error:', error);
      setUser(null);
      localStorage.setItem('auth_state', 'error');
    }
    
    setLoading(false);
    setInitialCheckComplete(true);
  }, []);

  // Run on mount and when URL changes
  useEffect(() => {
    console.log('[AUTH] Component mounted or URL changed');
    checkAuth();
  }, [checkAuth, router.pathname]);
  
  // Protect routes after authentication check
  useEffect(() => {
    // Only run after initial auth check completes
    if (!initialCheckComplete) return;
    
    const pathname = router.pathname;
    console.log('[AUTH] Route protection check for:', pathname);
    
    // Protected routes that require authentication
    const protectedRoutes = ['/dashboard'];
    
    // Public routes (no auth needed)
    const publicRoutes = ['/', '/login', '/error'];
    
    if (protectedRoutes.includes(pathname) && !user && !loading) {
      console.log('[AUTH] Redirecting from protected route to home');
      router.push('/');
    } else if (pathname === '/dashboard' && user) {
      console.log('[AUTH] User authenticated on dashboard');
      // Currently on dashboard and authenticated - do nothing
    }
  }, [initialCheckComplete, loading, router, user, router.pathname]);

  // Login function
  const login = useCallback(() => {
    const isDev = process.env.NODE_ENV === 'development';
    const authUrl = isDev
      ? "http://localhost:5001/ai-code-fixer/us-central1/auth/github/login"
      : "https://us-central1-ai-code-fixer.cloudfunctions.net/auth/github/login";
    
    console.log('[AUTH] Redirecting to GitHub login');
    localStorage.setItem('auth_state', 'pending');
    window.location.href = authUrl;
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    console.log('[AUTH] Logout initiated');
    
    // Get the correct URL based on environment
    const isDev = process.env.NODE_ENV === 'development';
    const logoutUrl = isDev
      ? "http://localhost:5001/ai-code-fixer/us-central1/auth/logout"
      : "https://us-central1-ai-code-fixer.cloudfunctions.net/auth/logout";
    
    try {
      // Call the backend logout endpoint with credentials included
      const response = await fetch(logoutUrl, { 
        credentials: 'include',
        mode: 'cors',
        cache: 'no-cache',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      console.log('[AUTH] Logout response:', response.status);
      
      // Also clear cookies on the frontend
      const cookiesToClear = ['auth_token', 'auth_client', 'user_data', 'session_token'];
      const domain = isDev ? '' : 'ai-code-fixer.web.app';
      
      cookiesToClear.forEach(cookieName => {
        // Standard path
        document.cookie = `${cookieName}=; Max-Age=0; path=/; SameSite=Lax;`;
        
        // With domain (for production)
        if (!isDev && domain) {
          document.cookie = `${cookieName}=; Max-Age=0; path=/; domain=${domain}; SameSite=Lax;`;
          document.cookie = `${cookieName}=; Max-Age=0; path=/; domain=.${domain}; SameSite=Lax;`;
        }
      });
      
      // Clear local storage
      localStorage.removeItem('user');
      localStorage.removeItem('auth_token');
      localStorage.setItem('auth_state', 'unauthenticated');
      
      // Reset state
      setUser(null);
      
      console.log('[AUTH] Logged out successfully, redirecting to home');
    } catch (error) {
      console.error('[AUTH] Error during logout:', error);
    }
    
    // Always redirect to home page, even if there was an error
    router.push('/');
  }, [router]);

  return (
    <AuthContext.Provider 
      value={{ 
        isAuthenticated: !!user, 
        user, 
        loading, 
        login: login as () => Promise<void>,
        logout,
        refreshAuth: checkAuth
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}