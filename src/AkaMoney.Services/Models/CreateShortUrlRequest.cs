using System;

namespace AkaMoney.Services.Models
{
    /// <summary>
    /// Represents a request to create a new short URL.
    /// </summary>
    public class CreateShortUrlRequest
    {
        /// <summary>
        /// Gets or sets the custom short URL code.
        /// If null or empty, a random code will be generated.
        /// </summary>
        public string CustomCode { get; set; }

        /// <summary>
        /// Gets or sets the target URL that the short URL will redirect to.
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
        /// Gets or sets the expiration date for the short URL.
        /// If null, the URL does not expire.
        /// </summary>
        public DateTimeOffset? ExpirationDate { get; set; }
    }
}
