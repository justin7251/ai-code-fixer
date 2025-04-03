export default function handler(req, res) {
  // GitHub OAuth configuration
  const clientId = process.env.GITHUB_CLIENT_ID;
  
  // Fix: Add fallback for base URL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                  (process.env.NEXT_PUBLIC_BASE_URL ? `https://${process.env.NEXT_PUBLIC_BASE_URL}` : 'http://localhost:5000');
  
  const redirectUri = `${baseUrl}/api/auth/github/callback`;
  
  // Build GitHub authorization URL
  const scope = 'repo user:email';
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
  
  // Store state in cookies for security
  const state = Math.random().toString(36).substring(2);
  res.setHeader('Set-Cookie', `auth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`);
  
  // Debug info (remove in production)
  console.log('Redirect URI:', redirectUri);
  
  // Redirect to GitHub
  res.redirect(authUrl + `&state=${state}`);
} 