const express = require('express');
const cors = require('cors');
const functions = require('firebase-functions');

// Import middleware and services
const { authenticate } = require('./middleware/auth');
const AnalysisService = require('./services/analysis');
const AiFixService = require('./services/ai-fix');

const app = express();

// Apply CORS middleware
app.use(cors({
    origin: true,
    credentials: true,
}));

// Initialize services
const analysisService = new AnalysisService();
const aiFixService = new AiFixService();

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// For debugging - list endpoints
app.get('/', (req, res) => {
    res.status(200).json({
        endpoints: [
            '/health',
            '/refresh/:repoId',
            '/fix/:analysisId',
            '/debug-token'
        ]
    });
});

// Analysis refresh endpoint
app.post('/refresh/:repoId', authenticate, async (req, res) => {
    try {
        const {repoId} = req.params;
        const {branch, repoName, repoFullName} = req.body || {};
        
        console.log(`Starting analysis refresh for repo ID: ${repoId}, branch: ${branch || 'default'}`);
        
        const result = await analysisService.refreshAnalysis(repoId, req.user, {
            branch, repoName, repoFullName
        });
        
        return res.status(200).json(result);
        
    } catch (error) {
        console.error('Refresh analysis unexpected error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to refresh analysis: ' + error.message,
        });
    }
});

// AI Auto Fix endpoint
app.post('/fix/:analysisId', authenticate, async (req, res) => {
    try {
        const { analysisId } = req.params;
        const { issues, createPullRequest } = req.body || {};
        
        console.log(`Starting AI auto fix for analysis: ${analysisId}`);
        
        const result = await aiFixService.startFix(analysisId, req.user, {
            issues, createPullRequest
        });
        
        return res.status(200).json(result);
        
    } catch (error) {
        console.error('AI fix error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to start AI fix: ' + error.message
        });
    }
});

// Get fix status endpoint
app.get('/fix/:fixId', authenticate, async (req, res) => {
    try {
        const { fixId } = req.params;
        const result = await aiFixService.getFixStatus(fixId);
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error getting fix status:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get fix status: ' + error.message
        });
    }
});

// Debug token endpoint
app.get('/debug-token', authenticate, (req, res) => {
    const tokenInfo = {
        user: {
            githubId: req.user?.githubId || 'not-present',
            name: req.user?.name || 'not-present',
            email: req.user?.email || 'not-present',
            hasGithubToken: !!req.user?.githubToken
        },
        decodedToken: req.decodedToken || 'not-present'
    };
    
    console.log('Debug token info:', tokenInfo);
    
    res.status(200).json({
        success: true,
        message: 'Token debugging information',
        tokenInfo
    });
});

// Export the Express app
module.exports = app; 