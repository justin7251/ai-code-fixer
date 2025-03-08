import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthProvider';

interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  url: string;
  default_branch: string;
  stars: number;
  language: string;
}

export default function RepoSelector() {
  const { isAuthenticated } = useAuth();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch repositories when component mounts
  useEffect(() => {
    if (isAuthenticated) {
      fetchRepositories();
    }
  }, [isAuthenticated]);

  // Fetch repositories from backend
  const fetchRepositories = async () => {
    setLoading(true);
    setError('');
    
    try {
      const isDev = process.env.NODE_ENV === 'development';
      const baseUrl = isDev
        ? 'http://localhost:5001/ai-code-fixer/us-central1/auth'
        : 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth';
      
      console.log('Fetching repositories from:', `${baseUrl}/github/repos`);
      
      const response = await fetch(`${baseUrl}/github/repos`, {
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('Repository fetch error:', data);
        throw new Error(data.error || `Error: ${response.status}`);
      }
      
      console.log('Fetched repositories:', data.repositories?.length || 0);
      setRepositories(data.repositories || []);
      
      // Check if there's a previously selected repo in localStorage
      const savedRepo = localStorage.getItem('selectedRepo');
      if (savedRepo) {
        const parsedRepo = JSON.parse(savedRepo);
        setSelectedRepo(parsedRepo);
      }
    } catch (error) {
      console.error('Failed to fetch repositories:', error);
      setError(`Failed to load repositories: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle repository selection
  const handleSelectRepo = async (repo: Repository) => {
    try {
      setLoading(true);
      const isDev = process.env.NODE_ENV === 'development';
      const baseUrl = isDev
        ? 'http://localhost:5001/ai-code-fixer/us-central1/auth'
        : 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth';
      
      const response = await fetch(`${baseUrl}/github/select-repo`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          repoId: repo.id,
          repoName: repo.name,
          repoFullName: repo.full_name
        })
      });
      
      if (!response.ok) {
        throw new Error(`Error selecting repository: ${response.status}`);
      }
      
      // Save selection to state and localStorage
      setSelectedRepo(repo);
      localStorage.setItem('selectedRepo', JSON.stringify(repo));
      
    } catch (error) {
      console.error('Failed to select repository:', error);
      setError('Failed to select repository. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && repositories.length === 0) {
    return <div>Loading repositories...</div>;
  }

  if (error && repositories.length === 0) {
    return (
      <div className="error-container">
        <p className="error-message">{error}</p>
        <button onClick={fetchRepositories}>Try Again</button>
      </div>
    );
  }

  return (
    <div className="repo-selector">
      <h2 className="text-xl font-semibold mb-4">Select a Repository for PMD Check</h2>
      
      {selectedRepo && (
        <div className="selected-repo mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="font-medium">Currently Selected:</p>
          <p className="text-blue-700">{selectedRepo.full_name}</p>
          <button 
            className="text-sm text-blue-600 hover:underline mt-2"
            onClick={() => setSelectedRepo(null)}
          >
            Change Selection
          </button>
        </div>
      )}
      
      {(!selectedRepo || repositories.length === 0) && (
        <div className="repo-list">
          {repositories.length === 0 ? (
            <p>No repositories found. Make sure you have GitHub repositories.</p>
          ) : (
            <>
              <p className="mb-2">Select a repository to run PMD checks on:</p>
              <ul className="space-y-2">
                {repositories.map(repo => (
                  <li 
                    key={repo.id}
                    className="p-3 border rounded hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleSelectRepo(repo)}
                  >
                    <div className="font-medium">{repo.name}</div>
                    <div className="text-sm text-gray-600">{repo.description || 'No description'}</div>
                    <div className="text-xs mt-1">
                      <span className="mr-3">{repo.language || 'Unknown language'}</span>
                      <span>⭐ {repo.stars}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      
      {loading && <p className="mt-2 text-sm text-gray-500">Loading...</p>}
    </div>
  );
} 