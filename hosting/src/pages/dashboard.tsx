import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthProvider';
import RepoSelector from '@/components/RepoSelector';

export default function Dashboard() {
  const { isAuthenticated, user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated || !user) {
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
            <h2 className="text-xl font-semibold">{user.username}</h2>
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