import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { Repository } from '@/utils/github';

interface AnalysisResult {
  file: string;
  line: number;
  issue: string;
  severity: 'error' | 'warning' | 'info';
  suggestion: string;
}

interface CodeAnalysisProps {
  repository: Repository;
}

const isDev = process.env.NODE_ENV === 'development';
const BaseUrl = isDev
  ? 'http://localhost:5001/ai-code-fixer/us-central1/analysis'
  : 'https://us-central1-ai-code-fixer.cloudfunctions.net/analysis';

export default function CodeAnalysis({ repository }: CodeAnalysisProps) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const analyzeCode = async () => {
    if (!session?.accessToken) {
      setError('No access token available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BaseUrl}/analysis/latest/${repository.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repo: repository.name,
          accessToken: session.accessToken,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze code');
      }

      const data = await response.json();
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Code Analysis</h2>
        <button
          onClick={analyzeCode}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Analyzing...' : 'Analyze Code'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {results.length > 0 ? (
        <div className="space-y-4">
          {results.map((result, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${
                result.severity === 'error'
                  ? 'bg-red-50 border-red-200'
                  : result.severity === 'warning'
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">
                    {result.file}:{result.line}
                  </p>
                  <p className="text-sm text-gray-600">{result.issue}</p>
                </div>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    result.severity === 'error'
                      ? 'bg-red-100 text-red-800'
                      : result.severity === 'warning'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {result.severity}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-700">
                Suggestion: {result.suggestion}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">
            Click "Analyze Code" to start the analysis
          </p>
        </div>
      )}
    </div>
  );
} 