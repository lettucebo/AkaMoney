using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
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
    /// Implementation of IShortUrlService that uses Azure Table Storage.
    /// </summary>
    public class ShortUrlService : IShortUrlService
    {
        private readonly TableClient _shortUrlTable;
        private const string TableName = "shorturls";

        /// <summary>
        /// Initializes a new instance of the ShortUrlService class.
        /// </summary>
        /// <param name="configuration">The configuration object.</param>
        public ShortUrlService(IConfiguration configuration)
        {
            string? connectionString = configuration["TableStorageConnection"];

            if (!string.IsNullOrEmpty(connectionString))
            {
                // Local development or explicit connection string
                _shortUrlTable = new TableClient(connectionString, TableName);
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
                _shortUrlTable = new TableClient(endpoint, TableName, new DefaultAzureCredential());
            }
            _shortUrlTable.CreateIfNotExists();
        }

        /// <summary>
        /// Creates a new short URL.
        /// </summary>
        /// <param name="request">The short URL creation request.</param>
        /// <returns>The created short URL.</returns>
        public async Task<ShortUrl> CreateShortUrlAsync(CreateShortUrlRequest request)
        {
            // Validate the request
            if (string.IsNullOrEmpty(request.TargetUrl))
            {
                throw new ArgumentException("Target URL is required.");
            }

            // Generate a code if one is not provided
            string code = request.CustomCode;
            if (string.IsNullOrEmpty(code))
            {
                code = await GenerateRandomCodeAsync();
            }
            else
            {
                // Check if the code is already in use
                bool isAvailable = await IsCodeAvailableAsync(code);
                if (!isAvailable)
                {
                    throw new InvalidOperationException($"Short URL code '{code}' is already in use.");
                }
            }

            // Create the entity
            var entity = new ShortUrlEntity(code)
            {
                TargetUrl = request.TargetUrl,
                Title = request.Title,
                Description = request.Description,
                ImageUrl = request.ImageUrl,
                ExpirationDate = request.ExpirationDate,
                IsArchived = false,
                ClickCount = 0
            };

            // Save the entity
            await _shortUrlTable.AddEntityAsync(entity);

            // Return the created short URL
            return MapEntityToModel(entity);
        }

        /// <summary>
        /// Gets a short URL by its code.
        /// </summary>
        /// <param name="code">The short URL code.</param>
        /// <returns>The short URL if found, null otherwise.</returns>
        public async Task<ShortUrl> GetShortUrlAsync(string code)
        {
            if (string.IsNullOrEmpty(code))
            {
                throw new ArgumentException("Code cannot be null or empty.", nameof(code));
            }

            // Convert code to lowercase for consistent lookups
            code = code.ToLower();

            try
            {
                // Get the entity from the table
                var entity = await _shortUrlTable.GetEntityAsync<ShortUrlEntity>("ShortUrl", code);
                
                // Check if the URL has expired
                if (entity.Value.ExpirationDate.HasValue && entity.Value.ExpirationDate.Value < DateTimeOffset.UtcNow)
                {
                    return null;
                }

                // Check if the URL is archived
                if (entity.Value.IsArchived)
                {
                    return null;
                }

                return MapEntityToModel(entity.Value);
            }
            catch (RequestFailedException ex) when (ex.Status == 404)
            {
                // Entity not found
                return null;
            }
        }

        /// <summary>
        /// Gets all short URLs.
        /// </summary>
        /// <param name="includeArchived">Whether to include archived short URLs.</param>
        /// <returns>A collection of short URLs.</returns>
        public async Task<IEnumerable<ShortUrl>> GetAllShortUrlsAsync(bool includeArchived = false)
        {
            // Create a query to get all entities in the partition
            string filter = "PartitionKey eq 'ShortUrl'";
            if (!includeArchived)
            {
                filter += " and IsArchived eq false";
            }

            var entities = _shortUrlTable.QueryAsync<ShortUrlEntity>(filter);
            
            var results = new List<ShortUrl>();
            await foreach (var entity in entities)
            {
                results.Add(MapEntityToModel(entity));
            }

            return results;
        }

        /// <summary>
        /// Updates an existing short URL.
        /// </summary>
        /// <param name="code">The short URL code to update.</param>
        /// <param name="request">The update request.</param>
        /// <returns>The updated short URL.</returns>
        public async Task<ShortUrl> UpdateShortUrlAsync(string code, UpdateShortUrlRequest request)
        {
            if (string.IsNullOrEmpty(code))
            {
                throw new ArgumentException("Code cannot be null or empty.", nameof(code));
            }

            // Convert code to lowercase for consistent lookups
            code = code.ToLower();

            try
            {
                // Get the entity from the table
                var response = await _shortUrlTable.GetEntityAsync<ShortUrlEntity>("ShortUrl", code);
                var entity = response.Value;

                // Update the entity
                entity.TargetUrl = request.TargetUrl ?? entity.TargetUrl;
                entity.Title = request.Title ?? entity.Title;
                entity.Description = request.Description ?? entity.Description;
                entity.ImageUrl = request.ImageUrl ?? entity.ImageUrl;
                entity.ExpirationDate = request.ExpirationDate ?? entity.ExpirationDate;
                entity.IsArchived = request.IsArchived;

                // Update the entity in the table
                await _shortUrlTable.UpdateEntityAsync(entity, entity.ETag);

                return MapEntityToModel(entity);
            }
            catch (RequestFailedException ex) when (ex.Status == 404)
            {
                throw new KeyNotFoundException($"Short URL with code '{code}' not found.");
            }
        }

        /// <summary>
        /// Archives a short URL.
        /// </summary>
        /// <param name="code">The short URL code to archive.</param>
        /// <returns>True if successful, false otherwise.</returns>
        public async Task<bool> ArchiveShortUrlAsync(string code)
        {
            if (string.IsNullOrEmpty(code))
            {
                throw new ArgumentException("Code cannot be null or empty.", nameof(code));
            }

            // Convert code to lowercase for consistent lookups
            code = code.ToLower();

            try
            {
                // Get the entity from the table
                var response = await _shortUrlTable.GetEntityAsync<ShortUrlEntity>("ShortUrl", code);
                var entity = response.Value;

                // Archive the entity
                entity.IsArchived = true;

                // Update the entity in the table
                await _shortUrlTable.UpdateEntityAsync(entity, entity.ETag);

                return true;
            }
            catch (RequestFailedException ex) when (ex.Status == 404)
            {
                return false;
            }
        }

        /// <summary>
        /// Checks if a short URL code is available.
        /// </summary>
        /// <param name="code">The code to check.</param>
        /// <returns>True if the code is available, false otherwise.</returns>
        public async Task<bool> IsCodeAvailableAsync(string code)
        {
            if (string.IsNullOrEmpty(code))
            {
                throw new ArgumentException("Code cannot be null or empty.", nameof(code));
            }

            // Convert code to lowercase for consistent lookups
            code = code.ToLower();

            try
            {
                // Try to get the entity from the table
                await _shortUrlTable.GetEntityAsync<ShortUrlEntity>("ShortUrl", code);
                
                // If we get here, the entity exists
                return false;
            }
            catch (RequestFailedException ex) when (ex.Status == 404)
            {
                // Entity not found, so code is available
                return true;
            }
        }

        /// <summary>
        /// Generates a random short URL code.
        /// </summary>
        /// <param name="length">The length of the code. Defaults to 6.</param>
        /// <returns>A randomly generated code that is available for use.</returns>
        public async Task<string> GenerateRandomCodeAsync(int length = 6)
        {
            if (length <= 0)
            {
                throw new ArgumentException("Length must be positive.", nameof(length));
            }

            const string chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            
            // Try to generate a unique code up to 10 times
            for (int attempt = 0; attempt < 10; attempt++)
            {
                // Generate a random code
                var code = new StringBuilder(length);
                using (var rng = RandomNumberGenerator.Create())
                {
                    byte[] data = new byte[length];
                    rng.GetBytes(data);
                    
                    for (int i = 0; i < length; i++)
                    {
                        code.Append(chars[data[i] % chars.Length]);
                    }
                }

                // Check if the code is available
                string generatedCode = code.ToString().ToLower();
                if (await IsCodeAvailableAsync(generatedCode))
                {
                    return generatedCode;
                }
            }

            // If we couldn't generate a unique code after 10 attempts, throw an exception
            throw new InvalidOperationException("Failed to generate a unique code.");
        }

        /// <summary>
        /// Maps a ShortUrlEntity to a ShortUrl model.
        /// </summary>
        /// <param name="entity">The entity to map.</param>
        /// <returns>The mapped model.</returns>
        private static ShortUrl MapEntityToModel(ShortUrlEntity entity)
        {
            return new ShortUrl
            {
                Code = entity.RowKey,
                TargetUrl = entity.TargetUrl,
                Title = entity.Title,
                Description = entity.Description,
                ImageUrl = entity.ImageUrl,
                CreatedAt = entity.CreatedAt,
                ExpirationDate = entity.ExpirationDate,
                IsArchived = entity.IsArchived,
                ClickCount = entity.ClickCount
            };
        }
    }
}
