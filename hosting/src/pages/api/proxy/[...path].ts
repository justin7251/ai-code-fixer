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
    const token = await getToken({ 
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    
    console.log('Token from JWT:', token ? 'Exists' : 'Not found');
    if (token) {
      console.log('Token keys:', Object.keys(token));
      console.log('Access token exists:', !!token.accessToken);
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

    // Use the JWT token for backend authentication
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${backendToken}`
    };

    console.log('Proxying to URL:', url);
    console.log('header', requestHeaders);
    console.log('DEBUG: req', req.method !== 'GET' ? JSON.stringify(req.body) : undefined)

    // Forward the request to the backend
    const response = await fetch(url, {
      method: req.method,
      headers: requestHeaders,
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    console.log('Backend response status:', response.status);

    // Get the response data
    const data = await response.json();
    console.log('Backend response data:', data);

    // Forward the status and data
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ 
      message: 'Internal server error', 
      error: String(error)
    });
  }
} 