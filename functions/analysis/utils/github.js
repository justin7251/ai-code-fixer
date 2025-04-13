// Use dynamic import for Octokit in a way that's compatible with Firebase Functions
let Octokit;
try {
    // Try CommonJS require first
    Octokit = require('@octokit/rest').Octokit;
} catch (error) {
    // If that fails, we'll use dynamic import when needed
    console.warn('Using dynamic import for Octokit');
}

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

// Helper function to process repository contents recursively
async function processContents(octokit, owner, repo, branch, contents, basePath, allIssues, fileTypes) {
    for (const item of contents) {
        const path = basePath ? `${basePath}/${item.name}` : item.name;
        
        if (item.type === 'dir') {
            try {
                // Get contents of this directory
                const {data: dirContents} = await octokit.repos.getContent({
                    owner,
                    repo,
                    path,
                    ref: branch,
                });
                
                // Process this directory's contents
                await processContents(octokit, owner, repo, branch, dirContents, path, allIssues, fileTypes);
            } catch (dirError) {
                console.warn(`Could not process directory ${path}: ${dirError.message}`);
            }
        } else if (item.type === 'file') {
            // Check if this is a file type we want to analyze
            const extension = item.name.split('.').pop().toLowerCase();
            const fileType = fileTypes[extension];
            
            if (fileType) {
                try {
                    // Get file content
                    const {data: fileData} = await octokit.repos.getContent({
                        owner,
                        repo,
                        path,
                        ref: branch,
                    });
                    
                    // Decode content
                    const content = Buffer.from(fileData.content, 'base64').toString('utf8');
                    
                    // Analyze file content
                    const issues = analyzeFileContent(content, path, fileType);
                    
                    // Add file path to each issue
                    issues.forEach(issue => {
                        issue.file = path;
                    });
                    
                    // Add to all issues
                    allIssues.push(...issues);
                } catch (fileError) {
                    console.warn(`Could not analyze file ${path}: ${fileError.message}`);
                }
            }
        }
    }
}

// Function to analyze file content for issues
function analyzeFileContent(content, filePath, fileType) {
    // Split content into lines
    const lines = content.split('\n');
    const issues = [];
    
    // Define rules for different file types
    const rules = {
        javascript: [
            {
                pattern: /console\.log\(/g,
                severity: 'WARNING',
                rule: 'AvoidConsoleLog',
                description: 'Avoid using console.log in production code',
            },
            {
                pattern: /var\s+/g,
                severity: 'INFO',
                rule: 'UseConstLet',
                description: 'Use const or let instead of var',
            },
            {
                pattern: /\/\/\s*TODO/gi,
                severity: 'INFO',
                rule: 'TodoComment',
                description: 'TODO comment found',
            },
            {
                pattern: /if\s*\(\s*([a-zA-Z0-9_$]+)\s*==\s*([^=])/g,
                severity: 'WARNING',
                rule: 'UseStrictEquality',
                description: 'Use === instead of ==',
            },
        ],
        typescript: [
            {
                pattern: /console\.log\(/g,
                severity: 'WARNING',
                rule: 'AvoidConsoleLog',
                description: 'Avoid using console.log in production code',
            },
            {
                pattern: /any/g,
                severity: 'WARNING',
                rule: 'AvoidAny',
                description: 'Avoid using "any" type when possible',
            },
            {
                pattern: /\/\/\s*TODO/gi,
                severity: 'INFO',
                rule: 'TodoComment',
                description: 'TODO comment found',
            },
        ],
        java: [
            {
                pattern: /System\.out\.println\(/g,
                severity: 'WARNING',
                rule: 'AvoidSystemOutPrintln',
                description: 'Use a logger instead of System.out.println',
            },
            {
                pattern: /catch\s*\(\s*Exception\s+/g,
                severity: 'WARNING',
                rule: 'AvoidCatchingGenericException',
                description: 'Avoid catching generic Exception',
            },
            {
                pattern: /\/\/\s*TODO/gi,
                severity: 'INFO',
                rule: 'TodoComment',
                description: 'TODO comment found',
            },
        ],
        python: [
            {
                pattern: /print\(/g,
                severity: 'INFO',
                rule: 'AvoidPrint',
                description: 'Consider using a logger instead of print',
            },
            {
                pattern: /except\s*:/g,
                severity: 'WARNING',
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

module.exports = {
    getOctokit,
    processContents,
    analyzeFileContent,
}; 