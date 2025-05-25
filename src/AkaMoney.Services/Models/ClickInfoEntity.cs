using System;
using Azure;
using Azure.Data.Tables;

namespace AkaMoney.Services.Models
{
    /// <summary>
    /// Represents a click information entity stored in Azure Table Storage.
    /// </summary>
    public class ClickInfoEntity : ITableEntity
    {
        /// <summary>
        /// Default constructor for Azure Table Storage deserialization.
        /// </summary>
        public ClickInfoEntity() { }

        /// <summary>
        /// Constructor with short URL code.
        /// </summary>
        /// <param name="shortUrlCode">The short URL code that will be used as the PartitionKey.</param>
        public ClickInfoEntity(string shortUrlCode)
        {
            PartitionKey = shortUrlCode;
            // Generate a unique row key based on timestamp and a random string
            RowKey = $"{DateTimeOffset.UtcNow.Ticks}-{Guid.NewGuid().ToString().Substring(0, 8)}";
            Timestamp = DateTimeOffset.UtcNow;
        }

        /// <summary>
        /// Gets or sets the partition key for the entity.
        /// For click info, this is the short URL code.
        /// </summary>
        public string PartitionKey { get; set; }

        /// <summary>
        /// Gets or sets the row key for the entity.
        /// For click info, this is a unique identifier based on timestamp and a random string.
        /// </summary>
        public string RowKey { get; set; }

        /// <summary>
        /// Gets or sets the timestamp for Azure Table Storage.
        /// </summary>
        public DateTimeOffset? Timestamp { get; set; }

        /// <summary>
        /// Gets or sets the ETag for Azure Table Storage.
        /// </summary>
        public ETag ETag { get; set; }

        /// <summary>
        /// Gets or sets the user agent string of the client that clicked the short URL.
        /// </summary>
        public string UserAgent { get; set; }

        /// <summary>
        /// Gets or sets the referrer URL that led to the short URL click.
        /// </summary>
        public string Referrer { get; set; }

        /// <summary>
        /// Gets or sets the IP address of the client that clicked the short URL.
        /// </summary>
        public string IPAddress { get; set; }
    }
}
