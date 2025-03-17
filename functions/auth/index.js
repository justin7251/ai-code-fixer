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
    
    // Set content security policy - updated to allow inline scripts and styles for the callback page
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://github.com https://api.github.com; img-src 'self' https: data:;",
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

// Load JWT secret with multiple fallbacks
let JWT_SECRET;
try {
    // First try to get from functions config
    JWT_SECRET = config.jwt && config.jwt.secret;
    
    // If not found, try environment variable
    if (!JWT_SECRET) {
        JWT_SECRET = process.env.JWT_SECRET;
        console.log('[CONFIG] Using JWT_SECRET from environment variable');
    } else {
        console.log('[CONFIG] Using JWT_SECRET from Firebase config');
    }
    
    // Last resort fallback (development only)
    if (!JWT_SECRET && isEmulator) {
        JWT_SECRET = "dev_jwt_secret_for_local_testing_only";
        console.log('[CONFIG] WARNING: Using development JWT_SECRET fallback');
    }
    
    if (!JWT_SECRET) {
        throw new Error('JWT_SECRET not found in any configuration source');
    }
} catch (error) {
    console.error('[CONFIG] Error loading JWT_SECRET:', error.message);
    throw new Error('Failed to load JWT_SECRET. Please set it in Firebase Functions config or .env file.');
}

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
app.get('/github/callback', async (req, res) => {
    try {
        const code = req.query.code;
        console.log('[GITHUB CALLBACK] Received code from GitHub callback');
    
        const tokenResponse = await axios.post(
            'https://github.com/login/oauth/access_token',
            {
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
            },
            {
                headers: {
                    Accept: 'application/json',
                },
            },
        );

        const {access_token} = tokenResponse.data;
    
        if (!access_token) {
            console.error('[GITHUB CALLBACK] Failed to get access token from GitHub');
            return res.status(500).send('Failed to get access token');
        }

        console.log('[GITHUB CALLBACK] Successfully got access token from GitHub');

        // Get user data from GitHub
        const userResponse = await axios.get('https://api.github.com/user', {
            headers: {
                Authorization: `token ${access_token}`,
            },
        });

        const userData = userResponse.data;
        console.log(`[GITHUB CALLBACK] User authenticated: ${userData.login} (${userData.id})`);

        // Create JWT token for our app
        const token = jwt.sign(
            { 
                id: userData.id, 
                githubId: userData.id,
                username: userData.login,
                name: userData.name || userData.login,
                image: userData.avatar_url,
                github_token: access_token, 
            }, 
            JWT_SECRET,
            {expiresIn: '7d'},
        );

        // Extract user data for cookies
        const userForCookie = {
            id: userData.id,
            githubId: userData.id,
            username: userData.login,
            name: userData.name || userData.login,
            avatar_url: userData.avatar_url,
        };

        // Determine domain for cookies based on environment
        const isProd = process.env.NODE_ENV === 'production';
        // Use the more specific domain that matches exactly our app domain
        const cookieDomain = isProd ? 'ai-code-fixer.web.app' : 'localhost';
    
        console.log(`[GITHUB CALLBACK] Setting cookies with domain: ${cookieDomain}`);

        // Set httpOnly cookie for secure authentication
        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: isProd,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/',
            domain: cookieDomain,
            sameSite: 'lax',
        });

        // Set non-httpOnly cookie for client access if needed
        res.cookie('auth_client', token, {
            httpOnly: false,
            secure: isProd,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/',
            domain: cookieDomain,
            sameSite: 'lax',
        });

        // Set user data in cookie for client access
        res.cookie('user_data', JSON.stringify(userForCookie), {
            httpOnly: false,
            secure: isProd,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
            domain: cookieDomain,
            sameSite: 'lax',
        });

        // Set a simple flag cookie to check if cookies are working at all
        res.cookie('auth_flag', 'true', {
            httpOnly: false,
            secure: isProd,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
            domain: cookieDomain,
            sameSite: 'lax',
        });
    
        const htmlResponse = `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Successful</title>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';">
  <style>
    body { font-family: sans-serif; text-align: center; padding-top: 50px; }
    h1 { color: #4a5568; }
    .info { color: #718096; margin-bottom: 20px; }
    #debug { 
        font-family: monospace;
        text-align: left;
        margin: 20px auto;
        max-width: 600px;
        border: 1px solid #eee;
        padding: 10px;
        display: none;
    }
  </style>
</head>
<body>
  <h1>Authentication Successful</h1>
  <p class="info">You've logged in with GitHub successfully. Redirecting to dashboard...</p>
  <div id="debug"></div>
  
  <script>
    
    // Store authentication data in localStorage
    try {
      // Store the token in multiple formats to ensure compatibility
      localStorage.setItem('auth_client_token', '${token}');
      localStorage.setItem('auth_token', '${token}');  // Alternative name
      localStorage.setItem('auth_state', 'authenticated');
      
      // Store user data
      const userData = ${JSON.stringify(JSON.stringify(userForCookie))};
      localStorage.setItem('user', userData);
      
    } catch (e) {
      debugLog("Error storing authentication data: " + e.message);
    }
    
    // Redirect to dashboard after a short delay
    setTimeout(function() {
      // Pass auth data securely via URL parameters
      window.location.href = '${FRONTEND_URL}/auth-complete?token=' + encodeURIComponent('${token}') +
        '&data=' + encodeURIComponent(${JSON.stringify(JSON.stringify(userForCookie))}) + '&source=github_callback';
    }, 500);
  </script>
</body>
</html>`;
    
        res.set('Content-Type', 'text/html');
        res.send(htmlResponse);
    
    } catch (error) {
        console.error('[GITHUB CALLBACK] Error in GitHub callback:', error);
        res.status(500).send('Authentication failed');
    }
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
    console.log('[DEBUG] Request origin:', req.headers.origin);
  
    // Clear all auth cookies with various possible domain patterns
    const cookiesToClear = ['auth_token', 'auth_client', 'user_data', 'session_token', 'test_cookie'];

    try {
        // We need to try multiple domain patterns to ensure all cookies are cleared
        const domainPatterns = [
            undefined, // No domain (for localhost)
            'ai-code-fixer.web.app',
            '.ai-code-fixer.web.app',
            'web.app',
            '.web.app',
        ];
      
        console.log('[DEBUG] Attempting to clear cookies with domains:', domainPatterns);
        
        // Try each cookie with each domain pattern
        cookiesToClear.forEach(cookieName => {
            // Try all domain patterns
            domainPatterns.forEach(domain => {
                // Standard cookie clearing
                res.clearCookie(cookieName, {
                    path: '/',
                    httpOnly: true,
                    secure: !isEmulator,
                    domain: domain,
                });
                
                // Also try non-httpOnly version
                res.clearCookie(cookieName, {
                    path: '/',
                    httpOnly: false,
                    secure: !isEmulator,
                    domain: domain,
                });
            });
        });
      
        console.log('[DEBUG] Cookies cleared with multiple domain patterns');
    } catch (error) {
        console.error('[DEBUG] Error clearing cookies:', error);
    }
  
    // Also add a response header to clear cookies client-side
    res.setHeader('Clear-Site-Data', '"cookies"');
  
    // Respond with success and cache control headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.status(200).json({
        success: true,
        message: 'Logged out successfully',
        timestamp: Date.now(),
        clearedCookies: cookiesToClear,
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
   
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
  
    try {
        // Get token from various sources
        const token = 
            (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
                ? req.headers.authorization.substring(7) : null) ||
            req.cookies.auth_token ||
            req.cookies.auth_client;
    
        if (!token) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Authentication required',
            });
        }
        
        // Use the verifyJwtToken utility function to verify the token
        try {
            const decoded = verifyJwtToken(token);
      
            // Return user data directly from token
            return res.status(200).json({
                authenticated: true,
                githubId: decoded.id,
                username: decoded.username,
                name: decoded.name || decoded.username, 
                avatar_url: decoded.image,
                timestamp: Date.now(),
            });
        } catch (jwtError) {
            return res.status(401).json({
                authenticated: false,
                error: "Invalid token: " + jwtError.message,
            });
        }
    } catch (error) {
        return res.status(500).json({
            authenticated: false,
            error: "Server error: " + error.message,
        });
    }
});

