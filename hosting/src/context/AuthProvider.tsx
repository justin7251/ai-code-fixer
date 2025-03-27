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
export interface AuthContextType {
  user: User | null;
  loading: boolean;
  initialCheckComplete: boolean;
  login: () => void;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

// Default values for the context
const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  initialCheckComplete: false,
  login: () => {},
  logout: () => {},
  checkAuth: async () => {},
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
      // First check local storage for cached user data
      const cachedAuthState = localStorage.getItem('auth_state');
      const cachedUser = localStorage.getItem('user');
      // Try multiple token storage keys
      const cachedToken = 
        localStorage.getItem('auth_client_token') || 
        localStorage.getItem('auth_token');
      
      console.log('[AUTH] Cached auth state:', cachedAuthState);
      console.log('[AUTH] Has cached user data:', !!cachedUser);
      console.log('[AUTH] Has cached token:', !!cachedToken);
      
      // Since we've seen that localStorage works but cookies don't,
      // let's first try the direct localStorage approach for a quicker response
      if (cachedAuthState === 'authenticated' && cachedUser && cachedToken) {
        console.log('[AUTH] Using cached authentication data from localStorage');
        try {
          const userData = JSON.parse(cachedUser);
          setUser({
            githubId: userData.id || userData.githubId,
            username: userData.username || userData.login,
            name: userData.name,
            avatar_url: userData.avatar_url || userData.image
          });
          setLoading(false);
          setInitialCheckComplete(true);
          
          // After setting up the user from localStorage, you can still try to verify
          // with the server in the background, but don't block the UI
          verifyTokenWithServer(cachedToken).catch(e => 
            console.warn('[AUTH] Background token verification failed:', e)
          );
          
          return;
        } catch (parseError) {
          console.error('[AUTH] Error parsing cached user data:', parseError);
        }
      }
      
      // Debugging: Check cookies - log only presence, not actual values
      const cookiePresent = (name: string) => !!getCookieValue(name);
      const cookieStatus = {
        auth_token: cookiePresent('auth_token'),
        auth_client: cookiePresent('auth_client'),
        user_data: cookiePresent('user_data'),
        test_cookie: cookiePresent('test_cookie'),
        auth_flag: cookiePresent('auth_flag'),
        cookie_count: document.cookie.split(';').length
      };
      
      console.log('[AUTH] Cookie status:', cookieStatus);
      console.log('[AUTH] All cookie names:', document.cookie.split(';').map(c => c.trim().split('=')[0]));
      
      // Try to get the token from cookies or localStorage
      const authToken = getCookieValue('auth_token');
      const authClient = getCookieValue('auth_client');
      
