import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { useSession, signIn, signOut } from 'next-auth/react';

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
  isAuthenticated: boolean;
}

// Default values for the context
const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  initialCheckComplete: false,
  login: () => {},
  logout: () => {},
  checkAuth: async () => {},
  isAuthenticated: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const [initialCheckComplete, setInitialCheckComplete] = useState(false);

  // Login function
  const login = () => {
    signIn('github', { callbackUrl: '/dashboard' });
  };

  // Logout function
  const logout = async () => {
    try {
      await signOut({ redirect: false });
      setUser(null);
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Check auth function
  const checkAuth = async () => {
    console.log('Session status:', status);
    console.log('Session data:', session);
    
    if (status === 'loading') {
      setLoading(true);
      return;
    }

    if (status === 'authenticated' && session?.user) {
      console.log('Setting authenticated user:', session.user);
      setUser({
        githubId: session.githubId,
        username: session.user.name || '',
        name: session.user.name || '',
        email: session.user.email || '',
        avatar_url: session.user.image || '',
        accessToken: session.accessToken
      });
      setLoading(false);
      setInitialCheckComplete(true);
    } else {
      console.log('No authenticated user found');
      setUser(null);
      setLoading(false);
      setInitialCheckComplete(true);
      if (router.pathname.startsWith('/dashboard')) {
        router.push('/');
      }
    }
  };

  // Run checkAuth when session or status changes
  useEffect(() => {
    checkAuth();
  }, [session, status]);

  const value = {
    user,
    loading: loading || status === 'loading',
    initialCheckComplete,
    login,
    logout,
    checkAuth,
    isAuthenticated: status === 'authenticated',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}