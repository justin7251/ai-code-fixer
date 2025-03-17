import type { NextApiRequest, NextApiResponse } from 'next';

type ClearCookiesResponse = {
  success: boolean;
  message: string;
  clearedCookies: string[];
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ClearCookiesResponse>
) {
  // Set CORS headers to allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Only allow GET and POST requests
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ 
      success: false, 
      message: 'Method not allowed', 
      clearedCookies: [] 
    });
    return;
  }
  
  try {
    // Cookies to clear
    const cookiesToClear = [
      'auth_token',
      'auth_client',
      'user_data',
      'test_cookie',
      'auth_flag'
    ];
    
    // Domains to try clearing cookies from
    const domains = [
      undefined, // default domain
      'localhost',
      '.localhost',
      'web.app',
      '.web.app',
      'ai-code-fixer.web.app',
      '.ai-code-fixer.web.app'
    ];
    
    const clearedCookies: string[] = [];
    
    // Clear each cookie with multiple domain attempts
    cookiesToClear.forEach(cookieName => {
      domains.forEach(domain => {
        // Clear for both http and https
        ['/', '/api', '/api/auth'].forEach(path => {
          // Set an expired cookie to clear it
          res.setHeader('Set-Cookie', `${cookieName}=; Path=${path}; Max-Age=0; ${domain ? `Domain=${domain}; ` : ''}SameSite=Lax`);
          clearedCookies.push(`${cookieName} (${domain || 'default'}, ${path})`);
        });
      });
    });
    
    // Also send clear-site-data header to clear all cookies
    res.setHeader('Clear-Site-Data', '"cookies"');
    
    res.status(200).json({ 
      success: true, 
      message: 'Cookies cleared successfully', 
      clearedCookies 
    });
  } catch (error) {
    console.error('Error clearing cookies:', error);
    res.status(500).json({ 
      success: false, 
      message: `Error clearing cookies: ${error instanceof Error ? error.message : String(error)}`,
      clearedCookies: []
    });
  }
} 