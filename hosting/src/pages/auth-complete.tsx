import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function AuthComplete() {
  const router = useRouter();
  const [status, setStatus] = useState('Processing authentication...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    const { token, data, source } = router.query;

    if (!token || !data) {
      setError('Missing authentication data in URL');
      return;
    }

    try {
      // Store the token
      console.log('[AUTH-COMPLETE] Storing token in localStorage');
      localStorage.setItem('auth_client_token', token as string);
      localStorage.setItem('auth_token', token as string);
      
      // Store user data
      console.log('[AUTH-COMPLETE] Storing user data in localStorage');
      const userData = JSON.parse(data as string);
      localStorage.setItem('user', JSON.stringify(userData));
      
      // Mark as authenticated
      localStorage.setItem('auth_state', 'authenticated');
      
      setStatus('Authentication successful! Redirecting...');
      
      // Call token exchange to attempt setting cookies as well
      fetch('/api/auth/token-exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: token,
          userData: userData
        })
      }).catch(err => {
        console.error('[AUTH-COMPLETE] Error exchanging token:', err);
      });

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
    } catch (err) {
      console.error('[AUTH-COMPLETE] Error processing auth data:', err);
      setError('Error processing authentication data: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, [router.isReady, router.query, router]);

  return (
    <>
      <Head>
        <title>Completing Authentication | AI Code Fixer</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
          <h1 className="text-2xl font-bold text-center mb-4">Authentication</h1>
          
          {error ? (
            <div className="text-red-600 mb-4 text-center">
              <p className="font-bold">Error</p>
              <p>{error}</p>
              <button 
                onClick={() => router.push('/')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Return Home
              </button>
            </div>
          ) : (
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-700">{status}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
} 