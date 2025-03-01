import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

interface User {
  githubId: string;
  username: string;
  role: string;
  avatar_url: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Check for token in URL (after OAuth redirect)
  useEffect(() => {
    const token = router.query.token;
    if (token) {
      // Convert token to string if it's an array
      const tokenStr = Array.isArray(token) ? token[0] : token;
      
      // Save token to localStorage for client-side access
      localStorage.setItem('auth_token', tokenStr);
      
      // Remove token from URL
      const newUrl = window.location.pathname;
      router.replace(newUrl, undefined, { shallow: true });
      
      // Set user from token
      try {
        const payload = JSON.parse(atob(tokenStr.split('.')[1]));
        setUser({
          githubId: payload.githubId,
          username: payload.username,
          role: payload.role,
          avatar_url: payload.avatar_url
        });
      } catch (error) {
        console.error('Failed to parse token', error);
      }
    }
    setLoading(false);
  }, [router.query.token]);

  // Check auth state on initial load
  useEffect(() => {
    const verifySession = async () => {
      try {
        // Verify the session on the server
        const res = await axios.get('https://us-central1-ai-code-fixer.cloudfunctions.net/auth/verify-session', {
          withCredentials: true // Important for sending cookies
        });
        
        if (res.data.authenticated) {
          setUser(res.data.user);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Auth verification failed:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    verifySession();
  }, []);

  const login = () => {
    window.location.href = 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth/github/login';
  };

  const logout = async () => {
    try {
      await axios.get('https://us-central1-ai-code-fixer.cloudfunctions.net/auth/logout', {
        withCredentials: true
      });
      localStorage.removeItem('auth_token');
      setUser(null);
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}