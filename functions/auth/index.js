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
app.options("*", cors(corsOptions));
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
    console.log(`[DEBUG] ${req.method} ${req.path} from origin: ${req.headers.origin}`);
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

// const ADMIN_USERS = ["justin7251"];

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
        passReqToCallback: true,
    },
    function(req, accessToken, refreshToken, profile, done) {
        console.log('[DEBUG] GitHub OAuth callback received');
        console.log('[DEBUG] Profile username:', profile.username);
        console.log('[DEBUG] Access token received:', accessToken ? 'Yes' : 'No');
    
        // Store both profile and token
        return done(null, {
            profile: profile,
            accessToken: accessToken,
        });
    }));
  
    app.use(passport.initialize());
};

// Initialize passport only once
setupAuth(app);

// GitHub login route - make sure the path is correct
app.get('/github/login', (req, res, next) => {
    console.log('[DEBUG] GitHub login route accessed');
  
    passport.authenticate('github', { 
        scope: ['user:email', 'repo'],
        session: false,
    })(req, res, next);
});

// GitHub callback route
app.get('/github/callback', (req, res, next) => {
    console.log('[DEBUG] GitHub callback received');
  
    passport.authenticate('github', { 
        failureRedirect: `${FRONTEND_URL}/error?message=GitHub+authentication+failed`,
        session: false,
    }, (err, user, info) => {
        if (err) {
            console.error('[DEBUG] Passport error:', err);
            return res.redirect(
                `${FRONTEND_URL}/error?message=Authentication+error:+${encodeURIComponent(err.message)}`,
            );
        }
    
        if (!user) {
            console.error('[DEBUG] No user returned from GitHub');
            return res.redirect(
                `${FRONTEND_URL}/error?message=Authentication+failed:+
              ${encodeURIComponent(info?.message || 'Unknown error')}`);
        }
    
        // Verify we have both profile and token
        if (!user.profile || !user.accessToken) {
            console.error('[DEBUG] Missing profile or token:', 
                {hasProfile: !!user.profile, hasToken: !!user.accessToken});
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
                    githubToken: user.accessToken, // Make sure token is included
                }, 
                JWT_SECRET,
                {expiresIn: '7d'},
            );
      
            // For debugging: verify the token was created with githubToken
            const decoded = jwt.verify(token, JWT_SECRET);
            console.log('[DEBUG] JWT created with githubToken:', !!decoded.githubToken);
      
            // Set auth token cookie
            res.cookie('auth_token', token, {
                maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
            });
      
            // Set user data cookie
            const userData = {
                githubId: user.profile.id,
                username: user.profile.username,
                name: user.profile.displayName || user.profile.username,
                avatar_url: user.profile._json?.avatar_url,
            };
      
            res.cookie('user_data', JSON.stringify(userData), {
                maxAge: 7 * 24 * 60 * 60 * 1000,
                httpOnly: false,
                secure: true,
                sameSite: 'lax',
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

// Add a catch-all error handler - FIXED with four parameters
app.use((err, req, res, next) => {
    console.error('Auth error:', err);
    // Use res.status().json() instead of redirect for API error handling
    return res.status(500).json({
        success: false,
        error: 'Server error',
        message: err.message,
    });
});

// Proper logout endpoint to clear all auth cookies
app.get('/logout', (req, res) => {
    // Set CORS headers for logout
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
    console.log('[DEBUG] Logout request received');
    console.log('[DEBUG] Cookies to clear:', Object.keys(req.cookies || {}));
  
    // Clear all auth cookies with various possible domain patterns
    const cookiesToClear = ['auth_token', 'auth_client', 'user_data', 'session_token'];

    try {
        // Determine cookie domain for production
        const cookieDomain = isEmulator 
            ? undefined 
            : 'ai-code-fixer.web.app';
      
        cookiesToClear.forEach(cookieName => {
            // Clear with explicit path but no domain (for localhost)
            res.clearCookie(cookieName, {
                path: '/',
                httpOnly: true, // Clear httpOnly cookies
                secure: !isEmulator // Secure in production
            });
          
            // Also clear with domain (for production)
            if (!isEmulator && cookieDomain) {
                res.clearCookie(cookieName, {
                    path: '/',
                    domain: cookieDomain,
                    httpOnly: true,
                    secure: true
                });
              
                // Try with dot prefix too (for subdomain cookies)
                res.clearCookie(cookieName, {
                    path: '/',
                    domain: `.${cookieDomain}`,
                    httpOnly: true,
                    secure: true
                });
            }
        });
      
        console.log('[DEBUG] Cookies cleared successfully');
    } catch (error) {
        console.error('[DEBUG] Error clearing cookies:', error);
    }
  
    // Respond with success and cache control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.status(200).json({
        success: true,
        message: 'Logged out successfully',
        timestamp: Date.now()
    });
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



// Simpler, production-friendly verify-session endpoint
app.get('/verify-session', (req, res) => {
    // Set CORS headers
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
    console.log('[DEBUG] Simple verify session request received');
  
    try {
    // Get token from various sources
        const token = 
      (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
          ? req.headers.authorization.substring(7) : null) ||
      req.cookies.auth_token ||
      req.cookies.auth_client;
    
        if (!token) {
            return res.status(401).json({ 
                authenticated: false,
                error: "No authentication token found",
            });
        }
    
        // Verify JWT token - this is the only critical operation
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
      
            // Return minimal user data directly from token
            return res.status(200).json({
                authenticated: true,
                githubId: decoded.githubId,
                username: decoded.username,
                timestamp: Date.now(),
            });
        } catch (jwtError) {
            console.error('[DEBUG] JWT verification error:', jwtError.message);
            return res.status(401).json({
                authenticated: false,
                error: "Invalid token",
            });
        }
    } catch (error) {
        console.error('[DEBUG] Verification error:', error.message);
        return res.status(500).json({
            authenticated: false,
            error: "Server error",
        });
    }
});

// Fix GitHub repos endpoint to use axios instead of fetch
app.get('/github/repos', async (req, res) => {
    console.log('[DEBUG] Fetch repos request received');
  
    // Check for auth_token cookie
    if (!req.cookies || !req.cookies.auth_token) {
        console.log('[DEBUG] No auth_token cookie found');
        return res.status(401).json({error: 'Authentication required'});
    }
  
    try {
    // Get the JWT token and decode it
        const jwtToken = req.cookies.auth_token;
        const decoded = jwt.verify(jwtToken, JWT_SECRET);
    
        // Extract GitHub token from decoded JWT
        const githubToken = decoded.githubToken;
    
        if (!githubToken) {
            console.error('[DEBUG] No GitHub token found in JWT');
            return res.status(401).json({error: 'GitHub token not found, please log in again'});
        }
    
        console.log('[DEBUG] Using GitHub token for user:', decoded.username);
    
        // Fetch repositories from GitHub API with axios
        try {
            const response = await axios.get('https://api.github.com/user/repos', {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'AI-Code-Fixer-App',
                },
                params: {
                    sort: 'updated',
                    per_page: 100,
                },
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
                language: repo.language,
            }));
      
            return res.json({repositories: formattedRepos});
        } catch (apiError) {
            console.error('[DEBUG] GitHub API error:', apiError.response?.status, apiError.response?.data);
            throw new Error(`GitHub API error: ${apiError.response?.status || apiError.message}`);
        }
    } catch (error) {
        console.error('[DEBUG] Error fetching repos:', error);
        return res.status(500).json({error: error.message});
    }
});

// Replace the existing select-repo endpoint with this implementation
app.post('/github/select-repo', async (req, res) => {
    // Set proper CORS headers
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Origin');
  
    console.log('[DEBUG] Repository selection request received');
  
    try {
    // Get user authentication
        const token = 
      (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
          ? req.headers.authorization.substring(7) : null) ||
      req.cookies.auth_token;
    
        if (!token) {
            console.log('[DEBUG] No authentication token found');
            // Still return success for UI to work, but don't store
            return res.status(200).json({
                success: true,
                stored: false,
                message: 'Selection recorded locally only (no auth token)',
            });
        }
    
        // Get repo data from request
        const {repoId, repoName, repoFullName} = req.body;
    
        if (!repoId || !repoName || !repoFullName) {
            return res.status(400).json({
                success: false,
                message: 'Missing repository information',
            });
        }
    
        // Verify user from token
        let userId;
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            userId = decoded.githubId;
            console.log('[DEBUG] User identified:', userId);
        } catch (tokenError) {
            console.error('[DEBUG] Token verification failed:', tokenError);
            // Still return success for UI to work
            return res.status(200).json({
                success: true,
                stored: false,
                message: 'Selection recorded locally only (invalid token)',
            });
        }
    
        // Store in Firestore
        const db = admin.firestore();
    
        // 1. Add to user's selected repos collection
        await db.collection('users').doc(String(userId)).collection('selectedRepos').doc(String(repoId)).set({
            repoId,
            repoName,
            repoFullName,
            selectedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    
        // 2. Update user document with last selected repo
        await db.collection('users').doc(String(userId)).update({
            lastSelectedRepo: {
                repoId,
                repoName,
                repoFullName,
                selectedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
        });
    
        console.log('[DEBUG] Repository selection stored for user:', userId);
    
        return res.status(200).json({
            success: true,
            stored: true,
            message: 'Repository selection recorded successfully',
        });
    
    } catch (error) {
        console.error('[DEBUG] Error storing repository selection:', error);
    
        // Even on error, still set CORS headers and return "success" for UI
        return res.status(200).json({
            success: true,
            stored: false,
            message: 'Selection recorded locally only (server error)',
        });
    }
});

// Add a beacon endpoint for browsers that can't handle CORS
app.post('/github/select-repo/beacon', (req, res) => {
    // Process and store repo selection from beacon data
    const data = req.body;
    console.log('[DEBUG] Beacon data received:', data);
  
    // Process the same way as the main endpoint but asynchronously
    // No need to respond with success/failure as beacon doesn't wait for response
    try {
        const {repoId, repoName, repoFullName, userId} = data;
    
        if (repoId && repoName && repoFullName && userId) {
            // Store in Firestore async (don't await)
            const db = admin.firestore();
      
            db.collection('users').doc(String(userId)).collection('selectedRepos').doc(String(repoId)).set({
                repoId,
                repoName,
                repoFullName,
                selectedAt: admin.firestore.FieldValue.serverTimestamp(),
            }).catch(err => console.error('[DEBUG] Beacon storage error:', err));
      
            // Update last selected repo
            db.collection('users').doc(String(userId)).update({
                lastSelectedRepo: {
                    repoId,
                    repoName,
                    repoFullName,
                    selectedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
            }).catch(err => console.error('[DEBUG] User update error:', err));
        }
    } catch (error) {
        console.error('[DEBUG] Error processing beacon data:', error);
    }
  
    // Always send 200 response for beacons
    res.status(200).end();
});

// Add endpoint to fetch user's repository history
app.get('/user/repo-history', async (req, res) => {
    // Set CORS headers
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
  
    try {
    // Get user authentication
        const token = 
      (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
          ? req.headers.authorization.substring(7) : null) ||
      req.cookies.auth_token;
    
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
        }
    
        // Verify user from token
        let userId;
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            userId = decoded.githubId;
        } catch (tokenError) {
            return res.status(401).json({
                success: false,
                message: 'Invalid authentication token',
            });
        }
    
        // Fetch from Firestore
        const db = admin.firestore();
        const reposSnapshot = await db.collection('users').doc(String(userId))
            .collection('selectedRepos')
            .orderBy('selectedAt', 'desc')
            .limit(10)
            .get();
    
        const repoHistory = [];
        reposSnapshot.forEach(doc => {
            repoHistory.push({
                id: doc.id,
                ...doc.data(),
            });
        });
    
        return res.status(200).json({
            success: true,
            repoHistory,
        });
    
    } catch (error) {
        console.error('[DEBUG] Error fetching repo history:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve repository history',
        });
    }
});

// Make sure we have only one export
module.exports = functions.https.onRequest(app);
