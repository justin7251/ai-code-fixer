import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthProvider';
import Head from 'next/head';

export default function Login() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const { returnTo } = router.query;

  useEffect(() => {
    // If already authenticated, redirect to dashboard or returnTo
    if (isAuthenticated && !loading) {
      const redirectPath = returnTo && typeof returnTo === 'string' 
        ? returnTo 
        : '/dashboard';
      
      console.log('[DEBUG] Already authenticated, redirecting to:', redirectPath);
      router.push(redirectPath);
    }
  }, [isAuthenticated, loading, router, returnTo]);

  const handleGitHubLogin = () => {
    // Get the correct GitHub login URL
    const isDev = process.env.NODE_ENV === 'development';
    const githubLoginUrl = isDev
      ? 'http://localhost:5001/ai-code-fixer/us-central1/auth/github/login'
      : 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth/github/login';
    
    // Add returnTo parameter if available
    const returnParam = returnTo ? `?returnTo=${encodeURIComponent(returnTo as string)}` : '';
    
    // Log and redirect
    console.log('[DEBUG] Redirecting to GitHub login');
    window.location.href = githubLoginUrl + returnParam;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold mb-2">Loading</h2>
          <p className="text-gray-500">Please wait...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Login | AI Code Fixer</title>
      </Head>
      
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h1 className="text-center text-3xl font-extrabold text-gray-900 mb-2">
              AI Code Fixer
            </h1>
            <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">
              Sign in to your account
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Analyze and fix your code with AI
            </p>
          </div>
          
          <div className="mt-8 space-y-6">
            <button
              onClick={handleGitHubLogin}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors duration-150"
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                <svg className="h-5 w-5 text-gray-500 group-hover:text-gray-400" viewBox="0 0 16 16" fill="currentColor">
                  <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
              </span>
              Sign in with GitHub
            </button>
            
            <div className="text-sm text-center">
              <p className="text-gray-600">
                We only request permission to read your repositories so we can help you fix your code.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
} 