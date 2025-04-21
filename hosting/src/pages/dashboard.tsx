import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthProvider';
import { useSession } from 'next-auth/react';


export default function Dashboard() {
  const { user, loading, checkAuth } = useAuth();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [repositories, setRepositories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedRepo, setSelectedRepo] = useState<any>(null);
  
  // Repository selector state
  const [showRepoSelector, setShowRepoSelector] = useState(false);
  const [availableRepos, setAvailableRepos] = useState<any[]>([]);
  const [repoSearchTerm, setRepoSearchTerm] = useState('');
  const [isLoadingAvailableRepos, setIsLoadingAvailableRepos] = useState(false);
  const [selectedReposToAdd, setSelectedReposToAdd] = useState<any[]>([]);
  const [isAddingRepos, setIsAddingRepos] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Function to extract token from URL fragment
  useEffect(() => {
    const processHashToken = async () => {
      if (typeof window !== 'undefined' && window.location.hash) {
        try {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const token = hashParams.get('token');
          
          if (token) {
            console.log('[DASHBOARD] Found token in URL fragment, processing...');
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
          }
        } catch (error) {
          console.error('[DASHBOARD] Error processing URL fragment:', error);
        }
      }
    };
    
    processHashToken();
  }, [checkAuth]);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated' && !loading && !user) {
      router.push('/');
    }
  }, [status, user, loading, router]);

  // Effect to handle clicks outside the dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowRepoSelector(false);
      }
    }
    
    // Add event listener
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      // Clean up
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownRef]);

  const fetchRepositories = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      if (!session?.accessToken) {
        throw new Error('Authentication token not found. Please log in again.');
      }
      
      const response = await fetch('https://api.github.com/user/repos', {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || `Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Fetched repositories:', data.length);
      setRepositories(data);
      
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
      setIsLoading(false);
    }
  };
  
  // Function to fetch available GitHub repositories
  const fetchAvailableRepositories = async () => {
    setIsLoadingAvailableRepos(true);
    
    try {
      if (!session?.accessToken) {
        throw new Error('Authentication token not found. Please log in again.');
      }
      
      const response = await fetch('https://api.github.com/user/repos', {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || `Error: ${response.status}`);
      }
      
      const data = await response.json();
      setAvailableRepos(data);
    } catch (error) {
      console.error('Failed to fetch available repositories:', error);
      setError(`Failed to load available repositories: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoadingAvailableRepos(false);
    }
  };
  
  // Function to add selected repositories
  const addSelectedRepositories = async () => {
    if (selectedReposToAdd.length === 0) return;
    
    setIsAddingRepos(true);
    
    try {
      // Always use the production URL to avoid CORS issues
      const baseUrl = 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth';
      
      // Get token from localStorage
      const token = localStorage.getItem('auth_client_token') || localStorage.getItem('auth_token');
      
      if (!token) {
        throw new Error('Authentication token not found. Please log in again.');
      }
      
      const response = await fetch(`${baseUrl}/github/add-repos`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          repositories: selectedReposToAdd
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || data.message || `Error: ${response.status}`);
      }
      
      // Update repositories from the response
      if (data.repositories) {
        setRepositories(data.repositories);
      } else {
        // Fetch repositories if not returned in response
        await fetchRepositories();
      }
      
      // Close the dropdown and reset selection
      setShowRepoSelector(false);
      setSelectedReposToAdd([]);
      
    } catch (error) {
      console.error('Failed to add repositories:', error);
      setError(`Failed to add repositories: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsAddingRepos(false);
    }
  };
  
  // Fetch repositories when session is available
  useEffect(() => {
    if (status === 'authenticated' && session?.accessToken) {
      fetchRepositories();
    }
  }, [status, session?.accessToken]);
  
  // Filter and search repositories
  const filteredRepositories = repositories.filter(repo => {
    // Apply text search
    const matchesSearch = repo.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         repo.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Apply status filter
    const matchesFilter = activeFilter === 'all' || 
                         (activeFilter === 'active' && repo.status === 'active') ||
                         (activeFilter === 'completed' && repo.status === 'completed') ||
                         (activeFilter === 'not_started' && repo.status === 'not_started');
    
    return matchesSearch && matchesFilter;
  });
  
  // Filter available repositories by search term
  const filteredAvailableRepos = availableRepos.filter(repo =>
    repo.name.toLowerCase().includes(repoSearchTerm.toLowerCase()) ||
    repo.full_name.toLowerCase().includes(repoSearchTerm.toLowerCase())
  );
  
  // Function to toggle repository selection
  const toggleRepoSelection = (repo: any) => {
    if (selectedReposToAdd.some(r => r.id === repo.id)) {
      setSelectedReposToAdd(prev => prev.filter(r => r.id !== repo.id));
    } else {
      setSelectedReposToAdd(prev => [...prev, repo]);
    }
  };
  
  // Get counts for dashboard stats
  const totalIssues = repositories.reduce((sum, repo) => sum + (repo.issues_count || 0), 0);
  const fixedIssues = repositories.reduce((sum, repo) => sum + (repo.fixed_issues || 0), 0);
  const fixRate = totalIssues > 0 ? Math.round((fixedIssues / totalIssues) * 100) : 0;
  
  const handleSelectRepository = (repository: any) => {
    // Save selected repository to localStorage
    localStorage.setItem('selectedRepo', JSON.stringify(repository));
    setSelectedRepo(repository);
    // Navigate to project page
    router.push(`/project/${repository.id}`);
  };
  
  const handleAddRepository = () => {
    // Show repository selector dropdown and fetch available repositories
    setShowRepoSelector(true);
    fetchAvailableRepositories();
  };
  
  const handleRefresh = () => {
    fetchRepositories();
  };
  
  // Check authentication status
  useEffect(() => {
    if (status === 'unauthenticated' && !loading) {
      router.push('/');
    }
  }, [status, loading, router]);

  // If loading or not authenticated, show loading state
  if (loading || status === 'loading' || !session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-16 h-16 border-t-4 border-blue-500 border-solid rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Dashboard | AI Code Fixer</title>
        <meta name="description" content="Manage your projects and view code improvement suggestions" />
      </Head>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error message */}
        {error && (
          <div className="mb-8 bg-red-50 border-l-4 border-red-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Stats overview */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Projects
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        {repositories.length}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Issues Identified
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        {totalIssues}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Fix Rate
                    </dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">
                        {fixRate}%
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Repository list section */}
        <div className="bg-white shadow rounded-lg mb-8">
          <div className="px-6 py-5 border-b border-gray-200 sm:flex sm:items-center sm:justify-between">
            <h2 className="text-lg font-medium text-gray-900">Your Projects</h2>
            <div className="mt-3 sm:mt-0 sm:ml-4 relative">
              <button
                onClick={handleAddRepository}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-offset-2"
              >
                <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add Repository
              </button>
              
              {/* Repository Selector Dropdown */}
              {showRepoSelector && (
                <div
                  ref={dropdownRef}
                  className="absolute right-0 mt-2 w-96 bg-white rounded-md shadow-lg z-10 overflow-hidden"
                  style={{ maxHeight: '500px' }}
                >
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-lg font-medium text-gray-900">Add GitHub Repositories</h3>
                      <button 
                        onClick={() => setShowRepoSelector(false)}
                        className="text-gray-400 hover:text-gray-500"
                      >
                        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="Search repositories..."
                        value={repoSearchTerm}
                        onChange={(e) => setRepoSearchTerm(e.target.value)}
                      />
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  
                  {isLoadingAvailableRepos ? (
                    <div className="p-4 text-center">
                      <svg className="animate-spin h-6 w-6 mx-auto text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <p className="mt-2 text-sm text-gray-500">Loading repositories...</p>
                    </div>
                  ) : filteredAvailableRepos.length === 0 ? (
                    <div className="p-4 text-center">
                      <svg className="h-6 w-6 mx-auto text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="mt-2 text-sm text-gray-500">No repositories found</p>
                    </div>
                  ) : (
                    <div className="overflow-y-auto" style={{ maxHeight: '300px' }}>
                      <ul className="divide-y divide-gray-200">
                        {filteredAvailableRepos.map(repo => (
                          <li key={repo.id} className="p-4 hover:bg-gray-50">
                            <div className="flex items-start">
                              <div className="flex-shrink-0">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                  checked={selectedReposToAdd.some(r => r.id === repo.id)}
                                  onChange={() => toggleRepoSelection(repo)}
                                />
                              </div>
                              <div className="ml-3 flex-1">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-medium text-gray-900">{repo.name}</p>
                                  {repo.private && (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                      Private
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-500">{repo.full_name}</p>
                                {repo.description && (
                                  <p className="mt-1 text-sm text-gray-600 line-clamp-2">{repo.description}</p>
                                )}
                                <div className="mt-1 flex items-center">
                                  <span className="text-xs text-gray-500">
                                    {repo.language || 'No language detected'}
                                  </span>
                                  <span className="mx-1 text-gray-300">•</span>
                                  <span className="text-xs text-gray-500">
                                    Updated {new Date(repo.updated_at).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  <div className="p-4 bg-gray-50 border-t border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">
                        {selectedReposToAdd.length} {selectedReposToAdd.length === 1 ? 'repository' : 'repositories'} selected
                      </span>
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          className="inline-flex justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          onClick={() => setShowRepoSelector(false)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={`inline-flex justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white ${
                            selectedReposToAdd.length === 0 || isAddingRepos
                              ? 'bg-blue-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                          }`}
                          onClick={addSelectedRepositories}
                          disabled={selectedReposToAdd.length === 0 || isAddingRepos}
                        >
                          {isAddingRepos ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Adding...
                            </>
                          ) : (
                            'Add Repositories'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Search and filter bar */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div className="relative flex-grow max-w-lg">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Search repositories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="mt-3 md:mt-0 flex flex-wrap">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`mr-2 mt-2 md:mt-0 px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium ${
                    activeFilter === 'all' 
                      ? 'bg-gray-900 text-white' 
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActiveFilter('active')}
                  className={`mr-2 mt-2 md:mt-0 px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium ${
                    activeFilter === 'active' 
                      ? 'bg-yellow-600 text-white' 
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  In Progress
                </button>
                <button
                  onClick={() => setActiveFilter('completed')}
                  className={`mr-2 mt-2 md:mt-0 px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium ${
                    activeFilter === 'completed' 
                      ? 'bg-green-600 text-white' 
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Completed
                </button>
                <button
                  onClick={() => setActiveFilter('not_started')}
                  className={`mt-2 md:mt-0 px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium ${
                    activeFilter === 'not_started' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Not Started
                </button>
              </div>
            </div>
          </div>
          
          {/* Repositories list */}
          {isLoading ? (
            <div className="px-6 py-12 text-center">
              <svg className="animate-spin h-8 w-8 mx-auto text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="mt-4 text-gray-500">Loading your repositories...</p>
            </div>
          ) : filteredRepositories.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No repositories found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm ? `No results for "${searchTerm}"` : 'Try adding a repository or changing your filter criteria'}
              </p>
              <div className="mt-6">
                <button
                  onClick={handleAddRepository}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Add Repository
                </button>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredRepositories.map((repo) => (
                <li key={repo.id} className="px-6 py-5 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <span className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-blue-100 text-blue-800 text-lg font-medium">
                            {repo.language ? repo.language.charAt(0) : '?'}
                          </span>
                        </div>
                        <div className="ml-4">
                          <h2 className="text-base font-medium text-gray-900 truncate">{repo.name}</h2>
                          <div className="mt-1 flex items-center">
                            <span className="text-sm text-gray-500 truncate">{repo.full_name}</span>
                            {repo.private && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                Private
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2">
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {repo.description || 'No description available'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="ml-6 flex-shrink-0 flex flex-col items-end">
                      <div className="flex items-center space-x-4">
                        <span 
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            repo.status === 'active' 
                              ? 'bg-yellow-100 text-yellow-800' 
                              : repo.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {repo.status === 'active' 
                            ? 'In Progress' 
                            : repo.status === 'completed'
                              ? 'Completed'
                              : 'Not Started'}
                        </span>
                        <button
                          onClick={() => handleSelectRepository(repo)}
                          className="inline-flex items-center justify-center p-2 border border-transparent rounded-full shadow-sm text-blue-600 bg-blue-100 hover:bg-blue-200 focus:outline-none"
                        >
                          <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                      
                      {(repo.issues_count > 0 || repo.fixed_issues > 0) && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>Issues fixed: {repo.fixed_issues || 0}/{repo.issues_count || 0}</span>
                            <span className="ml-2">
                              {repo.issues_count ? Math.round(((repo.fixed_issues || 0) / repo.issues_count) * 100) : 0}%
                            </span>
                          </div>
                          <div className="mt-1 w-32 bg-gray-200 rounded-full h-1.5">
                            <div 
                              className="bg-green-600 h-1.5 rounded-full" 
                              style={{ width: `${repo.issues_count ? ((repo.fixed_issues || 0) / repo.issues_count) * 100 : 0}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        {/* Recent activity */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-5 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
          </div>
          
          <div className="px-6 py-5">
            <div className="flow-root">
              <ul className="-mb-8">
                <li>
                  <div className="relative pb-8">
                    <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
                    <div className="relative flex space-x-3">
                      <div>
                        <span className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center ring-8 ring-white">
                          <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                        <div>
                          <p className="text-sm text-gray-500">Fixed <span className="font-medium text-gray-900">Empty Catch Block</span> issue in <span className="font-medium text-blue-600">Inventory Management</span></p>
                        </div>
                        <div className="text-right text-sm whitespace-nowrap text-gray-500">
                          3h ago
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
                <li>
                  <div className="relative pb-8">
                    <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
                    <div className="relative flex space-x-3">
                      <div>
                        <span className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center ring-8 ring-white">
                          <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                        <div>
                          <p className="text-sm text-gray-500">Completed code analysis for <span className="font-medium text-blue-600">E-commerce Backend</span></p>
                        </div>
                        <div className="text-right text-sm whitespace-nowrap text-gray-500">
                          1d ago
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
                <li>
                  <div className="relative pb-8">
                    <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true"></span>
                    <div className="relative flex space-x-3">
                      <div>
                        <span className="h-8 w-8 rounded-full bg-yellow-500 flex items-center justify-center ring-8 ring-white">
                          <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                        <div>
                          <p className="text-sm text-gray-500">Generated fix suggestions for <span className="font-medium text-blue-600">Payment Gateway</span></p>
                        </div>
                        <div className="text-right text-sm whitespace-nowrap text-gray-500">
                          2d ago
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
                <li>
                  <div className="relative pb-8">
                    <div className="relative flex space-x-3">
                      <div>
                        <span className="h-8 w-8 rounded-full bg-purple-500 flex items-center justify-center ring-8 ring-white">
                          <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M11 17a1 1 0 001.447.894l4-2A1 1 0 0017 15V9.236a1 1 0 00-1.447-.894l-4 2a1 1 0 00-.553.894V17zM15.211 6.276a1 1 0 000-1.788l-4.764-2.382a1 1 0 00-.894 0L4.789 4.488a1 1 0 000 1.788l4.764 2.382a1 1 0 00.894 0l4.764-2.382zM4.447 8.342A1 1 0 003 9.236V15a1 1 0 00.553.894l4 2A1 1 0 009 17v-5.764a1 1 0 00-.553-.894l-4-2z" />
                          </svg>
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                        <div>
                          <p className="text-sm text-gray-500">Added <span className="font-medium text-blue-600">Inventory Management</span> repository</p>
                        </div>
                        <div className="text-right text-sm whitespace-nowrap text-gray-500">
                          3d ago
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
            <div className="mt-6 text-center">
              <Link href="#" className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none">
                View All Activity
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}