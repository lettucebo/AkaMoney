using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using AkaMoney.Services.Interfaces;
using AkaMoney.Services.Models;
using Azure;
using Azure.Data.Tables;
using Azure.Identity;
using Microsoft.Extensions.Configuration;
using System;

namespace AkaMoney.Services.Services
{
    /// <summary>
    /// Implementation of IClickTrackingService that uses Azure Table Storage.
    /// </summary>
    public class ClickTrackingService : IClickTrackingService
    {
        private readonly TableClient _clickInfoTable;
        private readonly TableClient _shortUrlTable;
        private const string ClickInfoTableName = "clickinfo";
        private const string ShortUrlTableName = "shorturls";        /// <summary>
        /// Initializes a new instance of the ClickTrackingService class.
        /// </summary>
        /// <param name="configuration">The configuration object.</param>
        public ClickTrackingService(IConfiguration configuration)
        {
            if (configuration == null)
            {
                throw new ArgumentNullException(nameof(configuration));
            }

            string? connectionString = configuration["TableStorageConnection"];

            if (!string.IsNullOrEmpty(connectionString))
            {
                // Local development or explicit connection string
                _clickInfoTable = new TableClient(connectionString, ClickInfoTableName);
                _shortUrlTable = new TableClient(connectionString, ShortUrlTableName);
            }
            else
            {
                // Use Managed Identity (DefaultAzureCredential) in production
                string accountName = configuration["AzureWebJobsStorage__accountName"];
                if (string.IsNullOrEmpty(accountName))
                {
                    throw new InvalidOperationException("AzureWebJobsStorage__accountName setting is missing for Managed Identity Table authentication.");
                }
                var endpoint = new Uri($"https://{accountName}.table.core.windows.net");
                _clickInfoTable = new TableClient(endpoint, ClickInfoTableName, new DefaultAzureCredential());
                _shortUrlTable = new TableClient(endpoint, ShortUrlTableName, new DefaultAzureCredential());
            }

            // Create the tables if they don't exist
            _clickInfoTable.CreateIfNotExists();
            _shortUrlTable.CreateIfNotExists();
        }

        /// <summary>
        /// Records a click for a short URL.
        /// </summary>
        /// <param name="shortUrlCode">The short URL code.</param>
        /// <param name="userAgent">The user agent string.</param>
        /// <param name="referrer">The referrer URL.</param>
        /// <param name="ipAddress">The IP address.</param>
        /// <returns>The recorded click information.</returns>
        public async Task<ClickInfo> RecordClickAsync(string shortUrlCode, string? userAgent, string? referrer, string? ipAddress)
        {
            if (string.IsNullOrEmpty(shortUrlCode))
            {
                throw new ArgumentException("Short URL code cannot be null or empty.", nameof(shortUrlCode));
            }

            // Convert code to lowercase for consistent lookups
            shortUrlCode = shortUrlCode.ToLower();

            try
            {
                // Create a new click info entity
                var entity = new ClickInfoEntity(shortUrlCode)
                {
                    UserAgent = userAgent ?? string.Empty,
                    Referrer = referrer ?? string.Empty,
                    IPAddress = ipAddress ?? string.Empty
                };

                // Add the entity to the table
                await _clickInfoTable.AddEntityAsync(entity);

                // Update the click count in the short URL entity
                await IncrementClickCountAsync(shortUrlCode);

                // Return the recorded click info
                return MapEntityToModel(entity);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to record click for short URL '{shortUrlCode}'.", ex);
            }
        }

        /// <summary>
        /// Gets all clicks for a short URL.
        /// </summary>
        /// <param name="shortUrlCode">The short URL code.</param>
        /// <returns>A collection of click information for the short URL.</returns>
        public async Task<IEnumerable<ClickInfo>> GetClicksForShortUrlAsync(string shortUrlCode)
        {
            if (string.IsNullOrEmpty(shortUrlCode))
            {
                throw new ArgumentException("Short URL code cannot be null or empty.", nameof(shortUrlCode));
            }

            // Convert code to lowercase for consistent lookups
            shortUrlCode = shortUrlCode.ToLower();

            // Create a query to get all entities for this short URL
            string filter = $"PartitionKey eq '{shortUrlCode}'";
            var entities = _clickInfoTable.QueryAsync<ClickInfoEntity>(filter);

            var results = new List<ClickInfo>();
            await foreach (var entity in entities)
            {
                results.Add(MapEntityToModel(entity));
            }

            return results;
        }

        /// <summary>
        /// Gets the click count for a short URL.
        /// </summary>
        /// <param name="shortUrlCode">The short URL code.</param>
        /// <returns>The number of clicks for the short URL.</returns>
        public async Task<int> GetClickCountAsync(string shortUrlCode)
        {
            if (string.IsNullOrEmpty(shortUrlCode))
            {
                throw new ArgumentException("Short URL code cannot be null or empty.", nameof(shortUrlCode));
            }

            // Convert code to lowercase for consistent lookups
            shortUrlCode = shortUrlCode.ToLower();

            try
            {
                // Get the short URL entity
                var entity = await _shortUrlTable.GetEntityAsync<ShortUrlEntity>("ShortUrl", shortUrlCode);
                return entity.Value.ClickCount;
            }
            catch (RequestFailedException ex) when (ex.Status == 404)
            {
                // Entity not found
                return 0;
            }
        }

        /// <summary>
        /// Increments the click count for a short URL.
        /// </summary>
        /// <param name="shortUrlCode">The short URL code.</param>
        /// <returns>A Task representing the asynchronous operation.</returns>
        private async Task IncrementClickCountAsync(string shortUrlCode)
        {
            try
            {
                // Get the short URL entity
                var response = await _shortUrlTable.GetEntityAsync<ShortUrlEntity>("ShortUrl", shortUrlCode);
                var entity = response.Value;

                // Increment the click count
                entity.ClickCount++;

                // Update the entity
                await _shortUrlTable.UpdateEntityAsync(entity, entity.ETag);
            }
            catch (RequestFailedException ex) when (ex.Status == 404)
            {
                // Entity not found, nothing to increment
            }
        }

        /// <summary>
        /// Maps a ClickInfoEntity to a ClickInfo model.
        /// </summary>
        /// <param name="entity">The entity to map.</param>
        /// <returns>The mapped model.</returns>
        private static ClickInfo MapEntityToModel(ClickInfoEntity entity)
        {
            return new ClickInfo
            {
                Id = entity.RowKey,
                ShortUrlCode = entity.PartitionKey,
                Timestamp = entity.Timestamp ?? DateTimeOffset.UtcNow,
                UserAgent = entity.UserAgent,
                Referrer = entity.Referrer,
                IPAddress = entity.IPAddress
            };
        }
    }
}
