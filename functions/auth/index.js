const functions = require("firebase-functions");
const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const config = require("../config");
const rateLimit = require("express-rate-limit");
const session = require('express-session');
const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;

const app = express();

// Configure CORS
const corsOptions = {
    origin: ["https://ai-code-fixer.web.app", "http://localhost:5000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

// Apply CORS middleware
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

app.use((req, res, next) => {
    // Allow credentials
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Set content security policy
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; connect-src 'self' https://github.com https://api.github.com; img-src 'self' https: data:;",
    );
    
    // Set other security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Use different GitHub credentials based on environment
const GITHUB_CLIENT_ID = isEmulator 
    ? config.github.dev_client_id  // Development client ID
    : config.github.client_id;     // Production client ID
    
const GITHUB_CLIENT_SECRET = isEmulator
    ? config.github.dev_client_secret  // Development client secret
    : config.github.client_secret;     // Production client secret

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
const GITHUB_CALLBACK_URL = isEmulator
    ? "http://localhost:5001/ai-code-fixer/us-central1/auth/github/callback"
    : "https://us-central1-ai-code-fixer.cloudfunctions.net/auth/github/callback";
const FRONTEND_URL = isEmulator
    ? "http://localhost:5000"  // Local frontend URL
    : "https://ai-code-fixer.web.app"; // Production frontend URL

// Validate environment variables
if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !JWT_SECRET) {
    throw new Error("Missing required environment variables.");
}

// Admin users (Modify this list)
const ADMIN_USERS = ["your-github-username"];

// Rate limiting middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {error: "Too many requests, please try again later."},
});

// Apply rate limiting to all routes
app.use(limiter);

// Set proper cookie options
app.use(session({
    secret: config.session.secret_key || 'your-fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // true in production
        sameSite: 'lax',  // IMPORTANT: Use 'lax' instead of 'none'
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
}));

// Updated GitHub auth setup
const setupAuth = (app) => {
  // Configure GitHub strategy with explicit scope
  passport.use(new GitHubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: GITHUB_CALLBACK_URL,
    scope: ['user:email', 'repo'], // Required scopes for repo access
    passReqToCallback: true
  },
  function(req, accessToken, refreshToken, profile, done) {
    console.log('[DEBUG] GitHub OAuth callback received');
    console.log('[DEBUG] Profile username:', profile.username);
    console.log('[DEBUG] Access token received:', accessToken ? 'Yes' : 'No');
    
    // Store both profile and token
    return done(null, {
      profile: profile,
      accessToken: accessToken
    });
  }));
  
  app.use(passport.initialize());
}

// Initialize passport with GitHub strategy 
setupAuth(app);

// GitHub login route - make sure the path is correct
app.get('/github/login', (req, res, next) => {
  console.log('[DEBUG] GitHub login route accessed');
  
  passport.authenticate('github', { 
    scope: ['user:email', 'repo'],
    session: false
  })(req, res, next);
});

