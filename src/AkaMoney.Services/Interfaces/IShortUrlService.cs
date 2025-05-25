using System.Collections.Generic;
using System.Threading.Tasks;
using AkaMoney.Services.Models;

namespace AkaMoney.Services.Interfaces
{
    /// <summary>
    /// Interface for operations related to short URLs.
    /// </summary>
    public interface IShortUrlService
    {
        /// <summary>
        /// Creates a new short URL.
        /// </summary>
        /// <param name="request">The short URL creation request.</param>
        /// <returns>The created short URL.</returns>
        Task<ShortUrl> CreateShortUrlAsync(CreateShortUrlRequest request);

        /// <summary>
        /// Gets a short URL by its code.
        /// </summary>
        /// <param name="code">The short URL code.</param>
        /// <returns>The short URL if found, null otherwise.</returns>
        Task<ShortUrl> GetShortUrlAsync(string code);

        /// <summary>
        /// Gets all short URLs.
        /// </summary>
        /// <param name="includeArchived">Whether to include archived short URLs.</param>
        /// <returns>A collection of short URLs.</returns>
        Task<IEnumerable<ShortUrl>> GetAllShortUrlsAsync(bool includeArchived = false);

        /// <summary>
        /// Updates an existing short URL.
        /// </summary>
        /// <param name="code">The short URL code to update.</param>
        /// <param name="request">The update request.</param>
        /// <returns>The updated short URL.</returns>
        Task<ShortUrl> UpdateShortUrlAsync(string code, UpdateShortUrlRequest request);

        /// <summary>
        /// Archives a short URL.
        /// </summary>
        /// <param name="code">The short URL code to archive.</param>
        /// <returns>True if successful, false otherwise.</returns>
        Task<bool> ArchiveShortUrlAsync(string code);

        /// <summary>
        /// Checks if a short URL code is available.
        /// </summary>
        /// <param name="code">The code to check.</param>
        /// <returns>True if the code is available, false otherwise.</returns>
        Task<bool> IsCodeAvailableAsync(string code);

        /// <summary>
        /// Generates a random short URL code.
        /// </summary>
        /// <param name="length">The length of the code. Defaults to 6.</param>
        /// <returns>A randomly generated code that is available for use.</returns>
        Task<string> GenerateRandomCodeAsync(int length = 6);
    }
}
