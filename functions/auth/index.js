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

const app = express();

// Configure CORS
const corsOptions = {
    origin: ["https://ai-code-fixer.web.app", "http://localhost:3000"],
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
        "default-src 'self'; connect-src 'self' https://github.com https://api.github.com; img-src 'self' https: data:;"
    );
    
    // Set other security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

const GITHUB_CLIENT_ID = config.github.client_id;
const GITHUB_CLIENT_SECRET = config.github.client_secret;
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
const GITHUB_CALLBACK_URL = "https://us-central1-ai-code-fixer.cloudfunctions.net/auth/github/callback";
const FRONTEND_URL = "https://ai-code-fixer.web.app";

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
    }
}));

// GitHub OAuth Login Redirect
app.get("/github/login", (req, res) => {
    const state = Math.random().toString(36).substring(2, 15);
    res.cookie("github_oauth_state", state, { 
        httpOnly: true, 
        secure: true, 
        sameSite: "lax", 
    });

    const githubAuthURL = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&state=${state}&scope=repo,user&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}`;
    res.redirect(githubAuthURL);
});

/**
 * GitHub OAuth Callback Handler
 * 
 * This endpoint handles the OAuth callback from GitHub,
 * authenticates the user, and redirects to the client app
 * with a JWT token in the URL instead of using cookies.
 */
app.get("/github/callback", async (req, res) => {
    const { code, state } = req.query;
    
    // Optional state verification
    if (req.cookies.oauth_state && req.cookies.oauth_state !== state) {
        console.error("OAuth state mismatch", {
            expected: req.cookies.oauth_state,
            received: state
        });
        return res.redirect(`${FRONTEND_URL}/error?message=Invalid+OAuth+state`);
    }
    
    // Clear the oauth state cookie
    res.clearCookie("oauth_state");
    
    if (!code) {
        console.error("No authorization code received from GitHub");
        return res.redirect(`${FRONTEND_URL}/error?message=Missing+authorization+code`);
    }

    try {
        // Exchange code for access token
        const tokenResponse = await axios.post(
            "https://github.com/login/oauth/access_token",
            {
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code
            },
            {
                headers: {
                    Accept: "application/json"
                }
            }
        );

        if (!tokenResponse.data.access_token) {
            console.error("Failed to get access token from GitHub", tokenResponse.data);
            return res.redirect(`${FRONTEND_URL}/error?message=GitHub+authentication+failed`);
        }

        const accessToken = tokenResponse.data.access_token;

        // Get user data from GitHub
        const userResponse = await axios.get("https://api.github.com/user", {
            headers: {
                Authorization: `token ${accessToken}`
            }
        });

        const githubUser = userResponse.data;

        // Get user email if not provided
        let email = githubUser.email;
        if (!email) {
            try {
                const emailsResponse = await axios.get("https://api.github.com/user/emails", {
                    headers: {
                        Authorization: `token ${accessToken}`
                    }
                });
                
                // Find the primary email
                const primaryEmail = emailsResponse.data.find(email => email.primary);
                email = primaryEmail ? primaryEmail.email : emailsResponse.data[0]?.email;
            } catch (emailErr) {
                console.warn("Failed to fetch user emails:", emailErr);
            }
        }

        // Store user in Firestore
        const userRef = admin.firestore().collection("users").doc(githubUser.id.toString());
        
        // Get existing user data
        const userDoc = await userRef.get();
        let role = "user";
        
        // If user exists, preserve their role
        if (userDoc.exists) {
            const existingUser = userDoc.data();
            role = existingUser.role || "user";
        }
        
        // Check if user should be admin
        const adminUsers = process.env.ADMIN_USERS ? process.env.ADMIN_USERS.split(",") : [];
        if (adminUsers.includes(githubUser.login)) {
            role = "admin";
        }
        
        // Update user data
        await userRef.set({
            githubId: githubUser.id,
            username: githubUser.login,
            name: githubUser.name || githubUser.login,
            email: email,
            avatar_url: githubUser.avatar_url,
            accessToken,
            role,
            lastLogin: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // Create a JWT token with all necessary user info
        const jwtToken = jwt.sign(
            {
                uid: githubUser.id.toString(),
                githubId: githubUser.id,
                username: githubUser.login,
                email: email,
                role,
                avatarUrl: githubUser.avatar_url,
                accessToken,
                provider: "github"
            },
            process.env.JWT_SECRET || "your-jwt-secret",
            { expiresIn: "7d" }
        );

        // Log successful authentication
        console.log(`User ${githubUser.login} (${githubUser.id}) authenticated successfully`);
        
        // Redirect to the client with the token in the URL
        // The client will store this in localStorage
        return res.redirect(`${FRONTEND_URL}/auth-callback?token=${encodeURIComponent(jwtToken)}`);
        
    } catch (error) {
        console.error("GitHub OAuth error:", error);
        return res.redirect(`${FRONTEND_URL}/error?message=Authentication+failed&details=${encodeURIComponent(error.message)}`);
    }
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
        return res.status(401).json({ error: "Unauthorized" });
    }
    
    try {
        // Verify the token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Get the user from Firestore to retrieve their GitHub access token
        const userDoc = await admin.firestore().collection("users").doc(decoded.githubId.toString()).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ error: "User not found" });
        }
        
        const userData = userDoc.data();
        const accessToken = userData.accessToken;
        
        if (!accessToken) {
            return res.status(400).json({ error: "GitHub access token not found" });
        }
        
        // Fetch repositories from GitHub API using the stored access token
        const reposResponse = await axios.get("https://api.github.com/user/repos", {
            headers: { Authorization: `token ${accessToken}` },
            params: {
                sort: "updated",
                per_page: 100,
            },
        });
        
        res.json(reposResponse.data);
    } catch (error) {
        console.error("Error fetching GitHub repositories:", error);
        res.status(500).json({ error: "Failed to fetch repositories" });
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
                error: "No authentication token provided" 
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
                    error: "Token expired" 
                });
            }
            
            // Get latest user data from Firestore
            const userDoc = await admin.firestore().collection("users").doc(decoded.githubId.toString()).get();
            
            if (!userDoc.exists) {
                return res.status(401).json({ 
                    authenticated: false,
                    error: "User not found in database" 
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
                timestamp: now
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
                                timestamp: Date.now()
                            });
                        }
                    }
                }
                
                // If we get here, Firebase token verification didn't help
                return res.status(401).json({ 
                    authenticated: false,
                    error: "Invalid authentication token" 
                });
            } catch (firebaseError) {
                console.error("Firebase token verification error:", firebaseError);
                return res.status(401).json({ 
                    authenticated: false,
                    error: "Invalid authentication token" 
                });
            }
        }
    } catch (error) {
        console.error("Session verification error:", error);
        return res.status(500).json({ 
            authenticated: false,
            error: "Internal server error during authentication" 
        });
    }
});

module.exports = functions.https.onRequest(app);
