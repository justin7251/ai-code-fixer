import type { NextApiRequest, NextApiResponse } from 'next';

type VerificationResponse = {
  status: number;
  authenticated: boolean;
  error?: string;
};

type DebugInfo = {
  cookiesPresent: string[];
  authTokenFound: boolean;
  verificationAttempted: boolean;
  verificationResponse: VerificationResponse | null;
  fetchError?: string;
  headerAuth?: boolean;
  origin?: string;
};

type SessionResponse = {
  authenticated: boolean;
  user?: {
    id?: string;
    username?: string;
    name?: string;
    image?: string;
  };
  error?: string;
  debug?: DebugInfo;
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<SessionResponse>
) {
  // Custom CORS handling for credentials
  const origin = req.headers.origin || '';
  
  // First set Access-Control-Allow-Origin to the requesting origin (not "*")
  // This is required for credentials to work
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Fallback for direct browser requests
    res.setHeader('Access-Control-Allow-Origin', 'https://ai-code-fixer.web.app');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    console.log('[SESSION API] Request received');
    console.log('[SESSION API] Request headers:', {
      origin: req.headers.origin,
      referer: req.headers.referer,
      cookie: req.headers.cookie ? '[present]' : '[missing]'
    });
    console.log('[SESSION API] Cookie names:', Object.keys(req.cookies || {}));
    
    // Create debug object to track authentication flow
    const debug: DebugInfo = {
      cookiesPresent: Object.keys(req.cookies || {}),
      authTokenFound: false,
      verificationAttempted: false,
      verificationResponse: null,
      origin: req.headers.origin as string || 'none'
    };
    
    // Get the authentication token from various sources
    let authToken = 
      // From cookies (ordered by priority)
      req.cookies.auth_token || 
      req.cookies.auth_client ||
      // From Authorization header
      (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
        ? req.headers.authorization.substring(7) 
        : undefined);
    
    // Check for token in query parameter (fallback for cookie issues)
    if (!authToken && req.query.token) {
      authToken = req.query.token as string;
      debug.headerAuth = true;
      console.log('[SESSION API] Using token from query parameter');
    }
    
    debug.authTokenFound = !!authToken;
    
    if (!authToken) {
      console.log('[SESSION API] No authentication token found');
      return res.status(200).json({ 
        authenticated: false,
        debug
      });
    }
    
    console.log('[SESSION API] Auth token found, verifying with Firebase');
    
    // Determine API URL based on environment
    const isDev = process.env.NODE_ENV === 'development';
    const baseUrl = isDev
      ? 'http://localhost:5001/ai-code-fixer/us-central1/auth'
      : 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth';
    
    // Call Firebase Functions to verify token
    try {
      debug.verificationAttempted = true;
      
      const response = await fetch(`${baseUrl}/verify-session`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      const data = await response.json();
      console.log('[SESSION API] Verification response status:', response.status);
      
      // Save verification response for debugging
      debug.verificationResponse = {
        status: response.status,
        authenticated: !!data.authenticated,
        error: data.error
      };
      
      if (response.ok && data.authenticated) {
        // Return user data in a format similar to NextAuth
        return res.status(200).json({
          authenticated: true,
          user: {
            id: data.githubId,
            username: data.username,
            name: data.name || data.username,
            image: data.avatar_url
          },
          debug
        });
      } else {
        console.log('[SESSION API] Authentication failed:', data.error);
        return res.status(200).json({ 
          authenticated: false, 
          error: data.error || 'Authentication failed',
          debug
        });
      }
    } catch (fetchError: any) {
      console.error('[SESSION API] Error verifying with Firebase:', fetchError.message);
      debug.fetchError = fetchError.message;
      return res.status(200).json({ 
        authenticated: false, 
        error: `Verification error: ${fetchError.message}`,
        debug
      });
    }
  } catch (error: any) {
    console.error('[SESSION API] Server error:', error);
    // Always return 200 status to prevent frontend errors
    return res.status(200).json({ 
      authenticated: false, 
      error: `Server error: ${error.message}`
    });
  }
} 