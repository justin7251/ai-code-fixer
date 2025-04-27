import { Session } from 'next-auth';

interface ApiClientOptions {
  session: Session | null;
}

export class ApiClient {
  private session: Session | null;

  constructor({ session }: ApiClientOptions) {
    this.session = session;
  }

  private async getHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    return headers;
  }

  async getToken(userId: string | undefined) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    const response = await fetch('/api/proxy/api/auth/token', {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ userId }),
    });

    // Get the response data even if status is not OK
    const data = await response.json().catch(() => ({}));
    
    console.log('Token data received:', data ? 'Data exists' : 'No data');
    
    // Return the response data regardless of status code
    return data;
  }

  async getRepositories(token: string | undefined) {
    if (!token) {
      throw new Error('Access token is required');
    }
    
    const response = await fetch('/api/proxy/api/repositories', {
      method: 'GET',
      headers: {
        ...(await this.getHeaders()),
        'Authorization': `Bearer ${token}`,
      },
    });

    // Get the response data even if status is not OK
    const data = await response.json().catch(() => ({}));
    
    console.log('Repository data received:', data);
    
    // Check the shape of data and ensure we return an array
    if (data.repositories && Array.isArray(data.repositories)) {
      return data.repositories;
    } else if (Array.isArray(data)) {
      return data;
    } else if (data.success === false) {
      // If there's an error, return the data object
      return data;
    } else {
      console.warn('Unexpected data format received from API:', data);
      // Return empty array as fallback
      return [];
    }
  }

  async getRepository(token: string | undefined, repoId: string | string[] | undefined) {
    if (!token) {
      throw new Error('Access token is required');
    }
    
    if (!repoId) {
      throw new Error('Repository ID is required');
    }
    
    // Handle string arrays by using the first element
    const id = Array.isArray(repoId) ? repoId[0] : repoId;
    
    const response = await fetch(`/api/proxy/api/repositories/${id}`, {
      method: 'GET',
      headers: {
        ...(await this.getHeaders()),
        'Authorization': `Bearer ${token}`,
      },
    });

    // Get the response data even if status is not OK
    const data = await response.json().catch(() => ({}));
    
    console.log('Repository detail data received:', data);
    
    // Return the response data regardless of status code
    return data;
  }

  async getRepositoryAnalysis(token: string | undefined, repoId: string | string[] | undefined, options = {}) {
    if (!token) {
      throw new Error('Access token is required');
    }
    
    if (!repoId) {
      throw new Error('Repository ID is required');
    }
    
    // Handle string arrays by using the first element
    const id = Array.isArray(repoId) ? repoId[0] : repoId;
    
    console.log('Getting repository analysis with options:', options);
    
    const response = await fetch(`/api/proxy/api/analysis/${id}`, {
      method: 'POST',
      headers: {
        ...(await this.getHeaders()),
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(options)
    });

    // Get the response data even if status is not OK
    const data = await response.json().catch(() => ({ 
      success: false, 
      message: 'Failed to parse response as JSON'
    }));
    
    console.log('Repository analysis data received:', data);
    
    // Return the response data regardless of status code
    return data;
  }

  async refreshRepositoryAnalysis(token: string | undefined, repoId: string | string[] | undefined, options = {}) {
    if (!token) {
      throw new Error('Access token is required');
    }
    
    if (!repoId) {
      throw new Error('Repository ID is required');
    }
    
    // Handle string arrays by using the first element
    const id = Array.isArray(repoId) ? repoId[0] : repoId;
    
    console.log('Refreshing repository analysis with options:', options);
    
    // Use the correct endpoint for analysis refresh
    const response = await fetch(`/api/proxy/api/analysis/${id}/refresh`, {
      method: 'POST',
      headers: {
        ...(await this.getHeaders()),
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(options)
    });

    // Get the response data even if status is not OK
    const data = await response.json().catch(() => ({ 
      success: false, 
      message: 'Failed to parse response as JSON'
    }));
    
    console.log('Repository analysis refresh data received:', data);
    
    // Return the response data regardless of status code
    return data;
  }

  async analyzeRepository(token: string | undefined, repoId: string | string[] | undefined) {
    if (!token) {
      throw new Error('Access token is required');
    }
    
    if (!repoId) {
      throw new Error('Repository ID is required');
    }
    
    // Handle string arrays by using the first element
    const id = Array.isArray(repoId) ? repoId[0] : repoId;
    
    console.log('Analyzing repository:', id);
    
    const response = await fetch(`/api/github/repositories/${id}/analyze`, {
      method: 'POST',
      headers: {
        ...(await this.getHeaders()),
        'Authorization': `Bearer ${token}`,
      }
    });

    // Get the response data even if status is not OK
    const data = await response.json().catch(() => ({ 
      success: false, 
      message: 'Failed to parse response as JSON'
    }));
    
    console.log('Repository analyze data received:', data);
    
    // Return the response data regardless of status code
    return data;
  }
} 