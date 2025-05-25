using System;

namespace AkaMoney.Services.Models
{
    /// <summary>
    /// Represents a short URL with its associated data.
    /// Used as a data transfer object between layers.
    /// </summary>
    public class ShortUrl
    {
        /// <summary>
        /// Gets or sets the short URL code.
        /// </summary>
        public string Code { get; set; }

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
    }
}
