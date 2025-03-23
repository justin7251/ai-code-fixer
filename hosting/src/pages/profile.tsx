import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthProvider';

export default function Profile() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  
  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);
  
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-16 h-16 border-t-4 border-blue-500 border-solid rounded-full animate-spin"></div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Profile | AI Code Fixer</title>
        <meta name="description" content="Your AI Code Fixer profile" />
      </Head>
      
      <main className="py-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {/* Profile header */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-16 relative">
              <div className="absolute bottom-0 transform translate-y-1/2 left-6">
                {user.avatar_url ? (
                  <img 
                    src={user.avatar_url} 
                    alt={user.username || 'User'} 
                    className="h-24 w-24 rounded-full ring-4 ring-white"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-full bg-white flex items-center justify-center text-3xl font-bold text-blue-600">
                    {user.username?.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
              </div>
            </div>
            
            {/* Profile info */}
            <div className="px-6 pt-16 pb-6">
              <h1 className="text-2xl font-bold text-gray-900">
                {user.name || user.username || 'GitHub User'}
              </h1>
              <p className="text-gray-500 flex items-center mt-1">
                <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                {user.username || 'GitHub User'}
              </p>
            </div>
            
            {/* Account details section */}
            <div className="border-t border-gray-200">
              <div className="px-6 py-5">
                <h2 className="text-lg font-medium text-gray-900">Account Details</h2>
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <div className="bg-gray-50 p-4 rounded-md">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Email</h3>
                        <p className="text-base text-gray-900">{user.email || 'No email available'}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-md">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">GitHub Connection</h3>
                        <p className="text-base text-gray-900">Connected</p>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Actions section */}
            <div className="border-t border-gray-200">
              <div className="px-6 py-5">
                <h2 className="text-lg font-medium text-gray-900">Account Actions</h2>
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Go to Dashboard
                  </button>
                  
                  <button
                    onClick={logout}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-red-600 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 