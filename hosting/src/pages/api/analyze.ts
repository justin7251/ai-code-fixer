import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { Octokit } from '@octokit/rest';
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}')),
  });
}

interface AnalysisResult {
  id: string;
  repoId: number;
  repoName: string;
  repoFullName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp: Date;
  issues: {
    file: string;
    line: number;
    type: 'error' | 'warning' | 'info';
    message: string;
    suggestion: string;
  }[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; analysisId?: string; error?: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Get the user's session
    const session = await getSession({ req });
    
    if (!session?.accessToken) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { repoId, repoName, repoFullName } = req.body;

    if (!repoId || !repoName || !repoFullName) {
      return res.status(400).json({ success: false, error: 'Missing repository information' });
    }

    // Create a new analysis entry in Firebase
    const db = admin.firestore();
    const analysisRef = await db.collection('analyses').add({
      repoId,
      repoName,
      repoFullName,
      status: 'pending',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      issues: [],
    });

    // Start the analysis process (this will run asynchronously)
    startAnalysis(analysisRef.id, repoId, repoName, repoFullName, session.accessToken);

    return res.status(200).json({ 
      success: true, 
      analysisId: analysisRef.id 
    });
  } catch (error: any) {
    console.error('Error starting analysis:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}

async function startAnalysis(
  analysisId: string,
  repoId: number,
  repoName: string,
  repoFullName: string,
  accessToken: string
) {
  const db = admin.firestore();
  const analysisRef = db.collection('analyses').doc(analysisId);

  try {
    // Update status to running
    await analysisRef.update({ status: 'running' });

    const octokit = new Octokit({ auth: accessToken });
    const issues: AnalysisResult['issues'] = [];

    // Get repository contents
    const { data: contents } = await octokit.repos.getContent({
      owner: repoFullName.split('/')[0],
      repo: repoName,
      path: '',
    });

    // Process each file in the repository
    if (Array.isArray(contents)) {
      for (const item of contents) {
        if (item.type === 'file') {
          const { data: fileContent } = await octokit.repos.getContent({
            owner: repoFullName.split('/')[0],
            repo: repoName,
            path: item.path,
          });

          if ('content' in fileContent) {
            const content = Buffer.from(fileContent.content, 'base64').toString('utf-8');
            const lines = content.split('\n');

            // Analyze each line
            lines.forEach((line, index) => {
              // Check for console.log statements
              if (line.includes('console.log(')) {
                issues.push({
                  file: item.path,
                  line: index + 1,
                  type: 'warning',
                  message: 'Console.log statement found in production code',
                  suggestion: 'Remove console.log statements or use a proper logging system',
                });
              }

              // Check for TODO comments
              if (line.includes('TODO')) {
                issues.push({
                  file: item.path,
                  line: index + 1,
                  type: 'info',
                  message: 'TODO comment found',
                  suggestion: 'Address the TODO comment or create an issue to track it',
                });
              }

              // Check for hardcoded credentials
              if (line.match(/(password|secret|key|token)\s*=\s*['"][^'"]+['"]/i)) {
                issues.push({
                  file: item.path,
                  line: index + 1,
                  type: 'error',
                  message: 'Potential hardcoded credential found',
                  suggestion: 'Use environment variables or a secure configuration system',
                });
              }

              // Check for long lines
              if (line.length > 100) {
                issues.push({
                  file: item.path,
                  line: index + 1,
                  type: 'warning',
                  message: 'Line exceeds 100 characters',
                  suggestion: 'Break the line into multiple lines for better readability',
                });
              }
            });
          }
        }
      }
    }

    // Update the analysis with results
    await analysisRef.update({
      status: 'completed',
      issues,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('Analysis error:', error);
    await analysisRef.update({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
} 