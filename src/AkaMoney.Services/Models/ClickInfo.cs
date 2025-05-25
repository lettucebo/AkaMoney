using System;

namespace AkaMoney.Services.Models
{
    /// <summary>
    /// Represents click information for a short URL.
    /// Used as a data transfer object between layers.
    /// </summary>
    public class ClickInfo
    {
        /// <summary>
        /// Gets or sets the ID of the click information.
        /// </summary>
        public string Id { get; set; }

        /// <summary>
        /// Gets or sets the short URL code associated with this click.
        /// </summary>
        public string ShortUrlCode { get; set; }

        /// <summary>
        /// Gets or sets the timestamp when the click occurred.
        /// </summary>
        public DateTimeOffset Timestamp { get; set; }

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
