import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchD1Analytics } from '../cloudflare-analytics';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Cloudflare GraphQL Analytics Service', () => {
  const mockAccountId = 'test-account-id';
  const mockDatabaseId = 'test-database-id';
  const mockApiToken = 'test-api-token';

  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch D1 analytics successfully', async () => {
    const mockResponse = {
      data: {
        viewer: {
          accounts: [
            {
              d1AnalyticsAdaptiveGroups: [
                {
                  sum: {
                    readQueries: 1500,
                    writeQueries: 500
                  }
                }
              ]
            }
          ]
        }
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const result = await fetchD1Analytics(mockAccountId, mockDatabaseId, mockApiToken);

    expect(result).toEqual({
      readQueries: 1500,
      writeQueries: 500
    });

    // Verify fetch was called with correct parameters
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mockApiToken}`
        })
      })
    );
  });

  it('should return zeros when no analytics data is available', async () => {
    const mockResponse = {
      data: {
        viewer: {
          accounts: [
            {
              d1AnalyticsAdaptiveGroups: []
            }
          ]
        }
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const result = await fetchD1Analytics(mockAccountId, mockDatabaseId, mockApiToken);

    expect(result).toEqual({
      readQueries: 0,
      writeQueries: 0
    });
  });

  it('should sum multiple analytics groups', async () => {
    const mockResponse = {
      data: {
        viewer: {
          accounts: [
            {
              d1AnalyticsAdaptiveGroups: [
                {
                  sum: {
                    readQueries: 1000,
                    writeQueries: 300
                  }
                },
                {
                  sum: {
                    readQueries: 500,
                    writeQueries: 200
                  }
                }
              ]
            }
          ]
        }
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const result = await fetchD1Analytics(mockAccountId, mockDatabaseId, mockApiToken);

    expect(result).toEqual({
      readQueries: 1500,
      writeQueries: 500
    });
  });

  it('should handle GraphQL errors', async () => {
    const mockResponse = {
      errors: [
        { message: 'Authentication failed' }
      ]
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    await expect(
      fetchD1Analytics(mockAccountId, mockDatabaseId, mockApiToken)
    ).rejects.toThrow('GraphQL errors: Authentication failed');
  });

  it('should handle HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401
    });

    await expect(
      fetchD1Analytics(mockAccountId, mockDatabaseId, mockApiToken)
    ).rejects.toThrow('Cloudflare API responded with status 401');
  });

  it('should handle missing account data', async () => {
    const mockResponse = {
      data: {
        viewer: {
          accounts: []
        }
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    await expect(
      fetchD1Analytics(mockAccountId, mockDatabaseId, mockApiToken)
    ).rejects.toThrow('No account data found in response');
  });

  it('should use current date by default', async () => {
    const mockResponse = {
      data: {
        viewer: {
          accounts: [
            {
              d1AnalyticsAdaptiveGroups: [
                {
                  sum: {
                    readQueries: 100,
                    writeQueries: 50
                  }
                }
              ]
            }
          ]
        }
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    await fetchD1Analytics(mockAccountId, mockDatabaseId, mockApiToken);

    // Verify that the query includes today's date range
    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    
    expect(body.query).toContain('datetime_geq');
    expect(body.query).toContain('datetime_leq');
  });

  it('should use custom date when provided', async () => {
    const mockResponse = {
      data: {
        viewer: {
          accounts: [
            {
              d1AnalyticsAdaptiveGroups: [
                {
                  sum: {
                    readQueries: 200,
                    writeQueries: 100
                  }
                }
              ]
            }
          ]
        }
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    });

    const customDate = new Date('2024-01-15');
    const result = await fetchD1Analytics(mockAccountId, mockDatabaseId, mockApiToken, customDate);

    expect(result).toEqual({
      readQueries: 200,
      writeQueries: 100
    });

    // Verify the query contains the custom date
    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);
    
    expect(body.query).toContain('2024-01-15');
  });
});
