const express = require('express');
const admin = require('../firebase-admin');
const {v4: uuidv4} = require('uuid');
const functions = require('firebase-functions');
const cors = require('cors');
const jwt = require('jsonwebtoken');

// Get JWT secret from environment or use a default for development
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key';

// Use dynamic import for Octokit in a way that's compatible with Firebase Functions
let Octokit;
try {
    // Try CommonJS require first
    Octokit = require('@octokit/rest').Octokit;
} catch (error) {
    // If that fails, we'll use dynamic import when needed
    console.warn('Using dynamic import for Octokit');
}

const app = express();

// Apply CORS middleware
app.use(cors({
    origin: true,
    credentials: true,
}));

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
            
            // Debug - log what's in the token
            console.log('JWT contents:', Object.keys(decoded));
            
            // Check for GitHub token in different possible locations
            const githubToken = 
                decoded.githubToken || 
                decoded.accessToken || 
                decoded.access_token || 
                decoded.github_token;
            
            if (!githubToken && !isDev) {
                console.error('Token does not contain GitHub token:', decoded);
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

// Helper function to safely fetch Octokit instance
async function getOctokit(token) {
    if (Octokit) {
        // If we loaded it via require
        return new Octokit({auth: token});
    } else {
        // Dynamic import as fallback
        const {Octokit: DynamicOctokit} = await import('@octokit/rest');
        return new DynamicOctokit({auth: token});
    }
}

// Analysis refresh endpoint with token handling improvements
app.post('/refresh/:repoId', authenticate, async (req, res) => {
    try {
        const {repoId} = req.params;
        const {branch, repoName, repoFullName} = req.body || {};

        console.log(`Starting analysis refresh for repo ID: ${repoId}, branch: ${branch || 'default'}`);
    
        if (!repoId) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Repository ID required',
            });
        }


        const githubToken = await admin.firestore().collection('users').doc(req.user.githubId).get();
        
     
        // Get repository details, with improved token handling
        try {
            // First try to get the repo from Firestore
            let repoData = null;
            const db = admin.firestore();
            
            console.log(`Looking for repository with ID: ${repoId}`);
            
            // Try to get repo from Firestore
            try {
                const repoDoc = await db.collection('repositories')
                    .where('id', '==', parseInt(repoId, 10))
                    .limit(1)
                    .get();
                    
                if (!repoDoc.empty) {
                    repoData = repoDoc.docs[0].data();
                    console.log(`Found repository in database: ${repoData.fullName}`);
                }
            } catch (dbError) {
                console.warn(`Error querying repositories: ${dbError.message}`);
            }
                
            // If not in database but provided in request body, use that
            if (!repoData && repoName && repoFullName) {
                console.log(`Using repository data from request: ${repoFullName}`);
                repoData = {
                    id: parseInt(repoId, 10),
                    name: repoName,
                    fullName: repoFullName,
                    defaultBranch: branch || 'main',
                };
                
                // Save this repository for future use (but don't block on it)
                try {
                    await db.collection('repositories').doc(repoId.toString()).set(repoData);
                    console.log(`Added repository ${repoFullName} to database`);
                } catch (saveError) {
                    console.warn(`Could not save repository data: ${saveError.message}`);
                }
            } 
            // For development/testing: Use hardcoded data if everything else fails
            else if (!repoData && process.env.FUNCTIONS_EMULATOR === 'true') {
                console.log(`Development mode: Using mock repository data`);
                repoData = {
                    id: parseInt(repoId, 10),
                    name: 'mock-repo',
                    fullName: 'mock-user/mock-repo',
                    defaultBranch: 'main',
                };
            }
            // If we still don't have repo data, return error
            else if (!repoData) {
                return res.status(404).json({
                    error: 'Not Found',
                    message: 'Repository not found. Please provide repoName and repoFullName in the request body.',
                });
            }
            
            const branchToUse = branch || repoData.defaultBranch || 'main';
      
            // Create a new analysis record
            const analysisId = uuidv4();
            const analysisData = {
                id: analysisId,
                repoId: parseInt(repoId, 10),
                repoName: repoData.name,
                repoFullName: repoData.fullName,
                branch: branchToUse,
                userId: req.user?.githubId || "anonymous",
                status: 'running', // Set to running immediately to avoid duplicate starts
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                issues: [],
                issueCount: 0,
            };
      
            // Save the analysis record
            await db.collection('analyses').doc(analysisId).set(analysisData);
            
            // Start analysis in background (don't await)
            runAnalysis(analysisId, repoData.fullName, branchToUse, githubToken)
                .catch(err => console.error(`Analysis error for ${analysisId}:`, err));
            
            // Return the initial response to client
            return res.status(200).json({
                success: true,
                message: 'Analysis started successfully',
                analysis: analysisData,
            });
            
        } catch (repoError) {
            console.error('Error processing repository:', repoError);
            return res.status(500).json({
                error: 'Repository Error',
                message: 'Failed to process repository: ' + repoError.message,
            });
        }
    } catch (error) {
        console.error('Refresh analysis unexpected error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to refresh analysis: ' + error.message,
        });
    }
});

