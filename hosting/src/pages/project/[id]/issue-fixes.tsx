import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

interface IssueType {
  id: string;
  file: string;
  line: number;
  rule: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  fixSuggestion?: string;
  fixed: boolean;
}

export default function IssueFixesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { id } = router.query;
  const [repository, setRepository] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<IssueType | null>(null);
  const [showFixModal, setShowFixModal] = useState(false);
  
  // Sample issues data - would come from API in production
  const [issues, setIssues] = useState<IssueType[]>([
    {
      id: '1',
      file: 'src/main/java/com/example/App.java',
      line: 23,
      rule: 'UnusedImports',
      severity: 'WARNING',
      message: 'Avoid unused imports such as \'java.util.List\'',
      fixSuggestion: 'Remove the unused import:\n```java\n// Before:\nimport java.util.List;\n\n// After:\n// import removed\n```',
      fixed: false
    },
    {
      id: '2',
      file: 'src/main/java/com/example/UserService.java',
      line: 45,
      rule: 'EmptyCatchBlock',
      severity: 'ERROR',
      message: 'Empty catch block detected',
      fixSuggestion: 'Add appropriate error handling:\n```java\n// Before:\ntry {\n  // code\n} catch (Exception e) {\n  // empty\n}\n\n// After:\ntry {\n  // code\n} catch (Exception e) {\n  logger.error("Operation failed", e);\n}\n```',
      fixed: false
    },
    {
      id: '3',
      file: 'src/main/java/com/example/util/StringUtils.java',
      line: 67,
      rule: 'UnusedVariables',
      severity: 'WARNING',
      message: 'Avoid unused local variables such as \'result\'',
      fixSuggestion: 'Remove the unused variable or use it:\n```java\n// Before:\nString result = process(input);\nreturn input.trim();\n\n// After:\nreturn process(input);\n```',
      fixed: false
    },
    {
      id: '4',
      file: 'src/main/java/com/example/dao/UserRepository.java',
      line: 112,
      rule: 'AvoidDuplicateLiterals',
      severity: 'INFO',
      message: 'The String literal "user" appears 5 times in this file',
      fixSuggestion: 'Extract the String literal into a constant:\n```java\n// Before:\nString table = "user";\n// ... other occurrences of "user"\n\n// After:\nprivate static final String USER_TABLE = "user";\n// ... use USER_TABLE instead\n```',
      fixed: false
    },
    {
      id: '5',
      file: 'src/main/java/com/example/config/SecurityConfig.java',
      line: 89,
      rule: 'MethodTooLong',
      severity: 'WARNING',
      message: 'Method \'configureAuth\' is too long (156 lines)',
      fixSuggestion: 'Break down the method into smaller methods:\n```java\n// Before:\npublic void configureAuth() {\n  // 156 lines of code\n}\n\n// After:\npublic void configureAuth() {\n  configureBasicAuth();\n  configureOAuth();\n  configureJwt();\n}\n\nprivate void configureBasicAuth() {\n  // related code\n}\n\nprivate void configureOAuth() {\n  // related code\n}\n\nprivate void configureJwt() {\n  // related code\n}\n```',
      fixed: false
    },
  ]);

  useEffect(() => {
    const fetchRepository = async () => {
      if (status === 'authenticated' && session && id) {
        try {
          setLoading(true);
          const response = await fetch(`/api/github/repositories/${id}`, {
            headers: {
              'Authorization': `Bearer ${session.accessToken}`
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            setRepository(data.repository);
          } else {
            setError('Failed to fetch repository');
          }
        } catch (error) {
          console.error('Error fetching repository:', error);
          setError('Failed to fetch repository');
        } finally {
          setLoading(false);
        }
      }
    };

    fetchRepository();
  }, [status, session, id]);

  // Function to handle fixing an issue
  const handleFixIssue = (issue: IssueType) => {
    setSelectedIssue(issue);
    setShowFixModal(true);
  };

  // Function to apply a fix
  const applyFix = () => {
    if (!selectedIssue) return;
    
    // In a real app, this would make an API call to apply the fix to the codebase
    setIssues(issues.map(issue => 
      issue.id === selectedIssue.id ? { ...issue, fixed: true } : issue
    ));
    
    setShowFixModal(false);
    
    // Show success message or notification here
  };

  // Function to generate suggestions for all issues
  const generateAllSuggestions = () => {
    setIsGeneratingSuggestions(true);
    
    // Simulate API call with timeout
    setTimeout(() => {
      setIsGeneratingSuggestions(false);
      // In a real app, this would update issues with suggestions from API
    }, 2000);
  };

  // Count fixed and unfixed issues
  const fixedIssues = issues.filter(issue => issue.fixed).length;
  const totalIssues = issues.length;

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
          <p className="mb-4">Error loading project details: {error}</p>
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
        <title>Issue Fixes - {repository.name} | AI Code Fixer</title>
      </Head>
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href={`/project/${id}`} className="text-blue-600 hover:underline flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
            </svg>
            Back to Project
          </Link>
        </div>
        
        <div className="bg-white rounded-lg shadow-md mb-8">
          <div className="px-6 py-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Issue Fixes</h1>
            <div className="mt-3 sm:mt-0">
              <button
                onClick={generateAllSuggestions}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
                disabled={isGeneratingSuggestions}
              >
                {isGeneratingSuggestions ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>Generate All Suggestions</>
                )}
              </button>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3 flex-1 md:flex md:justify-between">
                <p className="text-sm text-blue-700">
                  AI will analyze the code and suggest fixes for each issue. You can review and apply these fixes.
                </p>
              </div>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-gray-600">Fix Progress</h2>
              <span className="text-sm font-medium text-gray-600">{fixedIssues} of {totalIssues} issues fixed</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-green-600 h-2.5 rounded-full" 
                style={{ width: `${(fixedIssues / totalIssues) * 100}%` }}
              ></div>
            </div>
          </div>
          
          {/* Issues list */}
          <div className="bg-white overflow-hidden">
            <ul className="divide-y divide-gray-200">
              {issues.map(issue => (
                <li key={issue.id} className={`px-6 py-4 ${issue.fixed ? 'bg-green-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-start space-x-3">
                      {issue.fixed ? (
                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-green-100 flex items-center justify-center">
                          <svg className="h-3.5 w-3.5 text-green-800" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      ) : (
                        <span className={`flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center ${
                          issue.severity === 'ERROR' ? 'bg-red-100' : 
                          issue.severity === 'WARNING' ? 'bg-yellow-100' : 'bg-blue-100'
                        }`}>
                          <svg className={`h-3.5 w-3.5 ${
                            issue.severity === 'ERROR' ? 'text-red-800' : 
                            issue.severity === 'WARNING' ? 'text-yellow-800' : 'text-blue-800'
                          }`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                      <div>
                        <div className="flex items-center">
                          <h3 className="text-sm font-medium text-gray-900">{issue.rule}</h3>
                          <span className={`ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            issue.severity === 'ERROR' ? 'bg-red-100 text-red-800' : 
                            issue.severity === 'WARNING' ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {issue.severity}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{issue.message}</p>
                        <div className="mt-1 text-xs text-gray-500 flex items-center">
                          <span className="font-medium">{issue.file}</span>
                          <span className="mx-1">:</span>
                          <span>Line {issue.line}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      {issue.fixed ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium bg-green-100 text-green-800">
                          Fixed
                        </span>
                      ) : issue.fixSuggestion ? (
                        <button
                          onClick={() => handleFixIssue(issue)}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
                        >
                          Apply Fix
                        </button>
                      ) : (
                        <button
                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                          disabled
                        >
                          No Fix Available
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
      
      {/* Fix Modal */}
      {showFixModal && selectedIssue && (
        <div className="fixed z-10 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true"></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
              <div>
                <div className="mt-3 text-center sm:mt-0 sm:text-left">
                  <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                    Apply AI-Suggested Fix
                  </h3>
                  <div className="mt-2">
                    <p className="text-sm text-gray-500 mb-4">
                      Issue: <span className="font-medium">{selectedIssue.message}</span>
                    </p>
                    <div className="bg-gray-50 rounded-md p-4 mb-4">
                      <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                        {selectedIssue.fixSuggestion}
                      </pre>
                    </div>
                    <p className="text-sm text-gray-500">
                      This change will be applied to <span className="font-medium">{selectedIssue.file}</span> at line {selectedIssue.line}.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={applyFix}
                >
                  Apply Fix
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm"
                  onClick={() => setShowFixModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 