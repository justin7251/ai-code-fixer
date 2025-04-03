import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  try {
    const { code, state } = req.query;
    
    // Verify state to prevent CSRF attacks
    const cookieState = req.cookies.auth_state;
    if (!cookieState || cookieState !== state) {
      return res.status(403).redirect('/?error=invalid_state');
    }
    
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.NEXT_PUBLIC_BASE_URL + '/api/auth/github/callback',
      }),
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      return res.status(400).redirect('/?error=token_error');
    }
    
    // Get GitHub user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${tokenData.access_token}`,
      },
    });
    
    const userData = await userResponse.json();
    
    // Create custom token for Firebase Auth
    const customToken = await getAuth().createCustomToken(userData.id.toString(), {
      github_token: tokenData.access_token,
      github_id: userData.id,
    });
    
    // Store user info in Firestore
    await getFirestore().collection('users').doc(userData.id.toString()).set({
      githubId: userData.id,
      username: userData.login,
      email: userData.email,
      avatar_url: userData.avatar_url,
      name: userData.name,
      githubToken: tokenData.access_token,
      updatedAt: new Date(),
    }, { merge: true });
    
    // Redirect to auth callback page that will sign in with Firebase
    return res.redirect(`/auth-callback?token=${customToken}`);
    
  } catch (error) {
    console.error('GitHub callback error:', error);
    return res.status(500).redirect('/?error=server_error');
  }
} 