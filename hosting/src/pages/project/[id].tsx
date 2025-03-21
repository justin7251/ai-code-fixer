import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function ProjectPage() {
  const router = useRouter();
  const { id } = router.query;
  const [repository, setRepository] = useState<any>(null);
  
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
  }, [id]);

  function handleAnalysis() {
    // TODO: Implement analysis
    router.push(`/project/${id}/analysis`);
  }

  function handleIssueFixes() {
    // TODO: Implement issue fixes
    router.push(`/project/${id}/issue-fixes`);
  }

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
        <title>{repository.name} | AI Code Fixer</title>
      </Head>
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            ← Back to Dashboard
          </Link>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold mb-2">{repository.full_name}</h1>
          {repository.description && (
            <p className="text-gray-600 mb-6">{repository.description}</p>
          )}
          
          <div className="border-t border-gray-200 pt-6 mt-6">
            <h2 className="text-xl font-semibold mb-4">Project Analysis</h2>
            <p>
              Here you can view and manage the analysis for this repository. The actual
              analysis features will be implemented in a future update.
            </p>
            
            {/* Placeholder for analysis features */}
            <div className="grid gap-4 md:grid-cols-2 mt-6">
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h3 className="font-medium mb-2">Code Analysis</h3>
                <p className="text-sm text-gray-600">
                  Analyze your code for potential issues and improvements.
                </p>
                <button 
                  className="mt-3 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  onClick={handleAnalysis}
                >
                  Start Analysis
                </button>
              </div>
              
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h3 className="font-medium mb-2">Issue Fixes</h3>
                <p className="text-sm text-gray-600">
                  View and apply AI-suggested fixes for issues in your code.
                </p>
                <button 
                  className="mt-3 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                  onClick={handleIssueFixes}
                >
                  View Issues
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 