// GitHub callback route
app.get('/github/callback', (req, res, next) => {
  console.log('[DEBUG] GitHub callback received');
  
  passport.authenticate('github', { 
    failureRedirect: `${FRONTEND_URL}/error?message=GitHub+authentication+failed`,
    session: false
  }, (err, user, info) => {
    if (err) {
      console.error('[DEBUG] Passport error:', err);
      return res.redirect(`${FRONTEND_URL}/error?message=Authentication+error:+${encodeURIComponent(err.message)}`);
    }
    
    if (!user) {
      console.error('[DEBUG] No user returned from GitHub');
      return res.redirect(`${FRONTEND_URL}/error?message=Authentication+failed:+${encodeURIComponent(info?.message || 'Unknown error')}`);
    }
    
    // Verify we have both profile and token
    if (!user.profile || !user.accessToken) {
      console.error('[DEBUG] Missing profile or token:', 
        { hasProfile: !!user.profile, hasToken: !!user.accessToken });
      return res.redirect(`${FRONTEND_URL}/error?message=Incomplete+authentication+data`);
    }
    
    try {
      console.log('[DEBUG] GitHub auth successful for:', user.profile.username);
      console.log('[DEBUG] Token available:', !!user.accessToken);
      
      // Create JWT with GitHub token
      const token = jwt.sign(
        { 
          githubId: user.profile.id,
          username: user.profile.username,
          timestamp: Date.now(),
          githubToken: user.accessToken // Make sure token is included
        }, 
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      // For debugging: verify the token was created with githubToken
      const decoded = jwt.verify(token, JWT_SECRET);
      console.log('[DEBUG] JWT created with githubToken:', !!decoded.githubToken);
      
      // Set auth token cookie
      res.cookie('auth_token', token, {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
        httpOnly: true,
        secure: !isEmulator,
        sameSite: 'lax'
      });
      
      // Set user data cookie
      const userData = {
        githubId: user.profile.id,
        username: user.profile.username,
        name: user.profile.displayName || user.profile.username,
        avatar_url: user.profile._json?.avatar_url
      };
      
      res.cookie('user_data', JSON.stringify(userData), {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        secure: !isEmulator,
        sameSite: 'lax'
      });
      
      console.log('[DEBUG] Auth successful, redirecting to dashboard');
      return res.redirect(`${FRONTEND_URL}/dashboard`);
    } catch (error) {
      console.error('[DEBUG] Error in callback:', error);
      return res.redirect(`${FRONTEND_URL}/error?message=Server+error:+${encodeURIComponent(error.message)}`);
    }
  })(req, res, next);
});

// Add login route - alternative for testing
app.get('/login', (req, res) => {
  console.log('[DEBUG] Login route accessed directly');
  res.redirect('/github/login');
});

// Add a catch-all error handler
app.use((err, req, res, next) => {
  console.error('Auth error:', err);
  res.redirect(`${FRONTEND_URL}/error?message=Server+error:+${encodeURIComponent(err.message)}`);
});

// Logout route
app.get("/logout", (req, res) => {
    res.clearCookie("session_token", {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
    });
    res.json({message: "Logged out successfully"});
});

// GitHub Repositories proxy endpoint
app.get("/github-repos", async (req, res) => {
    const token = req.cookies.session_token;
    
    if (!token) {
        return res.status(401).json({error: "Unauthorized"});
    }
    
    try {
        // Verify the token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Get the user from Firestore to retrieve their GitHub access token
        const userDoc = await admin.firestore().collection("users").doc(decoded.githubId.toString()).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({error: "User not found"});
        }
        
        const userData = userDoc.data();
        const accessToken = userData.accessToken;
        
        if (!accessToken) {
            return res.status(400).json({error: "GitHub access token not found"});
        }
        
        // Fetch repositories from GitHub API using the stored access token
        const reposResponse = await axios.get("https://api.github.com/user/repos", {
            headers: {Authorization: `token ${accessToken}`},
            params: {
                sort: "updated",
                per_page: 100,
            },
        });
        
        res.json(reposResponse.data);
    } catch (error) {
        console.error("Error fetching GitHub repositories:", error);
        res.status(500).json({error: "Failed to fetch repositories"});
    }
});

// Modify verify-session to work with both cookie and Authorization header
// Verify Session Endpoint
app.get("/verify-session", async (req, res) => {
    try {
        // Get token from various sources (ordered by priority)
        const token = 
            // 1. From Authorization header (Bearer token)
            (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
                ? req.headers.authorization.substring(7) : null) ||
            // 2. From JWT query parameter
            req.query.jwt ||
            // 3. From auth_token cookie
            req.cookies.auth_token ||
            // 4. From session_token cookie (legacy)
            req.cookies.session_token;
        
        if (!token) {
            return res.status(401).json({ 
                authenticated: false,
                error: "No authentication token provided", 
            });
        }

        // Verify JWT token
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // Check if token is expired (additional check)
            const now = Date.now();
            const tokenTimestamp = decoded.timestamp || 0;
            const tokenAge = now - tokenTimestamp;
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
            
            if (tokenAge > maxAge) {
                return res.status(401).json({ 
                    authenticated: false,
                    error: "Token expired", 
                });
            }
            
            // Get latest user data from Firestore
            const userDoc = await admin.firestore().collection("users").doc(decoded.githubId.toString()).get();
            
            if (!userDoc.exists) {
                return res.status(401).json({ 
                    authenticated: false,
                    error: "User not found in database", 
                });
            }
            
            const userData = userDoc.data();
            
            // Return user data and authentication status
            return res.status(200).json({
                authenticated: true,
                githubId: userData.githubId,
                username: userData.username,
                name: userData.name || userData.username,
                email: userData.email,
                avatar_url: userData.avatar_url,
                role: userData.role || "user",
                timestamp: now,
            });
        } catch (jwtError) {
            console.error("JWT verification error:", jwtError);
            
            // If JWT verification fails, try to verify Firebase ID token
            try {
                // Check if token might be a Firebase ID token
                if (token.length > 500) {
                    const decodedToken = await admin.auth().verifyIdToken(token);
                    const uid = decodedToken.uid;
                    
                    // If UID is in GitHub format (github_USERID)
                    if (uid.startsWith('github_') && uid.length > 7) {
                        const githubId = uid.substring(7);
                        const userDoc = await admin.firestore().collection("users").doc(githubId).get();
                        
                        if (userDoc.exists) {
                            const userData = userDoc.data();
                            return res.status(200).json({
                                authenticated: true,
                                githubId: userData.githubId,
                                username: userData.username,
                                name: userData.name || userData.username,
                                email: userData.email,
                                avatar_url: userData.avatar_url,
                                role: userData.role || "user",
                                timestamp: Date.now(),
                            });
                        }
                    }
                }
                
                // If we get here, Firebase token verification didn't help
                return res.status(401).json({ 
                    authenticated: false,
                    error: "Invalid authentication token", 
                });
            } catch (firebaseError) {
                console.error("Firebase token verification error:", firebaseError);
                return res.status(401).json({ 
                    authenticated: false,
                    error: "Invalid authentication token", 
                });
            }
        }
    } catch (error) {
        console.error("Session verification error:", error);
        return res.status(500).json({ 
            authenticated: false,
            error: "Internal server error during authentication", 
        });
    }
});

