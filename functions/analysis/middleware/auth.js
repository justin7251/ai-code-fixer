const jwt = require('jsonwebtoken');

// Get JWT secret from environment or use a default for development
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key';

// Authentication middleware with improved token handling
const authenticate = async (req, res, next) => {
    try {
        // For development/testing, allow a token query parameter
        const isDev = process.env.FUNCTIONS_EMULATOR === 'true';
        
        // First check for regular Authorization header
        let token = null;
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split('Bearer ')[1];
            console.log('Found Bearer token in Authorization header');
        } 
        // For development, also check query parameter 
        else if (isDev && req.query.token) {
            token = req.query.token;
            console.log('Using token from query parameter');
        }
        
        // Check if we have a token
        if (!token) {
            // For development, provide a mock token
            if (isDev) {
                console.log('Development mode: Using mock GitHub token');
                req.user = {
                    githubId: 'dev-user',
                    githubToken: process.env.DEV_GITHUB_TOKEN || 'github_pat_test_token',
                    name: 'Development User',
                };
                return next();
            }
            
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing authorization token',
            });
        }
        
        // Try to decode the JWT
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // Store the decoded token (without sensitive parts) for debugging
            req.decodedToken = { 
                ...decoded,
                // Remove sensitive information
                githubToken: decoded.githubToken ? '[PRESENT]' : '[MISSING]',
                accessToken: decoded.accessToken ? '[PRESENT]' : '[MISSING]',
                access_token: decoded.access_token ? '[PRESENT]' : '[MISSING]',
                github_token: decoded.github_token ? '[PRESENT]' : '[MISSING]',
            };
            
            // Debug - log what's in the token
            console.log('JWT contents:', Object.keys(decoded));
            
            // Check for GitHub token in different possible locations
            const githubToken = 
                decoded.githubToken || 
                decoded.accessToken || 
                decoded.access_token || 
                decoded.github_token;
            
            if (!githubToken && !isDev) {
                console.error('Token does not contain GitHub token. Token keys:', Object.keys(decoded));
                return res.status(401).json({
                    error: 'Unauthorized', 
                    message: 'Token does not contain GitHub credentials',
                });
            }
            
            // Set user with GitHub token
            req.user = {
                githubId: decoded.githubId || decoded.id || 'unknown',
                githubToken: githubToken,
                name: decoded.name,
                email: decoded.email,
            };
            
            console.log(`Authenticated user ${req.user.githubId} with token: ${githubToken ? 'Present' : 'Missing'}`);
            
            return next();
        } catch (jwtError) {
            console.error('JWT verification error:', jwtError);
            
            // For development, allow through with mock token
            if (isDev) {
                console.log('Development mode: Using mock GitHub token');
                req.user = {
                    githubId: 'dev-user',
                    githubToken: process.env.DEV_GITHUB_TOKEN || 'github_pat_test_token',
                    name: 'Development User',
                };
                return next();
            }
            
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid token',
            });
        }
    } catch (error) {
        console.error('Authentication error:', error);
        
        // For development, allow through with mock token
        if (process.env.FUNCTIONS_EMULATOR === 'true') {
            console.log('Development mode: Using mock GitHub token');
            req.user = {
                githubId: 'dev-user',
                githubToken: process.env.DEV_GITHUB_TOKEN || 'github_pat_test_token',
                name: 'Development User',
            };
            return next();
        }
        
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication error',
        });
    }
};

module.exports = {authenticate, JWT_SECRET}; 