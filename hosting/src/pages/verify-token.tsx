import { useState } from 'react';
import { useAuth } from '../context/AuthProvider';
import Link from 'next/link';

export default function VerifyToken() {
  const { user } = useAuth();
  const [token, setToken] = useState('');
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [cookieData, setCookieData] = useState<string[]>([]);
  
  // Get all cookie names
  const getCookieNames = () => {
    return document.cookie.split(';').map(c => c.trim().split('=')[0]);
  };
  
  // Extract a cookie value
  const getCookieValue = (name: string): string | null => {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  };
  
  // Load available tokens from cookies
  const loadFromCookies = () => {
    const cookieNames = getCookieNames();
    setCookieData(cookieNames);
    
    // Try to find auth tokens
    const authToken = getCookieValue('auth_token');
    const authClient = getCookieValue('auth_client');
    
    if (authToken) {
      setToken(authToken);
    } else if (authClient) {
      setToken(authClient);
    }
  };
  
  // Verify token with Firebase Function directly
  const verifyToken = async () => {
    if (!token.trim()) {
      alert('Please enter a token to verify');
      return;
    }
    
    setLoading(true);
    setVerificationResult(null);
    
    try {
      const isDev = process.env.NODE_ENV === 'development';
      const baseUrl = isDev
        ? 'http://localhost:5001/ai-code-fixer/us-central1/auth'
        : 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth';
      
      const response = await fetch(`${baseUrl}/verify-session`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      const data = await response.json();
      
      setVerificationResult({
        status: response.status,
        success: response.ok,
        data: data
      });
    } catch (error: any) {
      setVerificationResult({
        error: error.message
      });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Token Verification Tool</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <p>Use this tool to directly verify an authentication token with Firebase Functions.</p>
        <p>Current auth status: {user ? 'Authenticated' : 'Not Authenticated'}</p>
        {user && <p>Current user: {user.username || user.name}</p>}
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={loadFromCookies}
          style={{ marginRight: '10px', padding: '5px 10px' }}
        >
          Load Tokens from Cookies
        </button>
        
        {cookieData.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <p>Available cookies: {cookieData.join(', ')}</p>
          </div>
        )}
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Enter JWT Token to Verify</h3>
        <textarea 
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{ width: '100%', height: '100px', fontFamily: 'monospace' }}
          placeholder="Paste your JWT token here"
        />
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={verifyToken}
          disabled={loading || !token}
          style={{ padding: '5px 10px' }}
        >
          {loading ? 'Verifying...' : 'Verify Token'}
        </button>
      </div>
      
      {verificationResult && (
        <div style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px', borderRadius: '5px' }}>
          <h3>Verification Result</h3>
          <pre style={{ overflow: 'auto', background: '#f5f5f5', padding: '10px' }}>
            {JSON.stringify(verificationResult, null, 2)}
          </pre>
        </div>
      )}
      
      <div>
        <Link href="/auth-debug">Go to Auth Debug Page</Link> | <Link href="/">Back to Home</Link>
      </div>
    </div>
  );
} 