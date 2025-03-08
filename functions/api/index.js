const functions = require("firebase-functions");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const admin = require("firebase-admin");
const {authenticateUser, authorizeAdmin} = require("../middlewares/authMiddleware");

const app = express();

const corsOptions = {
    origin: ["https://ai-code-fixer.web.app", "http://localhost:5000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

// Apply CORS middleware
app.use(cors(corsOptions));
app.use(express.json());

// Public route (any authenticated user can access)
app.get("/github/repos", authenticateUser, async (req, res) => {
    try {
        const response = await axios.get("https://api.github.com/user/repos", {
            headers: {Authorization: `token ${req.user.accessToken}`},
        });

        res.json(response.data);
    } catch (error) {
        res.status(500).json({error: "Failed to fetch repositories"});
    }
});

// Admin-only route (Only admin can access)
app.get("/admin/github/users", authenticateUser, authorizeAdmin, async (req, res) => {
    try {
        const usersSnapshot = await admin.firestore().collection("users").get();
        const users = usersSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));

        res.json(users);
    } catch (error) {
        res.status(500).json({error: "Failed to fetch users"});
    }
});

exports.api = functions.https.onRequest(app);
