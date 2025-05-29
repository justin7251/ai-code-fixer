import { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';
import jwt from 'jsonwebtoken';

// NOTE: This is a server-side API endpoint that forwards requests to the backend service.
// Server-side API routes cannot use the ApiClient class which is designed for client-side usage.
// Instead, they make direct fetch calls to the backend service with proper authentication.

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Get the token using getToken with explicit secret
    const token = await getToken({ 
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    
    if (!token?.accessToken) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get the repository ID from the URL
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ message: 'Repository ID is required' });
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

    // Log request for debugging
    console.log('Refresh analysis request for repository ID:', id);
    console.log('Request body:', req.body);

    // Forward the request to the backend
    const url = `${BACKEND_URL}/api/repositories/${id}/refresh-analysis`;
    console.log('Forwarding to backend URL:', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${backendToken}`
      },
      body: JSON.stringify(req.body)
    });

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error(`Backend returned non-JSON response (${contentType})`);
      const textResponse = await response.text();
      console.error('Response text (first 200 chars):', textResponse.substring(0, 200));
      return res.status(500).json({ 
        success: false,
        message: 'Backend returned invalid response format',
        error: 'Expected JSON but received different content type'
      });
    }

    // Get the response data
    let data;
    try {
      data = await response.json();
    } catch (error) {
      console.error('Failed to parse JSON response:', error);
      return res.status(500).json({ 
        success: false,
        message: 'Failed to parse backend response',
        error: String(error)
      });
    }

    console.log('Backend response:', {
      status: response.status,
      data: data
    });

    // Forward the status and data
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Error with refresh analysis:', error);
    return res.status(500).json({ 
      message: 'Internal server error', 
      error: String(error)
    });
  }
} 