// Add this new endpoint for token verification
app.get('/verify-session', (req, res) => {
  console.log('[DEBUG] Verify session request received');
  
  // Check for auth_token cookie
  if (!req.cookies || !req.cookies.auth_token) {
    console.log('[DEBUG] No auth_token cookie found');
    return res.status(401).json({ authenticated: false });
  }
  
  try {
    // Verify the JWT token (if you're using JWT)
    const token = req.cookies.auth_token;
    const decoded = jwt.verify(token, JWT_SECRET);
    
    console.log('[DEBUG] Token verified for user:', decoded.username);
    
    // Return user data
    return res.json({
      authenticated: true,
      githubId: decoded.githubId,
      username: decoded.username,
      timestamp: decoded.timestamp
    });
  } catch (error) {
    console.error('[DEBUG] Token verification error:', error);
    return res.status(401).json({ 
      authenticated: false, 
      error: error.message 
    });
  }
});

// Add a logout endpoint
app.get('/logout', (req, res) => {
  console.log('[DEBUG] Logout request received');
  
  // Clear auth cookies
  res.clearCookie('auth_token');
  res.clearCookie('user_data');
  
  // Respond with success
  res.json({ success: true });
});

// Fix GitHub repos endpoint to use axios instead of fetch
app.get('/github/repos', async (req, res) => {
  console.log('[DEBUG] Fetch repos request received');
  
  // Check for auth_token cookie
  if (!req.cookies || !req.cookies.auth_token) {
    console.log('[DEBUG] No auth_token cookie found');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    // Get the JWT token and decode it
    const jwtToken = req.cookies.auth_token;
    const decoded = jwt.verify(jwtToken, JWT_SECRET);
    
    // Extract GitHub token from decoded JWT
    const githubToken = decoded.githubToken;
    
    if (!githubToken) {
      console.error('[DEBUG] No GitHub token found in JWT');
      return res.status(401).json({ error: 'GitHub token not found, please log in again' });
    }
    
    console.log('[DEBUG] Using GitHub token for user:', decoded.username);
    
    // Fetch repositories from GitHub API with axios
    try {
      const response = await axios.get('https://api.github.com/user/repos', {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AI-Code-Fixer-App'
        },
        params: {
          sort: 'updated',
          per_page: 100
        }
      });
      
      console.log('[DEBUG] Fetched', response.data.length, 'repositories');
      
      // Format and return repositories
      const formattedRepos = response.data.map(repo => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        url: repo.html_url,
        default_branch: repo.default_branch,
        stars: repo.stargazers_count,
        language: repo.language
      }));
      
      return res.json({ repositories: formattedRepos });
    } catch (apiError) {
      console.error('[DEBUG] GitHub API error:', apiError.response?.status, apiError.response?.data);
      throw new Error(`GitHub API error: ${apiError.response?.status || apiError.message}`);
    }
  } catch (error) {
    console.error('[DEBUG] Error fetching repos:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Endpoint to save selected repository
app.post('/github/select-repo', async (req, res) => {
  console.log('[DEBUG] Select repo request received');
  
  // Check for auth_token cookie
  if (!req.cookies || !req.cookies.auth_token) {
    console.log('[DEBUG] No auth_token cookie found');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Validate request body
  if (!req.body || !req.body.repoId || !req.body.repoName) {
    return res.status(400).json({ error: 'Repository information required' });
  }
  
  try {
    // Get user info from token
    const token = req.cookies.auth_token;
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Save repository selection to database
    // This is a placeholder - implement your database storage here
    console.log('[DEBUG] User', decoded.username, 'selected repo:', req.body.repoName);
    
    // Return success
    return res.json({ 
      success: true, 
      message: 'Repository selected successfully',
      selectedRepo: {
        id: req.body.repoId,
        name: req.body.repoName,
        full_name: req.body.repoFullName
      }
    });
  } catch (error) {
    console.error('[DEBUG] Error selecting repo:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Call setupAuth before exporting the app
setupAuth(app);

module.exports = functions.https.onRequest(app);
