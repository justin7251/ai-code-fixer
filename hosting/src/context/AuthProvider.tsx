import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { useSession, signIn, signOut, SignInResponse } from 'next-auth/react';

interface User {
  githubId: string;
  username: string;
  avatar_url: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  signIn: () => Promise<SignInResponse | undefined>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (status === "loading") {
      setLoading(true);
      return;
    }

    if (session?.user) {
      const userData: User = {
        githubId: session.user.id as string,
        username: session.user.name || session.user.email || '',
        avatar_url: session.user.image || '',
        email: session.user.email || '',
      };
      setUser(userData);
    } else {
      setUser(null);
    }
    setLoading(false);
  }, [session, status, setUser, setLoading]);

  const value = {
    user,
    loading,
    setUser,
    setLoading,
    signIn: () => signIn('github'),
    signOut: () => signOut({ callbackUrl: '/' }),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};