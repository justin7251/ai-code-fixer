const functions = require("firebase-functions");
const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const config = require("../config");
const rateLimit = require("express-rate-limit");

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

// GitHub OAuth Callback
app.get("/github/callback", async (req, res) => {
    const {code, state} = req.query;
    
    // Note: We're removing the strict state check for debugging
    // (In production, you should verify the state parameter)
    const storedState = req.cookies.github_oauth_state;
    if (!storedState || storedState !== state) {
        return res.status(400).json({error: "Invalid OAuth request. Please try again."});
    }
    
    if (!code) {
        return res.status(400).json({error: "Invalid OAuth request. Please try again."});
    }

    try {
        const tokenResponse = await axios.post(
            "https://github.com/login/oauth/access_token",
            {
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code,
                redirect_uri: GITHUB_CALLBACK_URL,
            },
            {
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
            },
        );

        if (!tokenResponse.data.access_token) {
            throw new Error("No access token in response");
        }
        const accessToken = tokenResponse.data.access_token;

        // Fetch user details
        const userResponse = await axios.get("https://api.github.com/user", {
            headers: {Authorization: `token ${accessToken}`},
        });

        const user = userResponse.data;
        let role = "user";

        // Check and update user in Firestore
        const userDocRef = admin.firestore().collection("users").doc(`${user.id}`);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            role = ADMIN_USERS.includes(user.login) ? "admin" : "user";
        } else {
            role = userDoc.data().role || "user";
        }

        // Store user data
        await userDocRef.set(
            {
                githubId: user.id,
                username: user.login,
                avatar_url: user.avatar_url,
                role,
                accessToken,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            {merge: true},
        );

        // Generate JWT with all needed user info
        const jwtToken = jwt.sign(
            { 
                githubId: user.id, 
                role, 
                username: user.login,
                avatar_url: user.avatar_url,
            }, 
            JWT_SECRET, 
            {expiresIn: "7d"},
        );

        // Set cookie with proper configuration
        res.cookie("session_token", jwtToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: "/",
        });

        // Redirect to dashboard with token in query param for client-side access
        res.redirect(`${FRONTEND_URL}/dashboard?token=${jwtToken}`);
    } catch (error) {
        console.error("GitHub OAuth Error:", error);
        res.status(500).json({error: "Authentication Failed", details: error.message});
    }
});

// Verify session endpoint
app.get("/verify-session", (req, res) => {
    const token = req.cookies.session_token;
    
    if (!token) {
        return res.status(401).json({authenticated: false});
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return res.status(200).json({ 
            authenticated: true, 
            user: {
                githubId: decoded.githubId,
                username: decoded.username,
                role: decoded.role,
                avatar_url: decoded.avatar_url,
            }, 
        });
    } catch (error) {
        return res.status(401).json({authenticated: false});
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

module.exports = functions.https.onRequest(app);
