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
  private: boolean;
}

interface RepoHistoryItem {
  repoId: number;
  repoName: string;
  repoFullName: string;
  selectedAt: any; // Firestore timestamp
}

export default function RepoSelector() {
  const { isAuthenticated, user } = useAuth();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repoHistory, setRepoHistory] = useState<RepoHistoryItem[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Fetch repositories and history when component mounts
  useEffect(() => {
    if (isAuthenticated) {
      fetchRepositories();
      fetchRepoHistory();
    }
    
    // Check if there's a previously selected repo in localStorage
    const savedRepo = localStorage.getItem('selectedRepo');
    if (savedRepo) {
      try {
        const parsedRepo = JSON.parse(savedRepo);
        setSelectedRepo(parsedRepo);
      } catch (e) {
        console.error('Error parsing saved repo:', e);
      }
    }
  }, [isAuthenticated, user]);

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
      setError(`Failed to load repositories: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch user's repository history
  const fetchRepoHistory = async () => {
    if (!isAuthenticated || !user) return;
    
    setHistoryLoading(true);
    
    try {
      const isDev = process.env.NODE_ENV === 'development';
      const baseUrl = isDev
        ? 'http://localhost:5001/ai-code-fixer/us-central1/auth'
        : 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth';
      
      const response = await fetch(`${baseUrl}/user/repo-history`, {
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('Repository history fetch error:', data);
        throw new Error(data.message || `Error: ${response.status}`);
      }
      
      console.log('Fetched repository history:', data.repoHistory?.length || 0);
      setRepoHistory(data.repoHistory || []);
    } catch (error) {
      console.error('Failed to fetch repository history:', error);
      // Don't show error to user for history
    } finally {
      setHistoryLoading(false);
    }
  };

  // Handle repository selection with Firebase storage
  const handleSelectRepo = async (repo: Repository) => {
    try {
      setLoading(true);
      setError('');
      
      // 1. Optimistically update UI immediately
      setSelectedRepo(repo);
      localStorage.setItem('selectedRepo', JSON.stringify(repo));
      
      // 2. Send to backend for storage in Firebase
      const isDev = process.env.NODE_ENV === 'development';
      const baseUrl = isDev
        ? 'http://localhost:5001/ai-code-fixer/us-central1/auth'
        : 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth';
      
      // Get current user ID if available
      const userId = user?.githubId;
      
      // Don't await this - fire and forget
      fetch(`${baseUrl}/github/select-repo`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repoId: repo.id,
          repoName: repo.name,
          repoFullName: repo.full_name,
          userId: userId // Include userId if available
        })
      }).then(response => {
        if (response.ok) {
          console.log('[DEBUG] Repository selection stored in Firebase');
          // Refresh history after selection
          fetchRepoHistory();
        } else {
          console.log('[DEBUG] Could not store in Firebase, but UI is updated');
        }
      }).catch(err => {
        console.log('[DEBUG] Error storing selection:', err);
        
        // Fallback to beacon API if fetch fails
        if (navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify({
            repoId: repo.id,
            repoName: repo.name,
            repoFullName: repo.full_name,
            userId: userId,
            timestamp: Date.now()
          })], { type: 'application/json' });
          
          navigator.sendBeacon(`${baseUrl}/github/select-repo/beacon`, blob);
          console.log('[DEBUG] Selection sent via beacon as fallback');
        }
      });
      
    } catch (error) {
      console.error('[DEBUG] Error in repository selection:', error);
      // Don't reset selected repo on error since localStorage is already updated
      setError(`There was an issue with your selection. However, your choice has been saved locally.`);
    } finally {
      setLoading(false);
    }
  };

  // Render repository history section
  const renderRepoHistory = () => {
    if (!showHistory) return null;
    
    return (
      <div className="mt-6 border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-md font-medium text-gray-900">Recently Selected Repositories</h3>
          <button 
            onClick={() => setShowHistory(false)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Hide History
          </button>
        </div>
        
        {historyLoading ? (
          <div className="py-4 text-center text-gray-500">Loading history...</div>
        ) : repoHistory.length === 0 ? (
          <div className="py-4 text-center text-gray-500">No repository history found</div>
        ) : (
          <div className="space-y-2">
            {repoHistory.map(item => (
              <div 
                key={item.repoId} 
                className="flex items-center justify-between p-3 rounded-md hover:bg-gray-50 cursor-pointer border border-gray-100"
                onClick={() => {
                  // Find the full repo object if available
                  const fullRepo = repositories.find(r => r.id === item.repoId);
                  if (fullRepo) {
                    handleSelectRepo(fullRepo);
                  } else {
                    // Create minimal repo object from history
                    const historyRepo: Repository = {
                      id: item.repoId,
                      name: item.repoName,
                      full_name: item.repoFullName,
                      description: '',
                      url: '',
                      default_branch: '',
                      stars: 0,
                      language: '',
                      private: false,
                    };
                    handleSelectRepo(historyRepo);
                  }
                }}
              >
                <div className="flex items-center">
                  <div className="mr-3 text-blue-500">
                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium">{item.repoName}</div>
                    <div className="text-xs text-gray-500">{item.repoFullName}</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  {item.selectedAt?.toDate ? 
                    new Date(item.selectedAt.toDate()).toLocaleDateString() : 
                    'Recently'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
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
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 shadow-sm">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}
      
      {selectedRepo ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-blue-50 border-b border-blue-100 px-6 py-4">
            <h3 className="text-lg font-semibold text-blue-900">Selected Repository</h3>
          </div>
          
          <div className="p-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 bg-blue-100 rounded-full p-3">
                <svg className="h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
              </div>
              
              <div className="flex-1">
                <h4 className="text-xl font-bold text-gray-900">{selectedRepo.name}</h4>
                <p className="text-sm text-gray-500 mt-1">{selectedRepo.full_name}</p>
                
                {selectedRepo.description && (
                  <div className="mt-3 text-gray-700">{selectedRepo.description}</div>
                )}
                
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedRepo.language && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {selectedRepo.language}
                    </span>
                  )}
                  {selectedRepo.private && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      Private
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex flex-col sm:flex-row sm:space-x-4 space-y-3 sm:space-y-0">
              <button
                onClick={() => {
                  window.location.href = `/project/${selectedRepo.id}`;
                }}
                className="inline-flex justify-center items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-150"
              >
                <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Go to Project
              </button>
              <button
                onClick={() => {
                  setSelectedRepo(null);
                  localStorage.removeItem('selectedRepo');
                }}
                className="inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150"
              >
                <svg className="-ml-1 mr-2 h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                </svg>
                Change Repository
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">Repository Selection</h3>
            <p className="mt-1 text-sm text-gray-500">Choose a repository to analyze with our AI tools</p>
          </div>
          
          <div className="p-6">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <svg className="animate-spin h-10 w-10 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-gray-500 font-medium">Loading repositories...</p>
                <p className="text-sm text-gray-400 mt-2">This may take a moment</p>
              </div>
            ) : repositories.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="bg-gray-100 rounded-full p-3 mb-4">
                  <svg className="h-8 w-8 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">No repositories found</h4>
                <p className="text-gray-500 max-w-md mb-4">
                  We couldn't find any GitHub repositories associated with your account. Make sure you have repositories on GitHub.
                </p>
                <button
                  onClick={fetchRepositories}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  Retry
                </button>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                  {repositories.map(repo => (
                    <div 
                      key={repo.id}
                      onClick={() => handleSelectRepo(repo)}
                      className="relative rounded-lg border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow duration-200 cursor-pointer hover:border-blue-300 overflow-hidden group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      
                      <div className="relative">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors duration-200">{repo.name}</h4>
                            <p className="text-sm text-gray-500">{repo.full_name}</p>
                          </div>
                          <div className="bg-blue-50 rounded-full p-2">
                            <svg className="h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h14a1 1 0 001-1V4a1 1 0 00-1-1H3zm0 2h14v10H3V5z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                        
                        {repo.description && (
                          <p className="mt-3 text-sm text-gray-600 line-clamp-2">{repo.description}</p>
                        )}
                        
                        <div className="mt-4 flex items-center space-x-3">
                          {repo.language && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {repo.language}
                            </span>
                          )}
                          {repo.private && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              <svg className="-ml-0.5 mr-1.5 h-2 w-2 text-gray-500" fill="currentColor" viewBox="0 0 8 8">
                                <circle cx="4" cy="4" r="3" />
                              </svg>
                              Private
                            </span>
                          )}
                        </div>
                        
                        <div className="absolute bottom-0 right-0 transform translate-y-1/2 translate-x-1/2 bg-blue-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <svg className="h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={fetchRepositories}
                    disabled={loading}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150"
                  >
                    <svg className="-ml-1 mr-2 h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                    </svg>
                    {loading ? 'Refreshing...' : 'Refresh Repositories'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      
      {renderRepoHistory()}
    </div>
  );
} 