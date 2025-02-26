import { createContext, useContext, ReactNode } from 'react';
import { useSession, signIn, signOut } from "next-auth/react";

interface AuthContextType {
  user: any;
  loading: boolean;
  loginWithGithub: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false,
  loginWithGithub: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  const loginWithGithub = () => {
    signIn('github');
  };

  const logout = () => {
    signOut();
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user: session?.user, 
        loading: status === "loading",
        loginWithGithub,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext); 