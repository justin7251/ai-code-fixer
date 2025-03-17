import { useAuth } from '@/context/AuthProvider';
import { useEffect, useState } from 'react';
import Head from 'next/head';

export default function AuthDebug() {
  const { user, loading, login, logout } = useAuth();
  const [cookieInfo, setCookieInfo] = useState<Record<string, boolean>>({});
  const [localStorageInfo, setLocalStorageInfo] = useState<Record<string, string>>({});
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [directResponse, setDirectResponse] = useState<any>(null);
  const [directLoading, setDirectLoading] = useState(false);
  const [exchangeStatus, setExchangeStatus] = useState<string | null>(null);
  const [exchangeLoading, setExchangeLoading] = useState(false);

  // Function to check and format cookies
  const checkCookies = () => {
    const cookieObj: Record<string, boolean> = {};
    const cookies = document.cookie.split(';').map(c => c.trim());
    
    // Check for specific cookies
    const specificCookies = ['auth_token', 'auth_client', 'user_data', 'test_cookie', 'auth_flag'];
    specificCookies.forEach(name => {
      cookieObj[name] = cookies.some(c => c.startsWith(`${name}=`));
    });
    
    // Add count of all cookies
    cookieObj['cookie_count'] = cookies.length > 0;
    cookieObj['all_cookies'] = cookies.length > 0;
    
    setCookieInfo(cookieObj);
  };

  // Function to check localStorage
  const checkLocalStorage = () => {
    const storageObj: Record<string, string> = {};
    
    try {
      const keys = ['auth_state', 'user', 'auth_client_token', 'auth_token'];
      keys.forEach(key => {
        const value = localStorage.getItem(key);
        storageObj[key] = value ? (key === 'user' ? 'JSON Object Present' : value) : 'null';
      });
    } catch (e) {
      console.error('Error accessing localStorage:', e);
      storageObj['error'] = String(e);
    }
    
    setLocalStorageInfo(storageObj);
  };

  // Function to check session API
  const checkSessionApi = async () => {
    setApiLoading(true);
    try {
      const response = await fetch('/api/auth/session', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      const data = await response.json();
      setApiResponse(data);
    } catch (e) {
      setApiResponse({ error: String(e) });
    } finally {
      setApiLoading(false);
    }
  };

  // Function to check direct API
  const checkDirectApi = async () => {
    setDirectLoading(true);
    try {
      const isDev = process.env.NODE_ENV === 'development';
      const baseUrl = isDev 
        ? 'http://localhost:5001/ai-code-fixer/us-central1/auth'
        : 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth';
      
      // Get token from localStorage or auth_client cookie
      let token = localStorage.getItem('auth_client_token');
      if (!token) {
        const cookies = document.cookie.split(';');
        const authCookie = cookies.find(c => c.trim().startsWith('auth_client='));
        if (authCookie) {
          token = authCookie.split('=')[1].trim();
        }
      }
      
      if (!token) {
        setDirectResponse({ error: 'No token available in localStorage or cookies' });
        setDirectLoading(false);
        return;
      }
      
      const response = await fetch(`${baseUrl}/verify-session`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      const data = await response.json();
      setDirectResponse(data);
    } catch (e) {
      setDirectResponse({ error: String(e) });
    } finally {
      setDirectLoading(false);
    }
  };

  // Function to perform token exchange
  const performTokenExchange = async () => {
    setExchangeLoading(true);
    try {
      const token = localStorage.getItem('auth_client_token');
      if (!token) {
        setExchangeStatus('No token found in localStorage');
        setExchangeLoading(false);
        return;
      }
      
      let userData = null;
      try {
        const userDataStr = localStorage.getItem('user');
        if (userDataStr) {
          userData = JSON.parse(userDataStr);
        }
      } catch (e) {
        console.error('Error parsing user data from localStorage', e);
      }
      
      const response = await fetch('/api/auth/token-exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
          userData
        })
      });
      
      if (response.ok) {
        setExchangeStatus('Token exchange successful');
        // Recheck cookies after exchange
        setTimeout(checkCookies, 500);
      } else {
        const errorText = await response.text();
        setExchangeStatus(`Token exchange failed: ${response.status} - ${errorText}`);
      }
    } catch (e) {
      setExchangeStatus(`Error during token exchange: ${String(e)}`);
    } finally {
      setExchangeLoading(false);
    }
  };

  // Run checks on component mount
  useEffect(() => {
    checkCookies();
    checkLocalStorage();
  }, []);

  // Refresh checks when user state changes
  useEffect(() => {
    if (!loading) {
      checkCookies();
      checkLocalStorage();
    }
  }, [loading, user]);

  return (
    <>
      <Head>
        <title>Auth Debugging | AI Code Fixer</title>
      </Head>
      
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Authentication Debug Panel</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Auth Status */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Authentication Status</h2>
            
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-500">Status:</p>
              <p className="font-medium">
                {loading ? (
                  'Loading...'
                ) : user ? (
                  <span className="text-green-600">Authenticated</span>
                ) : (
                  <span className="text-red-600">Not Authenticated</span>
                )}
              </p>
            </div>
            
            {user && (
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-500">User:</p>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">
                  {JSON.stringify(user, null, 2)}
                </pre>
              </div>
            )}
            
            <div className="flex space-x-3">
              <button 
                onClick={login}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm"
              >
                Login
              </button>
              <button 
                onClick={logout}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm"
              >
                Logout
              </button>
              <button 
                onClick={() => {
                  checkCookies();
                  checkLocalStorage();
                }}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 text-sm"
              >
                Refresh Data
              </button>
            </div>
          </div>
          
          {/* Cookie Information */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Cookie Information</h2>
            <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">
              {JSON.stringify(cookieInfo, null, 2)}
            </pre>
            
            {cookieInfo.all_cookies && (
              <div className="mt-4">
                <h3 className="font-medium mb-2">All Cookies:</h3>
                <ul className="bg-gray-100 p-3 rounded text-xs overflow-auto">
                  {document.cookie.split(';').map((cookie, i) => (
                    <li key={i}>{cookie.trim()}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          
          {/* LocalStorage Information */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">LocalStorage Information</h2>
            <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">
              {JSON.stringify(localStorageInfo, null, 2)}
            </pre>
          </div>
          
          {/* Session API Test */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Next.js Session API Test</h2>
            <button 
              onClick={checkSessionApi}
              disabled={apiLoading}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm mb-4"
            >
              {apiLoading ? 'Loading...' : 'Test Session API'}
            </button>
            
            {apiResponse && (
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">
                {JSON.stringify(apiResponse, null, 2)}
              </pre>
            )}
          </div>
          
          {/* Direct API Test */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Direct Firebase Function Test</h2>
            <button 
              onClick={checkDirectApi}
              disabled={directLoading}
              className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 text-sm mb-4"
            >
              {directLoading ? 'Loading...' : 'Test Firebase Function Directly'}
            </button>
            
            {directResponse && (
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">
                {JSON.stringify(directResponse, null, 2)}
              </pre>
            )}
          </div>
          
          {/* Token Exchange */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Token Exchange</h2>
            <p className="text-sm text-gray-600 mb-4">
              This will attempt to convert a token in localStorage to cookies that the Next.js API can use.
            </p>
            <button 
              onClick={performTokenExchange}
              disabled={exchangeLoading}
              className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700 text-sm mb-4"
            >
              {exchangeLoading ? 'Processing...' : 'Perform Token Exchange'}
            </button>
            
            {exchangeStatus && (
              <div className={`text-sm ${exchangeStatus.includes('successful') ? 'text-green-600' : 'text-red-600'}`}>
                {exchangeStatus}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
} 