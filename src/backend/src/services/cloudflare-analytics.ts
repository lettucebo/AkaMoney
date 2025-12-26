/**
 * Cloudflare GraphQL Analytics Service
 * 
 * This service fetches real D1 database usage metrics from Cloudflare's GraphQL Analytics API.
 * It retrieves actual readQueries and writeQueries counts for a specified date range.
 * Defaults to the current month if no date range is provided.
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
 * @param startDate - Optional start date for analytics period (defaults to first day of current month UTC)
 * @param endDate - Optional end date for analytics period (defaults to first day of next month UTC)
 * @returns D1 analytics data with read and write query counts
 */
export async function fetchD1Analytics(
  accountId: string,
  databaseId: string,
  apiToken: string,
  startDate?: Date,
  endDate?: Date
): Promise<CloudflareD1Analytics> {
  // Default to current month if no dates provided
  // Note: Either both dates are provided or neither (validated by caller)
  let queryStartDate: Date;
  let queryEndDate: Date;
  
  if (!startDate || !endDate) {
    // Get first day of current month
    const now = new Date();
    queryStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    
    // Get first day of next month
    queryEndDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  } else {
    // Use provided dates, ensure they're set to start of day
    queryStartDate = new Date(startDate);
    queryStartDate.setUTCHours(0, 0, 0, 0);
    
    // For end date, add 1 day to make it exclusive (date_lt semantics)
    queryEndDate = new Date(endDate);
    queryEndDate.setUTCDate(queryEndDate.getUTCDate() + 1);
    queryEndDate.setUTCHours(0, 0, 0, 0);
  }
  
  // Format dates to YYYY-MM-DD format (Cloudflare GraphQL expects this format for date_geq/date_lt)
  const startDateStr = queryStartDate.toISOString().split('T')[0];
  const endDateStr = queryEndDate.toISOString().split('T')[0];
  
  // Use GraphQL variables to prevent injection attacks
  const query = `
    query GetD1Analytics($accountId: String!, $databaseId: String!, $startDate: String!, $endDate: String!) {
      viewer {
        accounts(filter: {accountTag: $accountId}) {
          d1AnalyticsAdaptiveGroups(
            filter: {
              databaseId: $databaseId
              date_geq: $startDate
              date_lt: $endDate
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
