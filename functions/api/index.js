const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const { authenticateUser } = require("../middlewares/authMiddleware");

const app = express();

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            "https://ai-code-fixer.web.app",
            "http://localhost:3000",
            "http://localhost:5000"
        ];
        
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 86400 // 24 hours
};

// Apply middleware
app.use(cors(corsOptions));
app.use(express.json());

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error('API Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error',
        code: err.code || 'INTERNAL_ERROR'
    });
};

// Get user's repositories
app.get("/github/user-repos", authenticateUser, async (req, res, next) => {
    try {
        const { githubId } = req.user;
        
        if (!githubId) {
            throw {
                status: 401,
                message: 'GitHub ID not found in user data',
                code: 'MISSING_GITHUB_ID'
            };
        }

        // Fetch repositories from Firestore
        const db = admin.firestore();
        const userReposRef = db.collection('users').doc(String(githubId)).collection('repositories');
        const reposSnapshot = await userReposRef.get();
        
        if (reposSnapshot.empty) {
            return res.status(200).json({
                success: true,
                repositories: [],
                message: 'No repositories found'
            });
        }

        const repositories = [];
        reposSnapshot.forEach(doc => {
            const repoData = doc.data();
            repositories.push({
                id: doc.id,
                name: repoData.name,
                full_name: repoData.full_name,
                description: repoData.description,
                private: repoData.private,
                language: repoData.language,
                status: repoData.status || 'not_started',
                issues_count: repoData.issues_count || 0,
                fixed_issues: repoData.fixed_issues || 0,
                updated_at: repoData.updated_at,
                created_at: repoData.created_at
            });
        });

        return res.status(200).json({
            success: true,
            repositories,
            count: repositories.length
        });

    } catch (error) {
        next(error);
    }
});

// Get available repositories from GitHub
app.get("/github/available-repos", authenticateUser, async (req, res, next) => {
    try {
        const { accessToken } = req.user;
        
        if (!accessToken) {
            throw {
                status: 401,
                message: 'GitHub access token not found',
                code: 'MISSING_ACCESS_TOKEN'
            };
        }

        // Fetch repositories from GitHub API
        const response = await fetch('https://api.github.com/user/repos', {
            headers: {
                'Authorization': `token ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw {
                status: response.status,
                message: errorData.message || 'Failed to fetch repositories from GitHub',
                code: 'GITHUB_API_ERROR'
            };
        }

        const repositories = await response.json();
        
        return res.status(200).json({
            success: true,
            repositories: repositories.map(repo => ({
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description,
                private: repo.private,
                language: repo.language,
                updated_at: repo.updated_at,
                created_at: repo.created_at
            })),
            count: repositories.length
        });

    } catch (error) {
        next(error);
    }
});

// Apply error handling middleware
app.use(errorHandler);

// Export the API
module.exports = {
    api: functions.https.onRequest(app)
};
