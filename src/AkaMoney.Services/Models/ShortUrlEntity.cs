using System;
using Azure;
using Azure.Data.Tables;

namespace AkaMoney.Services.Models
{
    /// <summary>
    /// Represents a short URL entity stored in Azure Table Storage.
    /// </summary>
    public class ShortUrlEntity : ITableEntity
    {
        /// <summary>
        /// Default constructor for Azure Table Storage deserialization.
        /// </summary>
        public ShortUrlEntity() 
        {
            PartitionKey = "ShortUrl";
        }

        /// <summary>
        /// Constructor with short URL code.
        /// </summary>
        /// <param name="shortUrlCode">The short URL code that will be used as the RowKey.</param>
        public ShortUrlEntity(string shortUrlCode) 
        {
            PartitionKey = "ShortUrl";
            RowKey = shortUrlCode;
            CreatedAt = DateTimeOffset.UtcNow;
        }

        /// <summary>
        /// Gets or sets the partition key for the entity.
        /// For short URLs, this is always "ShortUrl".
        /// </summary>
        public string PartitionKey { get; set; }

        /// <summary>
        /// Gets or sets the row key for the entity.
        /// For short URLs, this is the short URL code.
        /// </summary>
        public string RowKey { get; set; }

        /// <summary>
        /// Gets or sets the target URL that the short URL redirects to.
        /// </summary>
        public string TargetUrl { get; set; }

        /// <summary>
        /// Gets or sets an optional title for the short URL.
        /// Used for social media sharing.
        /// </summary>
        public string Title { get; set; }

        /// <summary>
        /// Gets or sets an optional description for the short URL.
        /// Used for social media sharing.
        /// </summary>
        public string Description { get; set; }

        /// <summary>
        /// Gets or sets an optional image URL for the short URL.
        /// Used for social media sharing.
        /// </summary>
        public string ImageUrl { get; set; }

        /// <summary>
        /// Gets or sets the timestamp when the entity was created.
        /// </summary>
        public DateTimeOffset CreatedAt { get; set; }

        /// <summary>
        /// Gets or sets the expiration date for the short URL.
        /// If null, the URL does not expire.
        /// </summary>
        public DateTimeOffset? ExpirationDate { get; set; }

        /// <summary>
        /// Gets or sets a value indicating whether the short URL is archived.
        /// </summary>
        public bool IsArchived { get; set; }

        /// <summary>
        /// Gets or sets the click count for the short URL.
        /// </summary>
        public int ClickCount { get; set; }

        /// <summary>
        /// Gets or sets the timestamp for Azure Table Storage.
        /// </summary>
        public DateTimeOffset? Timestamp { get; set; }

        /// <summary>
        /// Gets or sets the ETag for Azure Table Storage.
        /// </summary>
        public ETag ETag { get; set; }
    }
}
