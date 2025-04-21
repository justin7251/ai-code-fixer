import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { Octokit } from '@octokit/rest';
import { withApiSecurity } from '@/middleware/apiSecurity';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the user's session
    const session = await getSession({ req });
    
    if (!session?.accessToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Initialize Octokit with the user's access token
    const octokit = new Octokit({
      auth: session.accessToken,
    });

    // Get user's repositories with pagination
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
    });

    // Transform the repository data to match our Repository interface
    const transformedRepos = repos.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      url: repo.html_url,
      default_branch: repo.default_branch,
      stars: repo.stargazers_count,
      language: repo.language,
      private: repo.private,
      owner: repo.owner?.login ?? '',
      updatedAt: repo.updated_at,
    }));

    return res.status(200).json(transformedRepos);
  } catch (error: any) {
    console.error('Error fetching repositories:', error);
    
    // Handle specific GitHub API errors
    if (error.status === 401) {
      return res.status(401).json({ 
        error: 'GitHub authentication failed',
        details: 'Your GitHub token has expired or is invalid'
      });
    }
    
    if (error.status === 403) {
      return res.status(403).json({ 
        error: 'GitHub API rate limit exceeded',
        details: 'Please try again later'
      });
    }

    return res.status(500).json({ 
      error: 'Failed to fetch repositories',
      details: error.message 
    });
  }
}

export default withApiSecurity(handler); 