const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const passport = require("passport");
const GitHubStrategy = require("passport-github").Strategy;

// Initialize Firebase Admin
admin.initializeApp();

const app = express();
app.use(cookieParser());

// Import all feature modules
const auth = require("./auth");
const api = require("./api");
const jobs = require("./jobs");
const webhooks = require("./webhooks");

// Helper function to safely get config
const getConfig = () => {
    try {
        return functions.config();
    } catch (e) {
        return {
            session: {
                secret_key: "local-secret-key",
            },
            github: {
                client_id: "your-client-id",
                client_secret: "your-client-secret",
            },
        };
    }
};

const config = getConfig();

app.use(
    session({
        secret: config.session.secret_key,
        resave: false,
        saveUninitialized: true,
    }),
);

// Log which credentials are being used
const isDev = process.env.FUNCTIONS_EMULATOR === 'true';
console.log('[DEBUG] Running in:', isDev ? 'LOCAL EMULATOR' : 'PRODUCTION');

// Make sure to use the right credentials
const githubClientID = isDev 
    ? (process.env.DEV_GITHUB_CLIENT_ID || config.github.dev_client_id) 
    : (process.env.GITHUB_CLIENT_ID || config.github.client_id);

const githubClientSecret = isDev
    ? (process.env.DEV_GITHUB_CLIENT_SECRET || config.github.dev_client_secret)
    : (process.env.GITHUB_CLIENT_SECRET || config.github.client_secret);

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
};