/**
 * Utility function to verify JWT tokens with multiple fallback secret keys
 * @param {string} token - The JWT token to verify
 * @returns {Object} The decoded token payload
 * @throws {Error} If verification fails
 */
function verifyJwtToken(token) {
    if (!token) {
        throw new Error('No token provided');
    }
    
    // Try with various possible secrets (for environments with config issues)
    const possibleSecrets = [
        JWT_SECRET,                          // Primary configured secret
        process.env.JWT_SECRET,              // Direct environment variable
        config.jwt && config.jwt.secret,     // From Firebase config
    ].filter(Boolean); // Remove undefined/null values
    
    // If no secrets are available (which shouldn't happen), throw error
    if (possibleSecrets.length === 0) {
        console.error('[JWT] Critical error: No JWT secrets available to verify token');
        throw new Error('JWT verification configuration error');
    }
    
    let lastError = null;
    
    // Try each possible secret
    for (const secret of possibleSecrets) {
        try {
            return jwt.verify(token, secret);
        } catch (error) {
            lastError = error;
            // Continue to next secret
        }
    }
    
    // If we get here, all verification attempts failed
    throw lastError || new Error('Token verification failed');
}

// Fix GitHub repos endpoint to use axios instead of fetch
app.get('/github/repos', async (req, res) => {
    // Get token from various sources including Authorization header
    const token = 
        (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
            ? req.headers.authorization.substring(7) : null) ||
        req.cookies.auth_token ||
        req.cookies.auth_client;
  
    if (!token) {
        return res.status(401).json({
            error: 'Authentication required',
            message: 'No authentication token found.',
        });
    }
  
    try {
        // Get the JWT token and decode it with multiple fallbacks
        let decoded;
        try {
            decoded = verifyJwtToken(token);
        } catch (jwtError) {
            return res.status(401).json({
                error: 'Invalid authentication token',
                message: jwtError.message,
            });
        }
    
        // Extract GitHub token from decoded JWT
        const githubToken = decoded.github_token;
    
        if (!githubToken) {
            return res.status(401).json({
                error: 'GitHub token not found',
                message: 'GitHub token not found in your authentication data. Please log in again.',
            });
        }
    
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
                message: 'No authentication token found',
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
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve repository history',
        });
    }
});

