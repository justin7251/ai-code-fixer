const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { Octokit } = require('@octokit/rest');
const cors = require('cors')({ origin: true, credentials: true });
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret';
const jwt = require('jsonwebtoken');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const express = require('express');
const app = express();

// Middleware to authenticate requests
const authenticate = async (req, res, next) => {
  try {
    // Get auth token from cookies or Authorization header
    const token = 
      (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') 
        ? req.headers.authorization.substring(7) : null) ||
      req.cookies.auth_token;
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    
    return next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid authentication' 
    });
  }
};

// CORS middleware for all routes
app.use(cors);
app.use(express.json());

// Start a new code analysis
app.post('/start', authenticate, async (req, res) => {
  try {
    const { repoId, repoName, repoFullName, branch } = req.body;
    
    if (!repoId || !repoName || !repoFullName) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Repository information required'
      });
    }
    
    // Check if any analysis is already running for this repo
    const db = admin.firestore();
    const runningAnalysisRef = await db.collection('analyses')
      .where('repoId', '==', repoId)
      .where('status', 'in', ['pending', 'running'])
      .limit(1)
      .get();
    
    if (!runningAnalysisRef.empty) {
      return res.status(400).json({
        error: 'Analysis In Progress',
        message: 'An analysis is already running for this repository',
        analysis: runningAnalysisRef.docs[0].data()
      });
    }
    
    // Create a new analysis entry
    const analysisId = uuidv4();
    const analysisData = {
      id: analysisId,
      repoId,
      repoName,
      repoFullName,
      branch: branch || 'main',
      userId: req.user.githubId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
      issueCount: 0,
      issues: []
    };
    
    // Store the analysis in Firestore
    await db.collection('analyses').doc(analysisId).set(analysisData);
    
    // Trigger the analysis process (in a real system, this would use a pub/sub or queue)
    // For now, we'll update the status to running and then queue a function to process it
    await db.collection('analyses').doc(analysisId).update({
      status: 'running'
    });
    
    // Start the analysis process asynchronously (don't await)
    runAnalysis(analysisId, repoFullName, branch, req.user.githubToken)
      .catch(err => console.error(`Analysis error for ${analysisId}:`, err));
    
    return res.status(200).json({
      success: true,
      message: 'Analysis started successfully',
      analysis: {
        ...analysisData,
        status: 'running'
      }
    });
    
  } catch (error) {
    console.error('Start analysis error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to start analysis'
    });
  }
});

// Get the latest analysis for a repository
app.get('/latest/:repoId', authenticate, async (req, res) => {
  try {
    const { repoId } = req.params;
    
    if (!repoId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Repository ID required'
      });
    }
    
    // Fetch the latest analysis from Firestore
    const db = admin.firestore();
    const analysisRef = await db.collection('analyses')
      .where('repoId', '==', parseInt(repoId, 10))
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    
    if (analysisRef.empty) {
      return res.status(200).json({
        error: 'Not Found',
        message: 'No analysis found for this repository'
      });
    }
    
    const analysis = analysisRef.docs[0].data();
    
    return res.status(200).json({
      success: true,
      analysis
    });
    
  } catch (error) {
    console.error('Get latest analysis error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve analysis'
    });
  }
});

// Get a specific analysis by ID
app.get('/:analysisId', authenticate, async (req, res) => {
  try {
    const { analysisId } = req.params;
    
    if (!analysisId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Analysis ID required'
      });
    }
    
    // Fetch the analysis from Firestore
    const db = admin.firestore();
    const analysisDoc = await db.collection('analyses').doc(analysisId).get();
    
    if (!analysisDoc.exists) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Analysis not found'
      });
    }
    
    const analysis = analysisDoc.data();
    
    return res.status(200).json({
      success: true,
      analysis
    });
    
  } catch (error) {
    console.error('Get analysis error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve analysis'
    });
  }
});

