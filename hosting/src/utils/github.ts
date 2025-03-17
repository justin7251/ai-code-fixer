import { Octokit } from '@octokit/rest';

export interface Repository {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  updatedAt: string | null;
  language: string | null;
  stars: number;
  forks: number;
}

export interface Branch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
  protection?: {
    enabled: boolean;
    required_status_checks: {
      enforcement_level: string;
      contexts: string[];
    };
  };
}

export interface CommitAuthor {
  name: string;
  email: string;
  date: string;
}

export interface Commit {
  sha: string;
  message: string;
  author: CommitAuthor | null;
  committer: CommitAuthor | null;
  html_url: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  } | null;
  base: {
    ref: string;
  };
  head: {
    ref: string;
  };
}

export interface IssueLabel {
  name: string;
  color: string;
}

export interface Issue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  } | null;
  labels: IssueLabel[];
}

export async function getRepositories(accessToken: string): Promise<Repository[]> {
  const octokit = new Octokit({
    auth: accessToken,
  });

  const { data: repos } = await octokit.repos.listForAuthenticatedUser({
    sort: 'updated',
    per_page: 100,
  });

  return repos.map(repo => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description,
    private: repo.private,
    htmlUrl: repo.html_url,
    defaultBranch: repo.default_branch,
    updatedAt: repo.updated_at,
    language: repo.language,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
  }));
}

export async function getBranches(
  accessToken: string,
  owner: string,
  repo: string
): Promise<Branch[]> {
  const octokit = new Octokit({
    auth: accessToken,
  });

  const { data: branches } = await octokit.repos.listBranches({
    owner,
    repo,
  });

  return branches.map(branch => ({
    name: branch.name,
    commit: branch.commit,
    protected: branch.protected,
    protection: branch.protection ? {
      enabled: branch.protection.enabled ?? false,
      required_status_checks: {
        enforcement_level: branch.protection.required_status_checks?.enforcement_level ?? 'off',
        contexts: branch.protection.required_status_checks?.contexts ?? [],
      },
    } : undefined,
  }));
}

export async function getCommits(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  since?: string
): Promise<Commit[]> {
  const octokit = new Octokit({
    auth: accessToken,
  });

  const { data: commits } = await octokit.repos.listCommits({
    owner,
    repo,
    sha: branch,
    since,
    per_page: 100,
  });

  return commits.map(commit => ({
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.commit.author ? {
      name: commit.commit.author.name ?? '',
      email: commit.commit.author.email ?? '',
      date: commit.commit.author.date ?? '',
    } : null,
    committer: commit.commit.committer ? {
      name: commit.commit.committer.name ?? '',
      email: commit.commit.committer.email ?? '',
      date: commit.commit.committer.date ?? '',
    } : null,
    html_url: commit.html_url,
  }));
}

export async function getPullRequests(
  accessToken: string,
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'open'
): Promise<PullRequest[]> {
  const octokit = new Octokit({
    auth: accessToken,
  });

  const { data: pulls } = await octokit.pulls.list({
    owner,
    repo,
    state,
    per_page: 100,
  });

  return pulls.map(pull => ({
    number: pull.number,
    title: pull.title,
    state: pull.state,
    html_url: pull.html_url,
    created_at: pull.created_at,
    updated_at: pull.updated_at,
    user: pull.user ? {
      login: pull.user.login,
      avatar_url: pull.user.avatar_url,
    } : null,
    base: pull.base,
    head: pull.head,
  }));
}

export async function getIssues(
  accessToken: string,
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'open'
): Promise<Issue[]> {
  const octokit = new Octokit({
    auth: accessToken,
  });

  const { data: issues } = await octokit.issues.listForRepo({
    owner,
    repo,
    state,
    per_page: 100,
  });

  return issues.map(issue => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    html_url: issue.html_url,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    user: issue.user ? {
      login: issue.user.login,
      avatar_url: issue.user.avatar_url,
    } : null,
    labels: issue.labels.map(label => ({
      name: typeof label === 'string' ? label : label.name ?? '',
      color: typeof label === 'string' ? '#000000' : label.color ?? '#000000',
    })),
  }));
}

export async function getRepositoryContent(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<string> {
  const octokit = new Octokit({
    auth: accessToken,
  });

  const { data } = await octokit.repos.getContent({
    owner,
    repo,
    path,
    ref,
  });

  if ('content' in data) {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }

  throw new Error('Content not found');
}

export async function getRepositoryLanguages(
  accessToken: string,
  owner: string,
  repo: string
): Promise<Record<string, number>> {
  const octokit = new Octokit({
    auth: accessToken,
  });

  const { data } = await octokit.repos.listLanguages({
    owner,
    repo,
  });

  return data;
} 