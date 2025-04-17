import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function AuthError() {
  const router = useRouter();
  const [error, setError] = useState<string>('');
  
  useEffect(() => {
    // Get error message from URL query params
    const { error: errorCode, error_description } = router.query;
    
    if (errorCode) {
      let errorMessage = '';
      
      // Handle known error codes
      switch (errorCode) {
        case 'OAuthSignin':
          errorMessage = 'There was a problem starting the GitHub sign-in process. Please check your GitHub OAuth application settings.';
          break;
        case 'Configuration':
          errorMessage = 'There is a problem with the server configuration. Please check your environment variables.';
          break;
        case 'AccessDenied':
          errorMessage = 'You do not have permission to sign in.';
          break;
        case 'Verification':
          errorMessage = 'The token has expired or has already been used.';
          break;
        case 'OAuthCallback':
          errorMessage = 'There was a problem with the GitHub authentication. Please check that your GitHub OAuth application is configured correctly.';
          break;
        default:
          errorMessage = 'An unknown error occurred during authentication.';
      }
      
      // Add description if available
      if (error_description) {
        errorMessage += ` Details: ${error_description}`;
      }
      
      setError(errorMessage);
    } else {
      setError('An unknown authentication error occurred.');
    }
  }, [router.query]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <Head>
        <title>Authentication Error - AI Code Fixer</title>
      </Head>
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Authentication Error
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-red-600 mb-4">
            {error}
          </div>
          
          <div className="mt-6">
            <Link href="/" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              Return to Home
            </Link>
          </div>
          
          <div className="mt-4 text-sm text-gray-600">
            <p>If you continue to experience issues, please:</p>
            <ul className="list-disc pl-5 mt-2">
              <li>Check that your GitHub OAuth application is properly configured</li>
              <li>Verify that your callback URL is set to: http://localhost:3000/api/auth/callback/github</li>
              <li>Ensure your environment variables are set correctly</li>
              <li>Try clearing your browser cookies and cache</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 