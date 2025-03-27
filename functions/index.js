const functions = require("firebase-functions");
const admin = require('./firebase-admin');
const express = require("express");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const passport = require("passport");
const GitHubStrategy = require("passport-github").Strategy;
const path = require('path');
const fs = require('fs');
const config = require("./config");

// Load environment variables from .env file if it exists
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        console.log('[CONFIG] Loading environment variables from .env file');
        require('dotenv').config({path: envPath});
    }
} catch (error) {
    console.warn('[CONFIG] Error loading .env file:', error.message);
}

const app = express();
app.use(cookieParser());

// Import all feature modules
const auth = require("./auth");
const api = require("./api");
const jobs = require("./jobs");
const webhooks = require("./webhooks");
const analysis = require("./analysis");

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
    }),
);

// Log which credentials are being used
const isDev = process.env.FUNCTIONS_EMULATOR === 'true';
console.log('[DEBUG] Running in:', isDev ? 'LOCAL EMULATOR' : 'PRODUCTION');

// Make sure to use the right credentials
const githubClientID = isDev 
    ? process.env.DEV_GITHUB_CLIENT_ID : process.env.GITHUB_CLIENT_ID;

const githubClientSecret = isDev
    ? process.env.DEV_GITHUB_CLIENT_SECRET : process.env.GITHUB_CLIENT_SECRET;

console.log('[DEBUG] GitHub Client ID (first 4 chars):', githubClientID.substring(0, 4));
console.log('[DEBUG] GitHub Client Secret (length):', githubClientSecret?.length);

const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
const callbackURL = isEmulator 
    ? "http://localhost:5001/ai-code-fixer/us-central1/auth/github/callback"
    : "https://us-central1-ai-code-fixer.cloudfunctions.net/auth/github/callback";

passport.use(
    new GitHubStrategy(
        {
            clientID: githubClientID,
            clientSecret: githubClientSecret,
            callbackURL: callbackURL,
        },
        (accessToken, refreshToken, profile, done) => {
            return done(null, {profile, accessToken});
        },
    ),
);

// Export Firebase functions
module.exports = {
    auth,
    api,
    jobs,
    webhooks,
    analysis,
};