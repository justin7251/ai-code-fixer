const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "your_very_secure_secret_key";

function authenticateUser(req, res, next) {
    const token = (req.headers.authorization && req.headers.authorization.split(" ")[1]) || 
                 (req.cookies && req.cookies.session_token) || 
                 req.query.token;

    if (!token) {
        return res.status(401).json({error: "Unauthorized: No token provided"});
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        return admin.firestore()
            .collection("users")
            .doc(String(decoded.githubId))
            .get()
            .then((userDoc) => {
                if (!userDoc.exists) {
                    return res.status(401).json({
                        error: "Unauthorized: User not found",
                    });
                }

                req.user = {
                    ...userDoc.data(),
                    githubId: decoded.githubId,
                };
                next();
            })
            .catch((error) => {
                console.error("Firestore user lookup error:", error);
                return res.status(500).json({
                    error: "Internal server error",
                });
            });
    } catch (error) {
        console.error("Token verification error:", error);
        return res.status(403).json({
            error: "Invalid token",
        });
    }
}

function authorizeAdmin(req, res, next) {
    if (!(req.user && req.user.role === "admin")) {
        return res.status(403).json({
            error: "Forbidden: Admins only",
        });
    }
    next();
}

module.exports = {
    authenticateUser,
    authorizeAdmin,
};
