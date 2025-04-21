import { NextApiRequest, NextApiResponse } from 'next';
import { withApiSecurity } from '../../middleware/withApiSecurity';
import { db } from '../../lib/firebase-admin';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const user = (req as any).user;
    if (!user?.email) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get repositories from Firestore
    const reposSnapshot = await db
      .collection('repositories')
      .where('ownerEmail', '==', user.email)
      .get();

    const repositories = reposSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json({ repositories });
  } catch (error) {
    console.error('Error fetching repositories:', error);
    return res.status(500).json({ error: 'Failed to fetch repositories' });
  }
};

export default withApiSecurity(handler); 