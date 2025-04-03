const admin = require('../../firebase-admin');
const {v4: uuidv4} = require('uuid');
const { getOctokit } = require('../utils/github');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class AiFixService {
    constructor() {
        this.db = admin.firestore();
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'ai-development-key');
    }
    
    async startFix(analysisId, user, options = {}) {
        const { issues, createPullRequest } = options;
        
        if (!analysisId) {
            throw new Error('Analysis ID is required');
        }
        
        // Get the analysis details
        const analysisDoc = await this.db.collection('analyses').doc(analysisId).get();
        
        if (!analysisDoc.exists) {
            throw new Error('Analysis not found');
        }
        
        const analysis = analysisDoc.data();
        
        // Verify analysis is completed
        if (analysis.status !== 'completed') {
            throw new Error(`Analysis is in '${analysis.status}' state. Only completed analyses can be fixed.`);
        }
        
        // Determine which issues to fix
        const issuesToFix = issues || analysis.issues;
        if (!issuesToFix || issuesToFix.length === 0) {
            throw new Error('No issues found to fix');
        }
        
        // Create a fix record
        const fixId = uuidv4();
        const fixData = {
            id: fixId,
            analysisId,
            repoId: analysis.repoId,
            repoFullName: analysis.repoFullName,
            branch: analysis.branch,
            userId: user?.githubId || 'anonymous',
            status: 'pending',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            issuesToFix: issuesToFix,
            fixedIssues: [],
            createPullRequest: !!createPullRequest
        };
        
        // Save the fix record
        await this.db.collection('fixes').doc(fixId).set(fixData);
        
        // Start the fix process asynchronously
        this.runAiFix(fixId, analysis, user.githubToken, issuesToFix, !!createPullRequest)
          .catch(err => console.error(`AI fix error for ${fixId}:`, err));
        
        // Return immediate response
        return {
          success: true,
          message: 'AI auto fix started',
          fix: {
            ...fixData,
            status: 'running'
          }
        };
    }
    
    async getFixStatus(fixId) {
        const fixDoc = await this.db.collection('fixes').doc(fixId).get();
        
        if (!fixDoc.exists) {
            throw new Error('Fix record not found');
        }
        
        return {
            success: true,
            fix: fixDoc.data()
        };
    }
    
    // Function to run the AI fix process
    async runAiFix(fixId, analysis, githubToken, issuesToFix, createPullRequest) {
        try {
            console.log(`Starting AI fix ${fixId} for ${analysis.repoFullName}`);
            
            // Update status to running
            await this.db.collection('fixes').doc(fixId).update({
                status: 'running'
            });
            
            // Initialize Octokit with the token
            const octokit = await getOctokit(githubToken);
            
            // Parse repo owner and name
            const [owner, repo] = analysis.repoFullName.split('/');
            
            // Track fixed issues
            const fixedIssues = [];
            
            // Process each issue category
            for (const issueCategory of issuesToFix) {
                // Get example issues with files to fix
                const examples = issueCategory.examples || [];
                
                for (const example of examples) {
                    try {
                        // Get file content from GitHub
                        const { data: fileData } = await octokit.repos.getContent({
                            owner,
                            repo,
                            path: example.file,
                            ref: analysis.branch
                        });
                        
                        // Decode content from base64
                        const content = Buffer.from(fileData.content, 'base64').toString('utf8');
                        
                        // Generate AI fix
                        const fixedContent = await this.generateGeminiFix(
                            content, 
                            example.file,
                            issueCategory.rule,
                            issueCategory.description,
                            example.snippet
                        );
                        
                        if (fixedContent && fixedContent !== content) {
                            // Content was modified, apply the fix
                            if (createPullRequest) {
                                // If creating a PR, commit the changes
                                const branchName = `ai-fix-${fixId.substring(0, 8)}`;
                                
                                // Check if branch exists, create if not
                                try {
                                    await octokit.git.getRef({
                                        owner,
                                        repo,
                                        ref: `heads/${branchName}`
                                    });
                                } catch (e) {
                                    // Branch doesn't exist, create it from the current branch
                                    const { data: refData } = await octokit.git.getRef({
                                        owner,
                                        repo,
                                        ref: `heads/${analysis.branch}`
                                    });
                                    
                                    await octokit.git.createRef({
                                        owner,
                                        repo,
                                        ref: `refs/heads/${branchName}`,
                                        sha: refData.object.sha
                                    });
                                }
                                
                                // Commit the file change
                                await octokit.repos.createOrUpdateFileContents({
                                    owner,
                                    repo,
                                    path: example.file,
                                    message: `Fix ${issueCategory.rule}: ${issueCategory.description}`,
                                    content: Buffer.from(fixedContent).toString('base64'),
                                    branch: branchName,
                                    sha: fileData.sha
                                });
                                
                                // Record successful fix
                                fixedIssues.push({
                                    rule: issueCategory.rule,
                                    file: example.file,
                                    line: example.line,
                                    committed: true,
                                    branch: branchName
                                });
                            } else {
                                // Just record the fix suggestion
                                fixedIssues.push({
                                    rule: issueCategory.rule,
                                    file: example.file,
                                    line: example.line,
                                    originalContent: content,
                                    fixedContent: fixedContent,
                                    committed: false
                                });
                            }
                        }
                    } catch (fileError) {
                        console.error(`Error fixing file ${example.file}:`, fileError);
                    }
                }
            }
            
            // If creating a PR and we have fixes, create the PR
            if (createPullRequest && fixedIssues.some(issue => issue.committed)) {
                // Get the branch name from the first committed fix
                const branchName = fixedIssues.find(issue => issue.committed).branch;
                
                // Create a PR
                const { data: pullRequest } = await octokit.pulls.create({
                    owner,
                    repo,
                    title: `AI Auto Fix: Code improvements`,
                    body: `This PR contains AI-generated fixes for the following issues:
${fixedIssues.map(issue => `- ${issue.rule} in ${issue.file}`).join('\n')}

Please review the changes carefully before merging.`,
                    head: branchName,
                    base: analysis.branch
                });
                
                // Update fix record with PR info
                await this.db.collection('fixes').doc(fixId).update({
                    pullRequestUrl: pullRequest.html_url,
                    pullRequestNumber: pullRequest.number
                });
            }
            
            // Update fix status
            await this.db.collection('fixes').doc(fixId).update({
                status: 'completed',
                fixedIssues,
                completedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`AI fix ${fixId} completed with ${fixedIssues.length} fixes`);
            
        } catch (error) {
            console.error(`AI fix failed for ${fixId}:`, error);
            
            // Update fix status to failed
            try {
                await this.db.collection('fixes').doc(fixId).update({
                    status: 'failed',
                    error: error.message || 'Unknown error occurred',
                    completedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (updateError) {
                console.error('Failed to update fix status:', updateError);
            }
            
            throw error;
        }
    }
    
    // Generate AI fix for code using Gemini
    async generateGeminiFix(content, filePath, rule, description, snippet) {
        try {
            // Extract file extension for language detection
            const extension = filePath.split('.').pop().toLowerCase();
            let language = 'javascript'; // Default
            
            // Map extensions to languages
            const languageMap = {
                js: 'javascript',
                jsx: 'javascript',
                ts: 'typescript',
                tsx: 'typescript',
                py: 'python',
                java: 'java',
                rb: 'ruby',
                go: 'go',
                php: 'php',
                cs: 'csharp',
                html: 'html',
                css: 'css'
            };
            
            language = languageMap[extension] || language;
            
            // Get Gemini model
            const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
            
            // Prepare the prompt for Gemini
            const prompt = `You are an expert ${language} developer helping fix code issues.

ISSUE: ${rule} - ${description}

This issue was found in file: ${filePath}

Code with issue:
\`\`\`
${snippet}
\`\`\`

Full file content:
\`\`\`${language}
${content}
\`\`\`

Please provide the entire fixed file content. Keep your edits minimal and focused only on fixing the specific issue. Don't add comments unless they are essential for understanding the fix.`;

            // Call Gemini API
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            
            // Extract code from the response (it may be wrapped in markdown code blocks)
            let fixedCode = text;
            const codeBlockRegex = /```(?:\w*\n)?([\s\S]+?)```/;
            const match = text.match(codeBlockRegex);
            
            if (match && match[1]) {
                fixedCode = match[1].trim();
            }
            
            return fixedCode;
        } catch (error) {
            console.error('Error generating Gemini fix:', error);
            throw error;
        }
    }
}

module.exports = AiFixService; 