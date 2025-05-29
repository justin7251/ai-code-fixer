import { getToken } from 'next-auth/jwt';
import { NextApiRequest } from 'next';

export async function getAccessToken(req: NextApiRequest) {
  try {
    // Get the JWT token from the request
    const token = await getToken({ req });
    
    if (!token) {
      throw new Error('No token found');
    }

    // Return the GitHub access token from the JWT
    return token.accessToken;
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
}

export async function verifySessionToken(req: NextApiRequest) {
  try {
    // Verify the JWT token using NEXTAUTH_SECRET
    const decoded = await getToken({ req });
    return decoded;
  } catch (error) {
    console.error('Error verifying session token:', error);
    return null;
  }
} 