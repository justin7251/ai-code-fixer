import type { NextApiRequest, NextApiResponse } from 'next';

type ResponseData = {
  success: boolean;
  message: string;
}

/**
 * This endpoint allows the frontend to transfer authentication tokens
 * from localStorage to cookies that can be used with the Next.js API.
 * This helps overcome cross-domain cookie issues.
 */
export default function handler(
  req: NextApiRequest, 
  res: NextApiResponse<ResponseData>
) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }
  
  try {
    // Get token from request body
    const { token, userData } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }
    
    console.log('[TOKEN-EXCHANGE] Setting authentication cookies');
    
    // Set token cookie
    res.setHeader('Set-Cookie', [
      `auth_client=` + 
      `${token}; ` + 
      `Path=/; ` + 
      `Max-Age=${7 * 24 * 60 * 60}; ` + 
      `SameSite=Lax; ` +
      `HttpOnly=false`,
      
      userData ? 
      `user_data=` + 
      `${JSON.stringify(userData)}; ` + 
      `Path=/; ` + 
      `Max-Age=${7 * 24 * 60 * 60}; ` + 
      `SameSite=Lax; ` +
      `HttpOnly=false` : ''
    ].filter(Boolean));
    
    // Return success
    return res.status(200).json({ 
      success: true, 
      message: 'Token cookies set successfully' 
    });
  } catch (error: any) {
    console.error('[TOKEN-EXCHANGE] Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
} 