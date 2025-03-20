import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import admin from 'firebase-admin';
import serviceAccount from '../../../../keys/serviceAccountKey.json';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as any),
    });
    console.log('Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    throw error;
  }
}

// Validate request headers
function validateHeaders(req: NextApiRequest): { isValid: boolean; error?: string } {
  const origin = req.headers.origin;
  
  // Allow requests without origin (direct API calls)
  if (!origin) {
    return { isValid: true };
  }

  // Add your allowed origins here
  const allowedOrigins = [
    'https://ai-code-fixer.web.app',
    'http://localhost:5000',
    'http://localhost:3000'
  ];

  if (!allowedOrigins.includes(origin)) {
    console.warn('Request from unauthorized origin:', origin);
    return { isValid: false, error: 'Invalid origin' };
  }

  return { isValid: true };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Log request details
  console.log(`[Analysis API] ${req.method} request to /api/analysis/${req.query.id}`);
  console.log('Request headers:', {
    origin: req.headers.origin || 'none',
    method: req.method,
    query: req.query,
    referer: req.headers.referer || 'none'
  });

  // Set CORS headers before validation
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Validate headers after CORS setup
  const headerValidation = validateHeaders(req);
  if (!headerValidation.isValid) {
    console.error('Header validation failed:', headerValidation.error);
    return res.status(400).json({
      success: false,
      error: headerValidation.error,
      details: 'The request origin is not allowed'
    });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: `Method ${req.method} not allowed. Only GET and OPTIONS are supported.` 
    });
  }

  try {
    // Get the session
    const session = await getSession({ req });
    console.log('Session details:', {
      exists: !!session,
      hasAccessToken: !!session?.accessToken,
      expires: session?.expires
    });

    if (!session?.accessToken) {
      console.log('Authentication failed: No access token found in session');
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated',
        details: 'No access token found in session'
      });
    }

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid analysis ID',
        details: 'Analysis ID must be a non-empty string'
      });
    }

    // Get the analysis from Firestore
    console.log('Fetching analysis document:', id);
    const analysisDoc = await admin.firestore()
      .collection('analyses')
      .doc(id)
      .get();

    if (!analysisDoc.exists) {
      console.log('Analysis not found:', id);
      return res.status(404).json({ 
        success: false, 
        error: 'Analysis not found',
        details: `No analysis found with ID: ${id}`
      });
    }

    const analysisData = analysisDoc.data();
    if (!analysisData) {
      console.log('Analysis data is empty:', id);
      return res.status(404).json({ 
        success: false, 
        error: 'Analysis data not found',
        details: `Analysis document exists but contains no data: ${id}`
      });
    }

    // Convert Firestore timestamps to JavaScript Date objects
    const analysis = {
      ...analysisData,
      id: analysisDoc.id,
      timestamp: analysisData.timestamp?.toDate(),
      completedAt: analysisData.completedAt?.toDate(),
    };

    console.log('Successfully retrieved analysis:', {
      id: analysisDoc.id,
      status: analysisData.status,
      issueCount: analysisData.issues?.length || 0
    });

    return res.status(200).json({ 
      success: true, 
      analysis,
      metadata: {
        retrievedAt: new Date().toISOString(),
        version: '1.0'
      }
    });
  } catch (error) {
    console.error('Error in analysis/[id]:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('permission-denied')) {
        return res.status(403).json({
          success: false,
          error: 'Permission denied',
          details: 'You do not have permission to access this analysis'
        });
      }
      
      if (error.message.includes('not-found')) {
        return res.status(404).json({
          success: false,
          error: 'Resource not found',
          details: error.message
        });
      }
    }

    // Generic error response
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'An unexpected error occurred'
    });
  }
} 