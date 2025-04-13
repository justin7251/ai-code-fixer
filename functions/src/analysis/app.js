const express = require("express");
const cors = require("cors");
const { authenticate } = require("../auth/middleware");

// Import your existing analysis logic/utilities
const { analyzeRepository } = require("./repository");
const { processResults } = require("./processor");
// Add any other imports you need from your existing analysis files

const app = express();

// Middleware
app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' }));  // Increase limit if needed for code analysis
app.use(authenticate); // Protect all analysis routes (remove if not needed)

// ===== MIGRATE YOUR EXISTING ROUTES BELOW =====

// Example: Repository analysis endpoint
app.post("/analyze-repo", async (req, res) => {
  try {
    const { repoUrl, branch, options } = req.body;
    const userId = req.user.uid; // Assuming auth middleware adds user
    
    // Call your existing analysis function
    const result = await analyzeRepository(repoUrl, branch, userId, options);
    
    res.status(200).json({ success: true, resultId: result.id });
  } catch (error) {
    console.error("Analysis error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "Failed to analyze repository" 
    });
  }
});

// Example: Get analysis results endpoint
app.get("/results/:resultId", async (req, res) => {
  try {
    const { resultId } = req.params;
    const userId = req.user.uid;
    
    // Your existing code to fetch results
    const results = await getAnalysisResults(resultId, userId);
    
    res.status(200).json(results);
  } catch (error) {
    console.error("Error fetching results:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// Import your existing services
const AnalysisService = require('./services/analysis');
const AiFixService = require('./services/ai-fix');

// Initialize services
const analysisService = new AnalysisService();
const aiFixService = new AiFixService();

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({status: 'ok'});
});

// For debugging - list endpoints
app.get('/', (req, res) => {
    res.status(200).json({
        endpoints: [
            '/health',
            '/refresh/:repoId',
            '/fix/:analysisId',
            '/fix/:fixId',
            '/debug-token',
        ],
    });
});

// Analysis refresh endpoint
app.post('/refresh/:repoId', authenticate, async (req, res) => {
    try {
        const {repoId} = req.params;
        const {branch, repoName, repoFullName} = req.body || {};
        
        console.log(`Starting analysis refresh for repo ID: ${repoId}, branch: ${branch || 'default'}`);
        
        const result = await analysisService.refreshAnalysis(repoId, req.user, {
            branch, repoName, repoFullName,
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
        const {analysisId} = req.params;
        const {issues, createPullRequest} = req.body || {};
        
        console.log(`Starting AI auto fix for analysis: ${analysisId}`);
        
        const result = await aiFixService.startFix(analysisId, req.user, {
            issues, createPullRequest,
        });
        
        return res.status(200).json(result);
        
    } catch (error) {
        console.error('AI fix error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to start AI fix: ' + error.message,
        });
    }
});

// Get fix status endpoint
app.get('/fix/:fixId', authenticate, async (req, res) => {
    try {
        const {fixId} = req.params;
        const result = await aiFixService.getFixStatus(fixId);
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error getting fix status:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get fix status: ' + error.message,
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
            hasGithubToken: !!req.user?.githubToken,
        },
        decodedToken: req.decodedToken || 'not-present',
    };
    
    console.log('Debug token info:', tokenInfo);
    
    res.status(200).json({
        success: true,
        message: 'Token debugging information',
        tokenInfo,
    });
});

module.exports = app; 