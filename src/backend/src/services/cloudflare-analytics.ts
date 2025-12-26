/**
 * Cloudflare GraphQL Analytics Service
 * 
 * This service fetches real D1 database usage metrics from Cloudflare's GraphQL Analytics API.
 * It retrieves actual readQueries and writeQueries counts for the current day.
 */

export interface CloudflareD1Analytics {
  readQueries: number;
  writeQueries: number;
}

export interface CloudflareGraphQLResponse {
  data?: {
    viewer?: {
      accounts?: Array<{
        d1AnalyticsAdaptiveGroups?: Array<{
          sum?: {
            readQueries?: number;
            writeQueries?: number;
          };
        }>;
      }>;
    };
  };
  errors?: Array<{
    message: string;
  }>;
}

/**
 * Fetch D1 analytics from Cloudflare GraphQL API
 * 
 * @param accountId - Cloudflare account ID
 * @param databaseId - D1 database ID
 * @param apiToken - Cloudflare API token with Analytics:Read permission
 * @param date - Optional date for which to fetch analytics (defaults to today UTC)
 * @returns D1 analytics data with read and write query counts
 */
export async function fetchD1Analytics(
  accountId: string,
  databaseId: string,
  apiToken: string,
  date?: Date
): Promise<CloudflareD1Analytics> {
  // Use provided date or default to today (UTC)
  const targetDate = date || new Date();
  
  // Set time range for the entire day (00:00:00 to 23:59:59 UTC)
  const startDate = new Date(targetDate);
  startDate.setUTCHours(0, 0, 0, 0);
  
  const endDate = new Date(targetDate);
  endDate.setUTCHours(23, 59, 59, 999);
  
  // Format dates to ISO 8601 format (Cloudflare GraphQL expects this format)
  const startDateStr = startDate.toISOString();
  const endDateStr = endDate.toISOString();
  
  // Use GraphQL variables to prevent injection attacks
  const query = `
    query GetD1Analytics($accountId: String!, $databaseId: String!, $startDate: String!, $endDate: String!) {
      viewer {
        accounts(filter: {accountTag: $accountId}) {
          d1AnalyticsAdaptiveGroups(
            filter: {
              databaseId: $databaseId
              datetime_geq: $startDate
              datetime_leq: $endDate
            }
            limit: 10
          ) {
            sum {
              readQueries
              writeQueries
            }
          }
        }
      }
    }
  `;

  const variables = {
    accountId,
    databaseId,
    startDate: startDateStr,
    endDate: endDateStr
  };

  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`Cloudflare API responded with status ${response.status}`);
    }

    const result: CloudflareGraphQLResponse = await response.json();

    // Check for GraphQL errors
    if (result.errors && result.errors.length > 0) {
      const errorMessages = result.errors.map(e => e.message).join(', ');
      throw new Error(`GraphQL errors: ${errorMessages}`);
    }

    // Extract analytics data from nested response structure
    const accounts = result.data?.viewer?.accounts;
    if (!accounts || accounts.length === 0) {
      throw new Error('No account data found in response');
    }

    const analyticsGroups = accounts[0].d1AnalyticsAdaptiveGroups;
    if (!analyticsGroups || analyticsGroups.length === 0) {
      // No data available for this period - return zeros
      return {
        readQueries: 0,
        writeQueries: 0
      };
    }

    // Sum up all analytics groups (there should typically be one)
    const totals = analyticsGroups.reduce(
      (acc, group) => ({
        readQueries: acc.readQueries + (group.sum?.readQueries || 0),
        writeQueries: acc.writeQueries + (group.sum?.writeQueries || 0)
      }),
      { readQueries: 0, writeQueries: 0 }
    );

    return totals;
  } catch (error) {
    console.error('Failed to fetch D1 analytics from Cloudflare:', error);
    throw error;
  }
}