// Function to run the actual PMD analysis on a repository
async function runAnalysis(analysisId, repoFullName, branch, githubToken) {
  const db = admin.firestore();
  
  try {
    console.log(`Starting analysis ${analysisId} for ${repoFullName}`);
    
    // Initialize GitHub client
    const octokit = new Octokit({
      auth: githubToken
    });
    
    // 1. Get repository content (we'll process top-level directories and files first)
    const [owner, repo] = repoFullName.split('/');
    
    console.log(`Fetching repository content for ${owner}/${repo}`);
    const { data: repoContent } = await octokit.repos.getContent({
      owner,
      repo,
      path: '',
      ref: branch
    });
    
    // 2. Find Java, JavaScript, Python, or TypeScript files
    const targetFiles = [];
    await findCodeFiles(octokit, owner, repo, '', repoContent, branch, targetFiles);
    
    console.log(`Found ${targetFiles.length} files to analyze`);
    
    // 3. For each file, analyze with appropriate rules based on file type
    const issues = [];
    let issueIdCounter = 1;
    
    for (const file of targetFiles) {
      try {
        const fileIssues = await analyzeFile(file.path, file.content, file.type);
        
        if (fileIssues && fileIssues.length > 0) {
          // Add file path and generate unique IDs for each issue
          fileIssues.forEach(issue => {
            issues.push({
              id: `issue-${issueIdCounter++}`,
              file: file.path,
              ...issue,
              // Add a code snippet around the issue
              codeSnippet: extractCodeSnippet(file.content, issue.line)
            });
          });
        }
      } catch (fileError) {
        console.error(`Error analyzing file ${file.path}:`, fileError);
      }
    }
    
    // 4. Update Firestore with results
    await db.collection('analyses').doc(analysisId).update({
      status: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      issueCount: issues.length,
      issues
    });
    
    console.log(`Analysis ${analysisId} completed with ${issues.length} issues`);
    
  } catch (error) {
    console.error(`Analysis failed for ${analysisId}:`, error);
    
    // Update analysis status to failed
    await db.collection('analyses').doc(analysisId).update({
      status: 'failed',
      error: error.message || 'Unknown error occurred',
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    throw error;
  }
}

// Helper function to recursively find code files in the repository
async function findCodeFiles(octokit, owner, repo, path, contents, branch, targetFiles, depth = 0) {
  // Limit recursion depth to prevent excessive API calls
  if (depth > 5) return;
  
  for (const item of contents) {
    if (item.type === 'dir') {
      // Recursively process directories, but skip node_modules, .git, etc.
      if (['node_modules', '.git', 'build', 'dist', 'target', 'bin'].includes(item.name)) {
        continue;
      }
      
      const { data: dirContent } = await octokit.repos.getContent({
        owner,
        repo,
        path: item.path,
        ref: branch
      });
      
      await findCodeFiles(octokit, owner, repo, item.path, dirContent, branch, targetFiles, depth + 1);
    } 
    else if (item.type === 'file') {
      // Check if it's a file type we want to analyze
      const fileExtension = item.name.split('.').pop().toLowerCase();
      const supportedExtensions = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'java': 'java',
        'py': 'python'
      };
      
      if (supportedExtensions[fileExtension]) {
        try {
          // Get file content
          const { data: fileData } = await octokit.repos.getContent({
            owner,
            repo,
            path: item.path,
            ref: branch
          });
          
          // Decode content (base64)
          const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
          
          targetFiles.push({
            path: item.path,
            content,
            type: supportedExtensions[fileExtension]
          });
        } catch (error) {
          console.error(`Error getting content for ${item.path}:`, error);
        }
      }
    }
  }
}

// Analyze a file using appropriate rules based on file type
async function analyzeFile(filePath, content, fileType) {
  // This is a simplified PMD-like analysis
  // In a real implementation, you'd call an actual PMD service
  const issues = [];
  
  // Define some basic rule patterns by file type
  const rules = {
    javascript: [
      {
        pattern: /console\.log\(/g,
        message: 'Avoid console.log statements in production code',
        rule: 'AvoidConsoleLog',
        ruleset: 'BestPractices',
        priority: 3 // Low priority
      },
      {
        pattern: /var\s+/g,
        message: 'Use let or const instead of var',
        rule: 'UseConstOrLet',
        ruleset: 'ModernJavaScript',
        priority: 2 // Medium priority
      },
      {
        pattern: /===\s*null/g,
        message: 'Consider optional chaining (?.) for null checks',
        rule: 'UseOptionalChaining',
        ruleset: 'ModernJavaScript',
        priority: 3 // Low priority
      }
    ],
    typescript: [
      {
        pattern: /any(?=\s*[;,):\]])/g,
        message: 'Avoid using any type, specify a more precise type',
        rule: 'NoExplicitAny',
        ruleset: 'TypeSafety',
        priority: 2 // Medium priority
      },
      {
        pattern: /console\.log\(/g,
        message: 'Avoid console.log statements in production code',
        rule: 'AvoidConsoleLog',
        ruleset: 'BestPractices',
        priority: 3 // Low priority
      },
      {
        pattern: /(?:public|private|protected)\s+([a-zA-Z0-9_]+)\s*:\s*any/g,
        message: 'Avoid using any type in class properties, specify a more precise type',
        rule: 'NoPropertyAny',
        ruleset: 'TypeSafety',
        priority: 2 // Medium priority
      }
    ],
    java: [
      {
        pattern: /System\.out\.println\(/g,
        message: 'Avoid System.out.println in production code, use a logger',
        rule: 'SystemPrintln',
        ruleset: 'JavaLogging',
        priority: 2 // Medium priority
      },
      {
        pattern: /catch\s*\(\s*Exception\s+e\s*\)/g,
        message: 'Avoid catching generic Exception, catch specific exceptions instead',
        rule: 'AvoidCatchingGenericException',
        ruleset: 'ExceptionHandling',
        priority: 1 // High priority
      }
    ],
    python: [
      {
        pattern: /print\s*\(/g,
        message: 'Consider using a logger instead of print statements',
        rule: 'UseLogger',
        ruleset: 'PythonBestPractices',
        priority: 3 // Low priority
      },
      {
        pattern: /except\s*:/g,
        message: 'Avoid bare except:, specify exception types',
        rule: 'AvoidBareExcept',
        ruleset: 'ExceptionHandling',
        priority: 1 // High priority
      }
    ]
  };
  
  // Get applicable rules for this file type
  const fileRules = rules[fileType] || [];
  
  // Split the content into lines for better error reporting
  const lines = content.split('\n');
  
  // Apply each rule to the file
  for (const rule of fileRules) {
    let match;
    let lineNumber = 0;
    
    // Check each line against the rule
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      rule.pattern.lastIndex = 0; // Reset regex state
      
      while ((match = rule.pattern.exec(line)) !== null) {
        issues.push({
          line: i + 1,
          column: match.index + 1,
          rule: rule.rule,
          ruleset: rule.ruleset,
          priority: rule.priority,
          message: rule.message
        });
      }
    }
  }
  
  return issues;
}

// Extract a code snippet around a line for context
function extractCodeSnippet(content, lineNumber) {
  const lines = content.split('\n');
  const startLine = Math.max(0, lineNumber - 3);
  const endLine = Math.min(lines.length, lineNumber + 2);
  
  let snippet = '';
  for (let i = startLine; i < endLine; i++) {
    const prefix = i === lineNumber - 1 ? '> ' : '  ';
    snippet += `${prefix}${i + 1}: ${lines[i]}\n`;
  }
  
  return snippet;
}

// Export the Express app as a Firebase function
exports.analysis = functions.https.onRequest(app); 