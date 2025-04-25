import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { withApiSecurity } from '../../../middleware/withApiSecurity';
import { db } from '../../../lib/firebase-admin';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const session = await getSession({ req });

  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const analysisRef = db.collection('analyses').doc(id as string);
    const doc = await analysisRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    const analysis = doc.data();
    
    // Check if the user has access to this analysis
    if (analysis?.userId !== session.user.email) {
      return res.status(403).json({ error: 'Access denied' });
    }

    switch (req.method) {
      case 'GET':
        return res.status(200).json(analysis);
      
      case 'DELETE':
        await analysisRef.delete();
        return res.status(200).json({ message: 'Analysis deleted' });
      
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Error in analysis endpoint:', error);
    
    if (error.code === 'permission-denied') {
      return res.status(403).json({ 
        error: 'Access denied',
        details: 'You do not have permission to access this resource'
      });
    }

    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

export default withApiSecurity(handler); 