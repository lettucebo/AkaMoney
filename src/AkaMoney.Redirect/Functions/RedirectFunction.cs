using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using AkaMoney.Services.Interfaces;

namespace AkaMoney.Redirect.Functions
{
    /// <summary>
    /// Azure Function responsible for redirecting short URLs to their target URLs.
    /// </summary>
    public class RedirectFunction
    {
        private readonly IShortUrlService _shortUrlService;
        private readonly IClickTrackingService _clickTrackingService;
        private readonly ILogger<RedirectFunction> _logger;
        private readonly string _defaultRedirectUrl;

        /// <summary>
        /// Initializes a new instance of the RedirectFunction class.
        /// </summary>
        /// <param name="shortUrlService">The service for working with short URLs.</param>
        /// <param name="clickTrackingService">The service for tracking clicks.</param>
        /// <param name="configuration">The configuration object.</param>
        /// <param name="loggerFactory">The logger factory.</param>
        public RedirectFunction(
            IShortUrlService shortUrlService,
            IClickTrackingService clickTrackingService,
            IConfiguration configuration,
            ILoggerFactory loggerFactory)
        {
            _shortUrlService = shortUrlService ?? throw new ArgumentNullException(nameof(shortUrlService));
            _clickTrackingService = clickTrackingService ?? throw new ArgumentNullException(nameof(clickTrackingService));
            _logger = loggerFactory.CreateLogger<RedirectFunction>();
            _defaultRedirectUrl = configuration["DefaultRedirectUrl"] ?? "https://www.example.com";
        }

        /// <summary>
        /// HTTP trigger function that redirects a short URL to its target URL.
        /// </summary>
        /// <param name="req">The HTTP request.</param>
        /// <param name="code">The short URL code.</param>
        /// <returns>A redirect response.</returns>
        [Function("Redirect")]
        public async Task<IActionResult> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "{code?}")] HttpRequestData req,
            string code)
        {
            _logger.LogInformation("Redirect request received for code: {Code}", code);

            if (string.IsNullOrEmpty(code))
            {
                _logger.LogInformation("No code provided, redirecting to default URL");
                return new RedirectResult(_defaultRedirectUrl);
            }

            // Convert to lowercase for lookup
            code = code.ToLower();

            try
            {
                // Get the short URL
                var shortUrl = await _shortUrlService.GetShortUrlAsync(code);
                if (shortUrl == null)
                {
                    _logger.LogInformation("Short URL not found for code {Code}, redirecting to default URL", code);
                    return new RedirectResult(_defaultRedirectUrl);
                }

                // Check if the URL has expired
                if (shortUrl.ExpirationDate.HasValue && shortUrl.ExpirationDate.Value < DateTimeOffset.UtcNow)
                {
                    _logger.LogInformation("Short URL {Code} has expired, redirecting to default URL", code);
                    return new RedirectResult(_defaultRedirectUrl);
                }                // Record the click
                string? userAgent = req.Headers.Contains("User-Agent") ? req.Headers.GetValues("User-Agent").First() : null;
                string? referer = req.Headers.Contains("Referer") ? req.Headers.GetValues("Referer").First() : null;
                string? ipAddress = req.Headers.Contains("X-Forwarded-For") ? req.Headers.GetValues("X-Forwarded-For").First() : null;

                await _clickTrackingService.RecordClickAsync(code, userAgent, referer, ipAddress);

                _logger.LogInformation("Redirecting {Code} to {TargetUrl}", code, shortUrl.TargetUrl);
                return new RedirectResult(shortUrl.TargetUrl);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing redirect for code {Code}", code);
                return new RedirectResult(_defaultRedirectUrl);
            }
        }
    }
}
