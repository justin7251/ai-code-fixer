const functions = require("firebase-functions");
const express = require("express");
const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const config = require("../config");
const rateLimit = require("express-rate-limit");

const app = express();

// Configure CORS
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
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers"
    ],
    exposedHeaders: ["Authorization"],
    maxAge: 86400 // 24 hours
};

// Apply middleware in the correct order
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Add a test route to verify CORS is working
app.get('/test-cors', cors(corsOptions), (req, res) => {
    res.json({ message: 'CORS is working!' });
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {error: "Too many requests, please try again later."},
});
app.use(limiter);

// Authentication middleware
const authenticateToken = (req, res, next) => {
    // Log the incoming request headers for debugging
    console.log('Request headers:', req.headers);
    
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        console.log('No Authorization header found');
        return res.status(401).json({ 
            error: "Authentication required",
            message: "No Authorization header found"
        });
    }

    // Check if the Authorization header is properly formatted
    if (!authHeader.startsWith('Bearer ')) {
        console.log('Invalid Authorization header format');
        return res.status(401).json({ 
            error: "Invalid token format",
            message: "Authorization header must start with 'Bearer '"
        });
    }

    const token = authHeader.substring(7);
    if (!token) {
        console.log('No token found in Authorization header');
        return res.status(401).json({ 
            error: "Authentication required",
            message: "No token found in Authorization header"
        });
    }

    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        if (!decoded.githubId) {
            console.log('Token missing githubId');
            return res.status(401).json({ 
                error: "Invalid token",
                message: "Token missing required user data"
            });
        }
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification failed:', error);
        return res.status(401).json({ 
            error: "Invalid token",
            message: error.message
        });
    }
};

// Base route to verify the function is working
app.get("/", (req, res) => {
    res.json({ status: "API is running" });
});

// Repository Management Endpoints
app.get("/repositories", authenticateToken, async (req, res) => {
    try {
        const db = admin.firestore();
        const userReposRef = db.collection('users').doc(String(req.user.githubId)).collection('repositories');
        const reposSnapshot = await userReposRef.get();
        
        const repositories = [];
        reposSnapshot.forEach(doc => {
            repositories.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.json({ repositories });
    } catch (error) {
        console.error('Error fetching repositories:', error);
        res.status(500).json({ error: "Failed to fetch repositories" });
    }
});

app.post("/repositories", authenticateToken, async (req, res) => {
    try {
        const { repositories } = req.body;

        if (!Array.isArray(repositories)) {
            return res.status(400).json({ error: "Invalid repositories data" });
        }

        const db = admin.firestore();
        const batch = db.batch();
        const userReposRef = db.collection('users').doc(String(req.user.githubId)).collection('repositories');

        repositories.forEach(repo => {
            const repoData = {
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description,
                private: repo.private,
                language: repo.language,
                status: 'active',
                addedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            batch.set(userReposRef.doc(String(repo.id)), repoData);
        });

        await batch.commit();
        res.json({ success: true, message: "Repositories added successfully" });
    } catch (error) {
        console.error('Error adding repositories:', error);
        res.status(500).json({ error: "Failed to add repositories" });
    }
});

// Session Verification Endpoint
app.get("/session", authenticateToken, async (req, res) => {
    try {
        const db = admin.firestore();
        const userDoc = await db.collection('users').doc(String(req.user.githubId)).get();

        if (!userDoc.exists) {
            return res.status(401).json({ authenticated: false });
        }

        const userData = userDoc.data();
        res.json({
            authenticated: true,
            user: {
                id: userData.githubId,
                username: userData.username,
                name: userData.displayName,
                avatar: userData.avatar
            }
        });
    } catch (error) {
        console.error('Error verifying session:', error);
        res.status(401).json({ authenticated: false });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: "Internal server error" });
});

// Export the function
exports.auth = functions.https.onRequest(app);
