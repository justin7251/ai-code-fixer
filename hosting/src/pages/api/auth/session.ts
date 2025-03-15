import type { NextApiRequest, NextApiResponse } from 'next';

type SessionResponse = {
  authenticated: boolean;
  user?: {
    id?: string;
    username?: string;
    name?: string;
    image?: string;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse<SessionResponse>
) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    console.log('[SESSION API] Request received');
    console.log('[SESSION API] Cookies:', Object.keys(req.cookies || {}));
    
    // Get the authentication token from various sources
    const authToken = 
      // From cookies (ordered by priority)
      req.cookies.auth_token || 
      req.cookies.auth_client ||
      // From Authorization header
      (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
        ? req.headers.authorization.substring(7) 
        : undefined);
    
    if (!authToken) {
      console.log('[SESSION API] No authentication token found');
      return res.status(200).json({ authenticated: false });
    }
    
    console.log('[SESSION API] Auth token found, verifying with Firebase');
    
    // Determine API URL based on environment
    const isDev = process.env.NODE_ENV === 'development';
    const baseUrl = isDev
      ? 'http://localhost:5001/ai-code-fixer/us-central1/auth'
      : 'https://us-central1-ai-code-fixer.cloudfunctions.net/auth';
    
    // Call Firebase Functions to verify token
    try {
      const response = await fetch(`${baseUrl}/verify-session`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      const data = await response.json();
      console.log('[SESSION API] Verification response status:', response.status);
      
      if (response.ok && data.authenticated) {
        // Return user data in a format similar to NextAuth
        return res.status(200).json({
          authenticated: true,
          user: {
            id: data.githubId,
            username: data.username,
            name: data.name || data.username,
            image: data.avatar_url
          }
        });
      } else {
        console.log('[SESSION API] Authentication failed:', data.error);
        return res.status(200).json({ 
          authenticated: false, 
          error: data.error || 'Authentication failed'
        });
      }
    } catch (fetchError: any) {
      console.error('[SESSION API] Error verifying with Firebase:', fetchError.message);
      return res.status(200).json({ 
        authenticated: false, 
        error: `Verification error: ${fetchError.message}`
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