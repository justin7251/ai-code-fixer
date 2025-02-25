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

passport.use(
    new GitHubStrategy(
        {
            clientID: config.github.client_id,
            clientSecret: config.github.client_secret,
            callbackURL: "https://us-central1-ai-code-fixer.cloudfunctions.net/app/auth/github/callback",
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