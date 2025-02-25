const functions = require("firebase-functions");

function getConfig() {
    try {
        const config = functions.config();
        console.log("Loaded Firebase Config:", {
            githubClientId: config.github && config.github.client_id ? "PRESENT" : "MISSING",
            sessionSecretKey: config.session && config.session.secret_key ? "PRESENT" : "MISSING",
        });
        return config;
    } catch (e) {
        console.error("Failed to load Firebase config, using fallback:", e);
        return {
            session: {
                secret_key: process.env.SESSION_SECRET || "local-secret-key",
            },
            github: {
                client_id: process.env.GITHUB_CLIENT_ID || "your-client-id",
                client_secret: process.env.GITHUB_CLIENT_SECRET || "your-client-secret",
            },
        };
    }
}

module.exports = getConfig();