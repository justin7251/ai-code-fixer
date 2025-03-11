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
      // First check for cookies (these are set directly by backend)
      const authTokenCookie = getCookieValue('auth_token');
      const userDataCookie = getCookieValue('user_data');
      
      console.log('[AUTH] Cookies found:', {
        hasAuthToken: !!authTokenCookie,
        hasUserData: !!userDataCookie
      });
      
      // If we have user data in cookie, use it immediately
      if (userDataCookie) {
        try {
          const parsedUserData = JSON.parse(userDataCookie);
          console.log('[AUTH] Parsed user data from cookie:', parsedUserData.username);
          setUser(parsedUserData);
          
          // Also update localStorage for persistence
          localStorage.setItem('user', userDataCookie);
          localStorage.setItem('auth_state', 'authenticated');
        } catch (e) {
          console.error('[AUTH] Error parsing user_data cookie:', e);
        }
      }
      
      // If we have auth token in localStorage but not user data, try to verify
      const authState = localStorage.getItem('auth_state');
      if (authTokenCookie && !userDataCookie && authState !== 'authenticated') {
        console.log('[AUTH] Have auth token but no user data, verifying with server');
        
        // Verify with server
        const isDev = process.env.NODE_ENV === 'development';
        const baseUrl = isDev 
          ? 'http://localhost:5001/ai-code-fixer/us-central1/auth'
          : 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth';
        
        const response = await fetch(`${baseUrl}/verify-session`, {
          credentials: 'include' // Important: include cookies
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('[AUTH] Server verification response:', data);
          
          if (data.authenticated) {
            setUser(data);
            localStorage.setItem('user', JSON.stringify(data));
            localStorage.setItem('auth_state', 'authenticated');
          } else {
            console.log('[AUTH] Server says not authenticated');
            setUser(null);
            localStorage.removeItem('user');
            localStorage.setItem('auth_state', 'unauthenticated');
          }
        } else {
          console.error('[AUTH] Error verifying with server:', response.status);
          setUser(null);
          localStorage.removeItem('user');
          localStorage.setItem('auth_state', 'error');
        }
      }
      
      // If we don't have auth token cookie or user data cookie
      if (!authTokenCookie && !userDataCookie) {
        console.log('[AUTH] No auth cookies found, clearing state');
        setUser(null);
        localStorage.removeItem('user');
        localStorage.setItem('auth_state', 'unauthenticated');
      }
    } catch (error) {
      console.error('[AUTH] Auth check error:', error);
      setUser(null);
      localStorage.setItem('auth_state', 'error');
    }
    
    setLoading(false);
    setInitialCheckComplete(true);
    console.log('[AUTH] Auth check complete, user:', user?.username || 'not authenticated');
  }, [user?.username]);

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
    const isDev = process.env.NODE_ENV === 'development';
    const logoutUrl = isDev
      ? "http://localhost:5001/ai-code-fixer/us-central1/auth/logout"
      : "https://us-central1-ai-code-fixer.cloudfunctions.net/auth/logout";
    
    try {
      await fetch(logoutUrl, { credentials: 'include' });
    } catch (e) {
      console.error('[AUTH] Error during logout request:', e);
    }
    
    // Clear everything regardless of response
    document.cookie = 'auth_token=; Max-Age=0; path=/; SameSite=Lax;';
    document.cookie = 'user_data=; Max-Age=0; path=/; SameSite=Lax;';
    localStorage.removeItem('user');
    localStorage.setItem('auth_state', 'unauthenticated');
    setUser(null);
    
    console.log('[AUTH] Logged out, redirecting to home');
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