import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthProvider';
import RepoSelector from '@/components/RepoSelector';

export default function Dashboard() {
  const { user, loading, checkAuth } = useAuth();
  const router = useRouter();
  const [isProcessingToken, setIsProcessingToken] = useState(false);

  // Function to extract token from URL fragment
  useEffect(() => {
    const processHashToken = async () => {
      if (typeof window !== 'undefined' && window.location.hash) {
        try {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const token = hashParams.get('token');
          
          if (token) {
            console.log('[DASHBOARD] Found token in URL fragment, processing...');
            setIsProcessingToken(true);
            
            // Store token in localStorage
            localStorage.setItem('auth_client_token', token);
            localStorage.setItem('auth_state', 'authenticated');
            
            // Try to exchange token for cookies
            try {
              const response = await fetch('/api/auth/token-exchange', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token })
              });
              
              if (response.ok) {
                console.log('[DASHBOARD] Token exchange successful');
              } else {
                console.error('[DASHBOARD] Token exchange failed:', await response.text());
              }
            } catch (error) {
              console.error('[DASHBOARD] Token exchange error:', error);
            }
            
            // Clean up URL
            window.history.replaceState(null, '', '/dashboard');
            
            // Trigger auth check to use the new token
            await checkAuth();
            setIsProcessingToken(false);
          }
        } catch (error) {
          console.error('[DASHBOARD] Error processing URL fragment:', error);
          setIsProcessingToken(false);
        }
      }
    };
    
    processHashToken();
  }, [checkAuth]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!loading && !isProcessingToken && !user) {
      console.log('[DASHBOARD] Not authenticated, redirecting to home');
      router.push('/');
    }
  }, [user, loading, router, isProcessingToken]);

  if (loading || isProcessingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-gray-700 mx-auto"></div>
          <p className="mt-4 text-lg">{isProcessingToken ? 'Processing authentication...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center space-x-4">
          <img
            src={user.avatar_url || `https://avatars.githubusercontent.com/${user.username}`}
            alt="Profile"
            className="w-16 h-16 rounded-full"
          />
          <div>
            <h2 className="text-xl font-semibold">{user.name || user.username}</h2>
            <p className="text-gray-600">@{user.username}</p>
          </div>
        </div>
      </div>
      
      {/* Repository Selector */}
      <div className="bg-white shadow rounded-lg p-6">
        <RepoSelector />
      </div>
      
      {/* Add PMD Check section here once repo is selected */}
    </div>
  );
} 