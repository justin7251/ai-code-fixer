const admin = require('../../firebase-admin');
const {v4: uuidv4} = require('uuid');
const { getOctokit, processContents, analyzeFileContent } = require('../utils/github');

class AnalysisService {
    constructor() {
        this.db = admin.firestore();
    }
    
    async refreshAnalysis(repoId, user, options = {}) {
        const { branch, repoName, repoFullName } = options;
        
        if (!repoId) {
            throw new Error('Repository ID required');
        }
    
        // Get repository details
        try {
            // First try to get the repo from Firestore
            let repoData = null;
            
            console.log(`Looking for repository with ID: ${repoId}`);
            
            // Try to get repo from Firestore
            try {
                const repoDoc = await this.db.collection('repositories')
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
                    await this.db.collection('repositories').doc(repoId.toString()).set(repoData);
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
                throw new Error('Repository not found. Please provide repoName and repoFullName in the request body.');
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
                userId: user?.githubId || "anonymous",
                status: 'running', // Set to running immediately to avoid duplicate starts
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                issues: [],
                issueCount: 0,
            };
      
            // Save the analysis record
            await this.db.collection('analyses').doc(analysisId).set(analysisData);
            
            // Start analysis in background (don't await)
            this.runAnalysis(analysisId, repoData.fullName, branchToUse, user.githubToken)
                .catch(err => console.error(`Analysis error for ${analysisId}:`, err));
            
            // Return the initial response to client
            return {
                success: true,
                message: 'Analysis started successfully',
                analysis: analysisData,
            };
            
        } catch (error) {
            console.error('Error processing repository:', error);
            throw error;
        }
    }
    
    // Function to run the actual analysis on a repository
    async runAnalysis(analysisId, repoFullName, branch, githubToken) {
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
            await this.db.collection('analyses').doc(analysisId).update({
                status: 'completed',
                issues: aggregatedIssues,
                issueCount: allIssues.length,
                fileCount: Object.keys(allIssues.reduce((acc, issue) => {
                    acc[issue.file] = true;
                    return acc;
                }, {})).length,
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            console.log(`Analysis ${analysisId} completed successfully with ${allIssues.length} issues found`);
        
        } catch (error) {
            console.error(`Analysis failed for ${analysisId}:`, error);
        
            // Update analysis status to failed
            try {
                await this.db.collection('analyses').doc(analysisId).update({
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
}

module.exports = AnalysisService; 