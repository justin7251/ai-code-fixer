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

  async getToken(userId: string) {
    const response = await fetch('/api/proxy/api/auth/token', {
      method: 'POST',
      headers: await this.getHeaders(),
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to get token');
    }

    return response.json();
  }

  async getRepositories(token: string) {
    const response = await fetch('/api/proxy/api/repositories', {
      method: 'GET',
      headers: {
        ...(await this.getHeaders()),
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to get repositories');
    }

    const data = await response.json();
    console.log('Repository data received:', data);
    
    // Check the shape of data and ensure we return an array
    if (data.repositories && Array.isArray(data.repositories)) {
      return data.repositories;
    } else if (Array.isArray(data)) {
      return data;
    } else {
      console.warn('Unexpected data format received from API:', data);
      // Return empty array as fallback
      return [];
    }
  }
} 