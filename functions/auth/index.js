const functions = require("firebase-functions");
const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const cookieParser = require("cookie-parser");
const config = require("../config");

const app = express();
app.use(cookieParser());
app.use(express.json());

const GITHUB_CLIENT_ID = config.github.client_id;
const GITHUB_CLIENT_SECRET = config.github.client_secret;
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// Callback URL configuration
const GITHUB_CALLBACK_URL = 
  "https://us-central1-ai-code-fixer.cloudfunctions.net/auth/github/callback";

// Admin users (Modify this list)
const ADMIN_USERS = ["your-github-username"];

const db = admin.firestore();

// GitHub OAuth Login Redirect
app.get("/github/login", (req, res) => {
    const state = Math.random().toString(36).substring(2, 15);
    res.cookie("github_oauth_state", state, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production', 
        sameSite: "Strict", 
    });

    const githubAuthURL = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&state=${state}&scope=repo,user&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}`;
    res.redirect(githubAuthURL);
});

// GitHub OAuth Callback
app.get("/github/callback", async (req, res) => {
    const {code, state} = req.query;
    const savedState = req.cookies.github_oauth_state;

    if (!code || !state || state !== savedState) {
        return res.status(400).send("Invalid OAuth request. Please try again.");
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
        const userDocRef = db.collection("users").doc(`${user.id}`);
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

        // Generate JWT
        const jwtToken = jwt.sign({githubId: user.id, role}, JWT_SECRET, {expiresIn: "7d"});

        res.cookie("session_token", jwtToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "None",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        // Redirect to dashboard
        res.redirect("https://ai-code-fixer.web.app/dashboard");
    } catch (error) {
        console.error("GitHub OAuth Error:", error);
        res.status(500).send(`
            <html>
                <body>
                    <h1>Authentication Failed</h1>
                    <p>Error: ${error.message}</p>
                    <a href="https://ai-code-fixer.web.app/login">Return to Login</a>
                </body>
            </html>
        `);
    }
});

// Logout route
app.get("/logout", (req, res) => {
    res.clearCookie("session_token");
    res.json({message: "Logged out successfully"});
});

module.exports = functions.https.onRequest(app);
