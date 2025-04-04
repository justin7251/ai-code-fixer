import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { firebaseApp } from '@/lib/firebase';

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState('');
  
  useEffect(() => {
    const handleAuth = async () => {
      try {
        const { token } = router.query;
        
        if (!token) {
          setError('Missing authentication token');
          return;
        }
        
        // Sign in with Firebase using the custom token
        const auth = getAuth(firebaseApp);
        await signInWithCustomToken(auth, token.toString());
        
        // Redirect to dashboard after successful login
        router.push('/dashboard');
        
      } catch (error) {
        console.error('Auth callback error:', error);
        setError('Authentication failed');
      }
    };
    
    if (router.isReady) {
      handleAuth();
    }
  }, [router.isReady, router.query]);
  
  return (
    <div className="flex items-center justify-center min-h-screen">
      {error ? (
        <div className="text-red-600">
          <h1 className="text-xl font-bold">Authentication Error</h1>
          <p>{error}</p>
        </div>
      ) : (
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Completing authentication...</p>
        </div>
      )}
    </div>
  );
} 