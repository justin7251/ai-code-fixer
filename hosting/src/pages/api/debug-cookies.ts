import type { NextApiRequest, NextApiResponse } from 'next';

type DebugResponse = {
  cookies: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  info: {
    timestamp: number;
    environment: string;
    hasAuthToken: boolean;
    hasAuthClient: boolean;
    hasSessionToken: boolean;
  };
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<DebugResponse>
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  
  // No caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  
  // Extract relevant headers
  const headers: Record<string, string | string[] | undefined> = {
    'user-agent': req.headers['user-agent'],
    'host': req.headers.host,
    'origin': req.headers.origin,
    'referer': req.headers.referer,
    'cookie': req.headers.cookie ? '[present]' : '[missing]'
  };
  
  const info = {
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || 'unknown',
    hasAuthToken: !!req.cookies.auth_token,
    hasAuthClient: !!req.cookies.auth_client,
    hasSessionToken: !!req.cookies.session_token
  };
  
  // Log to server console
  console.log('[DEBUG] Cookie debug request received');
  console.log('[DEBUG] Available cookies:', Object.keys(req.cookies || {}));
  console.log('[DEBUG] Auth info:', info);
  
  // Return debug information
  return res.status(200).json({
    cookies: req.cookies,
    headers,
    info
  });
} 