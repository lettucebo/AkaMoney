using System.Threading.Tasks;
using AkaMoney.Services.Models;

namespace AkaMoney.Services.Interfaces
{
    /// <summary>
    /// Interface for operations related to click tracking.
    /// </summary>
    public interface IClickTrackingService
    {
        /// <summary>
        /// Records a click for a short URL.
        /// </summary>
        /// <param name="shortUrlCode">The short URL code.</param>
        /// <param name="userAgent">The user agent string.</param>
        /// <param name="referrer">The referrer URL.</param>
        /// <param name="ipAddress">The IP address.</param>
        /// <returns>The recorded click information.</returns>
        Task<ClickInfo> RecordClickAsync(string shortUrlCode, string userAgent, string referrer, string ipAddress);

        /// <summary>
        /// Gets all clicks for a short URL.
        /// </summary>
        /// <param name="shortUrlCode">The short URL code.</param>
        /// <returns>A collection of click information for the short URL.</returns>
        Task<System.Collections.Generic.IEnumerable<ClickInfo>> GetClicksForShortUrlAsync(string shortUrlCode);

        /// <summary>
        /// Gets the click count for a short URL.
        /// </summary>
        /// <param name="shortUrlCode">The short URL code.</param>
        /// <returns>The number of clicks for the short URL.</returns>
        Task<int> GetClickCountAsync(string shortUrlCode);
    }
}
