import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '@/context/AuthProvider';

export default function ProjectAnalysisPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const [repository, setRepository] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pmdAnalysis, setPmdAnalysis] = useState([
    { rule: 'UnusedImports', count: 5, severity: 'WARNING', description: 'Avoid unused imports' },
    { rule: 'UnusedVariables', count: 3, severity: 'WARNING', description: 'Avoid unused local variables' },
    { rule: 'EmptyCatchBlock', count: 2, severity: 'ERROR', description: 'Empty catch blocks should be avoided' },
    { rule: 'UnnecessaryFullyQualifiedName', count: 7, severity: 'INFO', description: 'Unnecessary fully qualified name detected' },
    { rule: 'AvoidDuplicateLiterals', count: 12, severity: 'WARNING', description: 'Avoid duplicate string literals' },
  ]);

          
  const isDev = process.env.NODE_ENV === 'development';
  const baseUrl = isDev
    ? 'http://localhost:5001/ai-code-fixer/us-central1/analysis'
    : 'https://us-central1-ai-code-fixer.cloudfunctions.net/analysis';

  useEffect(() => {
    // Load selected repository from localStorage
    try {
      const savedRepo = localStorage.getItem('selectedRepo');
      if (savedRepo) {
        const repoData = JSON.parse(savedRepo);
        if (repoData.id.toString() === id) {
          setRepository(repoData);
        }
      }
    } catch (e) {
      console.error('Error loading repository data:', e);
    }

    const fetchAnalysis = async () => {
      setIsLoading(true);
      try {
        const authToken = localStorage.getItem('auth_client_token') || localStorage.getItem('auth_token');
        
        if (!authToken) {
          throw new Error('Authentication token not found');
        }
        
        console.log('Fetching analysis for repo ID:', id);
        
        const response = await fetch(`${baseUrl}/refresh/${id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({ branch: 'main', repoName: repository.name, repoFullName: repository.fullName }),
          credentials: 'include'
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to refresh analysis');
        }
        
        const data = await response.json();
        setPmdAnalysis(data.analysis?.issues || []);
        
      } catch (error) {
        console.error('Error fetching analysis:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Only run the analysis if we have a valid repository ID
    if (id) {
      fetchAnalysis();
    }
  }, [id]);

  // Update the Refresh Analysis button to call the same fetchAnalysis function
  const handleRefreshAnalysis = async () => {
    setIsLoading(true);
    try {
      // Get auth token
      const authToken = localStorage.getItem('auth_client_token') || localStorage.getItem('auth_token');
      
      if (!authToken) {
        throw new Error('Authentication token not found');
      }
    
      const response = await fetch(`${baseUrl}/refresh/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ branch: 'main' }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to refresh analysis');
      }
      
      const data = await response.json();
      setPmdAnalysis(data.analysis?.issues || []);
      
    } catch (error) {
      console.error('Error refreshing analysis:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!repository) {
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
              {isLoading ? (
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
                <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
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