// Diagnostic test endpoint for cookie issues
app.get('/test-auth', (req, res) => {
    // Set proper CORS headers
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
    console.log('[DIAG] Test auth endpoint called');
    console.log('[DIAG] Request origin:', req.headers.origin);
    console.log('[DIAG] Request method:', req.method);
  
    // Return detailed diagnostic information
    const response = {
        success: true,
        timestamp: Date.now(),
        environment: isEmulator ? 'development' : 'production',
        cookies: {},
        headers: {
            origin: req.headers.origin,
            referer: req.headers.referer,
            'user-agent': req.headers['user-agent'],
            'has-auth-header': !!req.headers.authorization,
        },
    };
  
    // Add cookie information safely (don't expose values)
    if (req.cookies) {
        Object.keys(req.cookies).forEach(cookieName => {
            response.cookies[cookieName] = {
                exists: true,
                length: req.cookies[cookieName].length,
                // Only show first 10 chars for debugging
                sample: req.cookies[cookieName].substring(0, 10) + '...',
            };
        });
    }
  
    // Set a test cookie to verify cookie setting works
    const testCookieDomain = isEmulator ? undefined : 'web.app';
    
    res.cookie('test_cookie', 'test_value_' + Date.now(), {
        maxAge: 60 * 1000, // 1 minute
        httpOnly: false,
        secure: !isEmulator,
        sameSite: 'lax',
        domain: testCookieDomain,
        path: '/',
    });
  
    response.test = {
        cookieSet: true,
        cookieName: 'test_cookie',
        cookieDomain: testCookieDomain || '(none)',
    };
  
    res.status(200).json(response);
});

// Make sure we have only one export
module.exports = functions.https.onRequest(app);
