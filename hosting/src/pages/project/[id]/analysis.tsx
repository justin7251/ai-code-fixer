import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '@/context/AuthProvider';
import { useSession } from 'next-auth/react';
import { ApiClient } from '../../../utils/apiClient';
import toast from 'react-hot-toast';

export default function ProjectAnalysisPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { id } = router.query;
  const [repository, setRepository] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pmdAnalysis, setPmdAnalysis] = useState([
    { rule: 'UnusedImports', count: 5, severity: 'WARNING', description: 'Avoid unused imports' },
    { rule: 'UnusedVariables', count: 3, severity: 'WARNING', description: 'Avoid unused local variables' },
    { rule: 'EmptyCatchBlock', count: 2, severity: 'ERROR', description: 'Empty catch blocks should be avoided' },
    { rule: 'UnnecessaryFullyQualifiedName', count: 7, severity: 'INFO', description: 'Unnecessary fully qualified name detected' },
    { rule: 'AvoidDuplicateLiterals', count: 12, severity: 'WARNING', description: 'Avoid duplicate string literals' },
  ]);

  // Using ApiClient for all requests
  const apiClient = new ApiClient({ session });

  useEffect(() => {
    const fetchRepository = async () => {
      if (!session?.accessToken || !id) {
        return;
      }

      try {
        // Only fetch if we don't already have this repository
        if (repository && repository.id === Number(id)) {
          return;
        }

        setLoading(true);

        // Update to use ApiClient
        const data = await apiClient.getRepository(session.accessToken, id);
        
        if (data && data.repository) {
          setRepository(data.repository);
        } else {
          setError('Failed to fetch repository details');
        }
      } catch (error) {
        console.error('Error fetching repository:', error);
        setError('Failed to fetch repository');
      } finally {
        setLoading(false);
      }
    };

    fetchRepository();
  }, [id, session?.accessToken]);

  // Separate loading state for analysis
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  useEffect(() => {
    // Only fetch analysis once we have repository data and haven't already loaded it
    if (!repository || analysisComplete || !session?.accessToken || !id) {
      return;
    }

    const fetchAnalysis = async () => {
      try {
        setAnalysisLoading(true);
        
        // Ensure repository has required properties
        if (!repository.name) {
          console.error('Repository name is missing', repository);
          setError('Repository missing required data');
          setAnalysisLoading(false);
          return;
        }
        
        const repoName = repository.name;
        // Ensure repoFullName is always a string by providing a default empty string
        const repoFullName = (repository.full_name || repository.fullName || '').toString();
        
        if (!repoFullName) {
          console.warn('Repository full name is missing, this may cause analysis to fail', repository);
        }
        
        console.log('Fetching analysis with data:', {
          repoId: id,
          repoName,
          repoFullName,
          branch: 'main'
        });
        
        // Use ApiClient instead of direct fetch
        const response = await apiClient.getRepositoryAnalysis(session.accessToken, id, {
          branch: 'main', 
          repoName: repoName, 
          repoFullName: repoFullName
        });
        
        if (response?.success === false && response?.message === 'Repository not found') {
          setError(`Repository not found (ID: ${id}). Please check if this repository exists and you have access to it.`);
        } else if (response?.analysis?.issues) {
          setPmdAnalysis(response.analysis.issues);
          setAnalysisComplete(true);
        } else {
          console.warn('Unexpected analysis response format:', response);
          setError('Unexpected response format from analysis service');
        }
      } catch (error) {
        console.error('Error fetching analysis:', error);
        setError('Failed to fetch analysis');
      } finally {
        setAnalysisLoading(false);
      }
    };
    
    fetchAnalysis();
  }, [repository, session?.accessToken, id, analysisComplete]);

  // Update the Refresh Analysis button to call the analysis with a manual flag
  const handleRefreshAnalysis = async () => {
    if (!session?.accessToken || !id) {
      toast.error('You must be logged in to refresh analysis');
      return;
    }

    if (!repository || !repository.name) {
      setError('Cannot refresh analysis: Repository data is missing');
      return;
    }

    try {
      setAnalysisLoading(true);
      setError(''); // Clear any previous errors
      
      const repoName = repository.name;
      const repoFullName = (repository.full_name || repository.fullName || '').toString();
      
      console.log('Refreshing analysis with data:', {
        repoId: id,
        repoName,
        repoFullName,
        branch: 'main',
        forceRefresh: true
      });
      
      // Use the refreshRepositoryAnalysis method from apiClient
      const response = await apiClient.refreshRepositoryAnalysis(session.accessToken, id, {
        branch: 'main',
        repoName: repoName,
        repoFullName: repoFullName,
        forceRefresh: true
      });
      
      console.log('Refresh response:', response);
      
      if (response?.success === false) {
        // Handle known error cases
        if (response?.message === 'Repository not found') {
          setError(`Repository not found (ID: ${id}). Please check if this repository exists and you have access to it.`);
          toast.error('Repository not found');
        } else if (response?.message === 'Method not allowed') {
          setError('Method not allowed by the API. Please check backend configuration.');
          toast.error('API configuration error');
        } else if (response?.message === 'Token verification failed: Token is not in valid JWT format') {
          setError('Authentication error. Please try logging out and logging back in.');
          toast.error('Authentication error');
        } else {
          setError(response?.message || 'Failed to refresh analysis');
          toast.error('Failed to refresh analysis');
        }
      } else if (response?.analysis?.issues) {
        setPmdAnalysis(response.analysis.issues);
        toast.success('Analysis refreshed successfully');
      } else {
        console.warn('Unexpected analysis response format:', response);
        setError('Unexpected response format from analysis service');
        toast.error('Unexpected response format');
      }
    } catch (error) {
      console.error('Error refreshing analysis:', error);
      setError('Failed to refresh analysis: ' + (error instanceof Error ? error.message : String(error)));
      toast.error('Failed to refresh analysis');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleAnalysis = async () => {
    if (!session?.accessToken || !id) {
      toast.error('You must be logged in to analyze a repository');
      return;
    }

    try {
      setAnalysisLoading(true);
      const response = await apiClient.analyzeRepository(session.accessToken, id);
      
      if (response && response.success) {
        toast.success('Analysis started successfully');
        router.push(`/project/${id}/issue-fixes`);
      } else {
        setError('Failed to start analysis');
        toast.error('Failed to start analysis');
      }
    } catch (error) {
      console.error('Error starting analysis:', error);
      setError('Failed to start analysis');
      toast.error('Failed to start analysis');
    } finally {
      setAnalysisLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4">Loading project details...</p>
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4">{error}</p>
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>PMD Analysis - {repository.name} | AI Code Fixer</title>
      </Head>
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href={`/project/${id}`} className="text-blue-600 hover:underline">
            ← Back to Project
          </Link>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">PMD Analysis Results</h1>
            <button 
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center"
              onClick={handleRefreshAnalysis}
            >
              {analysisLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Running Analysis...
                </>
              ) : (
                "Refresh Analysis"
              )}
            </button>
          </div>
          
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  Found <span className="font-medium">{pmdAnalysis.reduce((sum, item) => sum + item.count, 0)}</span> potential issues in your codebase.
                </p>
              </div>
            </div>
          </div>
          
          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-2">Warnings Breakdown</h2>
            <p className="text-gray-600 text-sm">This table shows a summary of PMD warnings detected in your code.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rule
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Count
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Severity
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pmdAnalysis.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 hover:underline cursor-pointer">
                      {item.rule}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        item.severity === 'ERROR' 
                          ? 'bg-red-100 text-red-800' 
                          : item.severity === 'WARNING'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-blue-100 text-blue-800'
                      }`}>
                        {item.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {item.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-8 border-t border-gray-200 pt-6">
            <h2 className="text-lg font-semibold mb-4">Actions</h2>
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              <div className="border border-gray-200 rounded p-4 bg-gray-50">
                <h3 className="font-medium mb-2">Generate Fix Suggestions</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Let AI suggest fixes for the detected issues in your code.
                </p>
                <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700" onClick={handleAnalysis}>
                  Generate Suggestions
                </button>
              </div>
              
              <div className="border border-gray-200 rounded p-4 bg-gray-50">
                <h3 className="font-medium mb-2">Export Analysis</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Export this analysis report as CSV or JSON for your records.
                </p>
                <div className="flex space-x-2">
                  <button className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
                    Export CSV
                  </button>
                  <button className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
                    Export JSON
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