// Function to run the actual analysis on a repository
async function runAnalysis(analysisId, repoFullName, branch, githubToken) {
    const db = admin.firestore();
  
    try {
        console.log(`Starting analysis ${analysisId} for ${repoFullName}`);
    
        // Get Octokit instance
        const octokit = await getOctokit(githubToken);
    
        // 1. Get repository content (we'll process top-level directories and files first)
        const [owner, repo] = repoFullName.split('/');
        
        console.log(`Fetching repository content for ${owner}/${repo}`);
        
        // Track all issues found during analysis
        const allIssues = [];
        const fileTypes = {
            js: 'javascript',
            jsx: 'javascript',
            ts: 'typescript',
            tsx: 'typescript',
            java: 'java',
            py: 'python',
            rb: 'ruby',
            php: 'php',
            go: 'go',
            cs: 'csharp',
            css: 'css',
            html: 'html',
            md: 'markdown',
        };
        
        // Get top-level content
        try {
            const {data: contents} = await octokit.repos.getContent({
                owner,
                repo,
                path: '',
                ref: branch,
            });
            
            // Recursively process directories and files
            await processContents(octokit, owner, repo, branch, contents, '', allIssues, fileTypes);
            
        } catch (contentError) {
            console.error(`Error fetching repository content: ${contentError.message}`);
            throw new Error(`Failed to fetch repository content: ${contentError.message}`);
        }
        
        // Aggregate issues by rule type
        const issuesByRule = {};
        for (const issue of allIssues) {
            if (!issuesByRule[issue.rule]) {
                issuesByRule[issue.rule] = {
                    rule: issue.rule,
                    count: 0,
                    severity: issue.severity,
                    description: issue.description,
                    examples: [],
                };
            }
            
            issuesByRule[issue.rule].count++;
            
            // Add a few examples of each issue (limit to 5 per rule)
            if (issuesByRule[issue.rule].examples.length < 5) {
                issuesByRule[issue.rule].examples.push({
                    file: issue.file,
                    line: issue.line,
                    snippet: issue.snippet,
                });
            }
        }
        
        // Convert to array for storage
        const aggregatedIssues = Object.values(issuesByRule);
        
        // Update the analysis with results
        await db.collection('analyses').doc(analysisId).update({
            status: 'completed',
            issues: aggregatedIssues,
            issueCount: allIssues.length,
            fileCount: allIssues.reduce((acc, issue) => {
                if (!acc[issue.file]) {
                    acc[issue.file] = true;
                }
                return acc;
            }, {}),
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        console.log(`Analysis ${analysisId} completed successfully with ${allIssues.length} issues found`);
    
    } catch (error) {
        console.error(`Analysis failed for ${analysisId}:`, error);
    
        // Update analysis status to failed
        try {
            await db.collection('analyses').doc(analysisId).update({
                status: 'failed',
                error: error.message || 'Unknown error occurred',
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (updateError) {
            console.error('Failed to update analysis status:', updateError);
        }
    
        throw error;
    }
}

// Helper function to process repository contents recursively
async function processContents(octokit, owner, repo, branch, contents, basePath, allIssues, fileTypes) {
    for (const item of contents) {
        const path = basePath ? `${basePath}/${item.name}` : item.name;
        
        if (item.type === 'dir') {
            // Process directory recursively
            try {
                const {data: dirContents} = await octokit.repos.getContent({
                    owner,
                    repo,
                    path: path,
                    ref: branch,
                });
                
                await processContents(octokit, owner, repo, branch, dirContents, path, allIssues, fileTypes);
            } catch (dirError) {
                console.warn(`Error processing directory ${path}: ${dirError.message}`);
            }
        } else if (item.type === 'file') {
            // Process file
            const fileExtension = item.name.split('.').pop().toLowerCase();
            const fileType = fileTypes[fileExtension];
            
            if (fileType) {
                try {
                    // Get file content
                    const {data: fileData} = await octokit.repos.getContent({
                        owner,
                        repo,
                        path: path,
                        ref: branch,
                    });
                    
                    // Decode content from base64
                    const content = Buffer.from(fileData.content, 'base64').toString('utf8');
                    
                    // Analyze file content
                    const fileIssues = analyzeFileContent(path, content, fileType);
                    
                    // Add file path to each issue
                    fileIssues.forEach(issue => {
                        issue.file = path;
                        allIssues.push(issue);
                    });
                    
                    console.log(`Analyzed ${path}: found ${fileIssues.length} issues`);
                    
                } catch (fileError) {
                    console.warn(`Error analyzing file ${path}: ${fileError.message}`);
                }
            }
        }
    }
}

// Function to analyze file content based on type
function analyzeFileContent(filePath, content, fileType) {
    const issues = [];
    const lines = content.split('\n');
    
    // Define analysis rules by file type
    const rules = {
        javascript: [
            {
                pattern: /console\.log\(/g,
                severity: 'WARNING',
                rule: 'AvoidConsoleLog',
                description: 'Avoid console.log statements in production code',
            },
            {
                pattern: /var\s+/g,
                severity: 'WARNING',
                rule: 'UseConstOrLet',
                description: 'Use let or const instead of var',
            },
            {
                pattern: /==(?!=)/g,
                severity: 'WARNING',
                rule: 'UseStrictEquality',
                description: 'Use === instead of ==',
            },
            {
                pattern: /\/\/\s*TODO/gi,
                severity: 'INFO',
                rule: 'TodoComment',
                description: 'TODO comment found',
            },
            {
                pattern: /catch\s*\([^)]*\)\s*{\s*}/g,
                severity: 'ERROR',
                rule: 'EmptyCatchBlock',
                description: 'Empty catch blocks should be avoided',
            },
        ],
        typescript: [
            {
                pattern: /any(?=\s*[;,:)=\]])/g,
                severity: 'WARNING',
                rule: 'AvoidAny',
                description: 'Avoid using any type, specify a more precise type',
            },
            {
                pattern: /console\.log\(/g,
                severity: 'WARNING',
                rule: 'AvoidConsoleLog',
                description: 'Avoid console.log statements in production code',
            },
            {
                pattern: /==(?!=)/g,
                severity: 'WARNING',
                rule: 'UseStrictEquality',
                description: 'Use === instead of ==',
            },
        ],
        java: [
            {
                pattern: /System\.out\.println\(/g,
                severity: 'WARNING',
                rule: 'AvoidSystemOut',
                description: 'Avoid System.out.println in production code, use a logger',
            },
            {
                pattern: /catch\s*\(\s*Exception\s+[a-z]+\s*\)/g,
                severity: 'ERROR',
                rule: 'AvoidCatchingGenericException',
                description: 'Avoid catching generic Exception, catch specific exceptions',
            },
            {
                pattern: /catch\s*\([^)]*\)\s*{\s*}/g,
                severity: 'ERROR',
                rule: 'EmptyCatchBlock',
                description: 'Empty catch blocks should be avoided',
            },
        ],
        python: [
            {
                pattern: /print\s*\(/g,
                severity: 'INFO',
                rule: 'AvoidPrint',
                description: 'Consider using a logger instead of print statements',
            },
            {
                pattern: /except\s*:/g,
                severity: 'ERROR',
                rule: 'AvoidBareExcept',
                description: 'Avoid bare except, specify exception types',
            },
            {
                pattern: /#\s*TODO/gi,
                severity: 'INFO',
                rule: 'TodoComment',
                description: 'TODO comment found',
            },
        ],
        php: [
            {
                pattern: /echo\s+/g,
                severity: 'INFO',
                rule: 'AvoidEcho',
                description: 'Consider using a logger instead of echo',
            },
            {
                pattern: /\$_GET|\$_POST|\$_REQUEST/g,
                severity: 'WARNING',
                rule: 'ValidateInput',
                description: 'Always validate user input from $_GET, $_POST, or $_REQUEST',
            },
        ],
        go: [
            {
                pattern: /fmt\.Print(ln|f)?\(/g,
                severity: 'INFO',
                rule: 'AvoidFmtPrint',
                description: 'Consider using a logger instead of fmt.Print',
            },
        ],
        ruby: [
            {
                pattern: /puts\s+/g,
                severity: 'INFO',
                rule: 'AvoidPuts',
                description: 'Consider using a logger instead of puts',
            },
        ],
        csharp: [
            {
                pattern: /Console\.Write(Line)?\(/g,
                severity: 'INFO',
                rule: 'AvoidConsoleWrite',
                description: 'Consider using a logger instead of Console.Write',
            },
        ],
    };
    
    // Apply rules for this file type
    const applicableRules = rules[fileType] || [];
    
    // Check each line against the rules
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        for (const rule of applicableRules) {
            // Reset regex lastIndex
            rule.pattern.lastIndex = 0;
            
            let match;
            while ((match = rule.pattern.exec(line)) !== null) {
                // Get a code snippet for context (3 lines before and after)
                const startLine = Math.max(0, i - 2);
                const endLine = Math.min(lines.length - 1, i + 2);
                
                let snippet = '';
                for (let s = startLine; s <= endLine; s++) {
                    const prefix = s === i ? '> ' : '  ';
                    snippet += `${prefix}${s+1}: ${lines[s]}\n`;
                }
                
                issues.push({
                    line: i + 1,
                    column: match.index + 1,
                    rule: rule.rule,
                    severity: rule.severity,
                    description: rule.description,
                    snippet: snippet.trim(),
                });
            }
        }
    }
    
    return issues;
}

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
        ],
    });
});

// Export the Express app
module.exports = app; 