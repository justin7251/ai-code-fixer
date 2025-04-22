import { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';
import jwt from 'jsonwebtoken';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('Proxy request received:', {
    method: req.method,
    path: req.query.path,
    cookies: req.cookies,
  });

  try {
    // Get the token using getToken with explicit secret
    console.log('[DEBUG] Attempting to verify token');
    const token = await getToken({ 
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    
    if (token) {
      console.log('[DEBUG] Token verified successfully');
      console.log('Token keys:', Object.keys(token));
      console.log('Access token exists:', !!token.accessToken);
    } else {
      console.log('[DEBUG] Token verification failed');
    }
    
    if (!token) {
      console.log('No token found - check session setup');
      return res.status(401).json({ message: 'No token found' });
    }
    
    if (!token.accessToken) {
      console.log('No access token in token. This means the GitHub token was not stored in JWT.');
      console.log('Full token:', JSON.stringify(token, null, 2));
      return res.status(401).json({ message: 'No access token in token' });
    }

    // Create a proper JWT token for backend authentication
    console.log('[DEBUG] Creating backend JWT token');
    const backendToken = jwt.sign(
      {
        userId: token.sub,
        accessToken: token.accessToken,
        provider: token.provider || 'github',
        githubUsername: token.githubUsername,
        githubId: token.githubId,
      },
      process.env.NEXTAUTH_SECRET as string,
      { expiresIn: '1h' }
    );

    // Get the path from the request
    const path = req.query.path as string[];
    const url = `${BACKEND_URL}/${path.join('/')}`;

    // Create clean headers without any existing authorization
    const cleanHeaders = { ...req.headers } as Record<string, string>;
    delete cleanHeaders.authorization;
    delete cleanHeaders.Authorization;

    // Use the JWT token for backend authentication
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${backendToken}`,
      ...cleanHeaders,
    };

    console.log('[DEBUG] Proxying to URL:', url);

    // Forward the request to the backend
    const response = await fetch(url, {
      method: req.method,
      headers: requestHeaders,
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    console.log('[DEBUG] Backend response status:', response.status);

    // Get the response data
    const rawData = await response.text();
    let data;
    
    try {
      // Try to parse the response as JSON
      data = JSON.parse(rawData);
      console.log('[DEBUG] Received JSON response with keys:', Object.keys(data));
    } catch (err) {
      // If parsing fails, return the raw text
      console.log('[DEBUG] Received non-JSON response:', rawData);
      return res.status(response.status).send(rawData);
    }

    // Forward the status and data
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('[DEBUG] Proxy error:', error);
    return res.status(500).json({ 
      message: 'Internal server error', 
      error: String(error)
    });
  }
} 