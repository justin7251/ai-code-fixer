import { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';

// Use the same base URL from the original code
const getAnalysisBaseUrl = () => {
  const isDev = process.env.NODE_ENV === 'development';
  return isDev
    ? 'http://localhost:5001/ai-code-fixer/us-central1/analysis'
    : 'https://us-central1-ai-code-fixer.cloudfunctions.net/analysis';
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Get the token
    const token = await getToken({ req });
    
    if (!token?.accessToken) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get the repository ID from the URL
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ message: 'Repository ID is required' });
    }

    const baseUrl = getAnalysisBaseUrl();
    
    // Forward the request to the analysis service
    const response = await fetch(`${baseUrl}/${id}`, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.accessToken}`
      },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
    });

    // Get the response data
    const data = await response.json();

    // Forward the status and data
    return res.status(response.status).json(data);
  } catch (error) {
    console.error('Error with analysis:', error);
    return res.status(500).json({ 
      message: 'Internal server error', 
      error: String(error)
    });
  }
} 