      // Special case: If we have localStorage token but no cookies, try to exchange it
      if (cachedToken && !authClient && !authToken) {
        console.log('[AUTH] Found token in localStorage but no cookies, attempting token exchange');
        
        try {
          let userData = null;
          try {
            const userDataStr = localStorage.getItem('user');
            if (userDataStr) {
              userData = JSON.parse(userDataStr);
            }
          } catch (e) {
            console.error('[AUTH] Error parsing user data from localStorage', e);
          }
          
          // Call the token exchange endpoint to set cookies
          const exchangeResponse = await fetch('/api/auth/token-exchange', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              token: cachedToken,
              userData: userData
            })
          });
          
          if (exchangeResponse.ok) {
            console.log('[AUTH] Token exchange successful');
            // Wait a bit for cookies to be set
            await new Promise(resolve => setTimeout(resolve, 100));
          } else {
            console.error('[AUTH] Token exchange failed');
          }
        } catch (exchangeError) {
          console.error('[AUTH] Error during token exchange:', exchangeError);
        }
      }
      
      // Try the Next.js API route for session (this works cross-domain)
      try {
        console.log('[AUTH] Fetching session from Next.js API');
        
        let url = '/api/auth/session';
        
        // If cookies aren't working but we have a token in localStorage, send it as query param
        if (!cookieStatus.auth_token && !cookieStatus.auth_client && cachedToken) {
          console.log('[AUTH] Using token from localStorage as query parameter');
          url = `/api/auth/session?token=${encodeURIComponent(cachedToken)}`;
        }
        
        const response = await fetch(url, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            // If we have a token in localStorage, send it in Authorization header too
            ...(cachedToken ? { 'Authorization': `Bearer ${cachedToken}` } : {})
          }
        });
        
        if (!response.ok) {
          console.error('[AUTH] Session API returned error status:', response.status);
          throw new Error(`Session API returned status ${response.status}`);
        }
        
        const sessionData = await response.json();
        console.log('[AUTH] Session API response:', sessionData);
        
        // Log debug information if present
        if (sessionData.debug) {
          console.log('[AUTH] Session API debug info:', sessionData.debug);
        }
        
        if (sessionData.authenticated && sessionData.user) {
          console.log('[AUTH] Session API authenticated successfully');
          setUser({
            githubId: sessionData.user.id,
            username: sessionData.user.username,
            name: sessionData.user.name,
            avatar_url: sessionData.user.image
          });
          localStorage.setItem('user', JSON.stringify(sessionData.user));
          localStorage.setItem('auth_state', 'authenticated');
          setLoading(false);
          setInitialCheckComplete(true);
          return;
        } else if (sessionData.error) {
          console.log('[AUTH] Session API reported error:', sessionData.error);
        } else {
          console.log('[AUTH] Session API reported not authenticated, trying fallbacks');
        }
      } catch (sessionError) {
        console.error('[AUTH] Error with session API:', sessionError);
        // Continue to fallbacks
      }
      
      // If we get here, all methods failed
      console.log('[AUTH] All authentication methods failed');
      setUser(null);
      localStorage.setItem('auth_state', 'unauthenticated');
      setLoading(false);
      setInitialCheckComplete(true);
    } catch (error) {
      console.error('[AUTH] Error in authentication check:', error);
      setUser(null);
      localStorage.setItem('auth_state', 'unauthenticated');
      setLoading(false);
      setInitialCheckComplete(true);
    }
  }, []);

  // Helper function to verify token with server in the background
  const verifyTokenWithServer = async (token: string) => {
    if (!token) return false;
    
    try {
      const baseUrl = 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth';
  
      const response = await fetch(`${baseUrl}/verify-session`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.authenticated === true;
      }
      return false;
    } catch (error) {
      console.error('[AUTH] Background token verification error:', error);
      return false;
    }
  };

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

  // Logout function with enhanced cookie clearing
  const logout = useCallback(async () => {
    console.log('[AUTH] Logging out');
    setLoading(true);
    
    try {
      // Determine the correct logout URL
      const isDev = process.env.NODE_ENV === 'development';
      const baseUrl = isDev 
        ? 'http://localhost:5001/ai-code-fixer/us-central1/auth'
        : 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth';
      
      // First call our clear-cookies API endpoint
      try {
        const clearResponse = await fetch('/api/auth/clear-cookies', {
          method: 'POST',
          credentials: 'include'
        });
        if (clearResponse.ok) {
          console.log('[AUTH] Local cookie clearing successful');
        } else {
          console.error('[AUTH] Local cookie clearing failed:', await clearResponse.text());
        }
      } catch (clearError) {
        console.error('[AUTH] Error clearing cookies locally:', clearError);
      }
      
      // Then call the backend logout endpoint
      try {
        const response = await fetch(`${baseUrl}/logout`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          console.log('[AUTH] Server logout successful');
        } else {
          console.log('[AUTH] Server logout returned error:', await response.text());
        }
      } catch (logoutError) {
        console.error('[AUTH] Error during server logout:', logoutError);
      }
      
      // Clear cookies on client side too (redundant but thorough)
      const domains = ['', 'localhost', '.localhost', 'web.app', '.web.app', 'ai-code-fixer.web.app', '.ai-code-fixer.web.app'];
      const paths = ['/', '/api', '/api/auth'];
      const cookiesToClear = ['auth_token', 'auth_client', 'user_data', 'test_cookie', 'auth_flag'];
      
      cookiesToClear.forEach(name => {
        domains.forEach(domain => {
          paths.forEach(path => {
            document.cookie = `${name}=; path=${path}; ${domain ? `domain=${domain}; ` : ''}expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
          });
        });
      });
      
      // Clear items from localStorage
      const localStorageItemsToClear = ['user', 'auth_token', 'auth_client_token', 'auth_state'];
      localStorageItemsToClear.forEach(item => {
        try {
          localStorage.removeItem(item);
        } catch (e) {
          console.error(`[AUTH] Error removing ${item} from localStorage:`, e);
        }
      });
      
      // Clear sessionStorage too
      try {
        sessionStorage.clear();
        console.log('[AUTH] sessionStorage cleared');
      } catch (e) {
        console.error('[AUTH] Error clearing sessionStorage:', e);
      }
      
      // Clear user state
      setUser(null);
      console.log('[AUTH] Logout complete');
    } catch (error) {
      console.error('[AUTH] Logout error:', error);
    } finally {
      setLoading(false);
      // Redirect to home page regardless of success
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
  }, []);

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        loading, 
        initialCheckComplete, 
        login: login as () => void,
        logout,
        checkAuth
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}