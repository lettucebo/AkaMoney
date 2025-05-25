using System;
using System.Collections.Generic;
using System.Net;
using System.Threading.Tasks;
using AkaMoney.Services.Interfaces;
using AkaMoney.Services.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Azure.WebJobs.Extensions.OpenApi.Core.Attributes;
using Microsoft.Extensions.Logging;
using Microsoft.OpenApi.Models;

namespace AkaMoney.Functions.Functions
{
    /// <summary>
    /// API endpoints for tracking and analyzing clicks on short URLs.
    /// </summary>
    public class ClickTrackingFunctions
    {
        private readonly IClickTrackingService _clickTrackingService;
        private readonly IShortUrlService _shortUrlService;
        private readonly ILogger<ClickTrackingFunctions> _logger;

        /// <summary>
        /// Initializes a new instance of the ClickTrackingFunctions class.
        /// </summary>
        /// <param name="clickTrackingService">The service for tracking clicks.</param>
        /// <param name="shortUrlService">The service for working with short URLs.</param>
        /// <param name="loggerFactory">The logger factory.</param>
        public ClickTrackingFunctions(
            IClickTrackingService clickTrackingService,
            IShortUrlService shortUrlService,
            ILoggerFactory loggerFactory)
        {
            _clickTrackingService = clickTrackingService ?? throw new ArgumentNullException(nameof(clickTrackingService));
            _shortUrlService = shortUrlService ?? throw new ArgumentNullException(nameof(shortUrlService));
            _logger = loggerFactory.CreateLogger<ClickTrackingFunctions>();
        }

        /// <summary>
        /// Gets all clicks for a specific short URL.
        /// </summary>
        /// <param name="req">The HTTP request.</param>
        /// <param name="code">The short URL code.</param>
        /// <returns>An HTTP response containing the click information.</returns>
        [Function("GetClicksForShortUrl")]
        [OpenApiOperation(operationId: "GetClicksForShortUrl", tags: new[] { "ClickTracking" })]
        [OpenApiParameter(name: "code", In = ParameterLocation.Path, Required = true, Type = typeof(string), Description = "The short URL code.")]
        [OpenApiResponseWithBody(statusCode: HttpStatusCode.OK, contentType: "application/json", bodyType: typeof(IEnumerable<ClickInfo>), Description = "The click information.")]
        [OpenApiResponseWithoutBody(statusCode: HttpStatusCode.NotFound, Description = "Short URL not found.")]
        public async Task<IActionResult> GetClicksForShortUrl(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "clicks/{code}")] HttpRequestData req,
            string code)
        {
            _logger.LogInformation("Getting clicks for short URL with code: {Code}", code);

            try
            {
                // Verify the short URL exists
                var shortUrl = await _shortUrlService.GetShortUrlAsync(code);
                if (shortUrl == null)
                {
                    return new NotFoundResult();
                }

                // Get the clicks
                var clicks = await _clickTrackingService.GetClicksForShortUrlAsync(code);
                return new OkObjectResult(clicks);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting clicks for short URL with code: {Code}", code);
                return new StatusCodeResult(StatusCodes.Status500InternalServerError);
            }
        }

        /// <summary>
        /// Gets the click count for a specific short URL.
        /// </summary>
        /// <param name="req">The HTTP request.</param>
        /// <param name="code">The short URL code.</param>
        /// <returns>An HTTP response containing the click count.</returns>
        [Function("GetClickCountForShortUrl")]
        [OpenApiOperation(operationId: "GetClickCountForShortUrl", tags: new[] { "ClickTracking" })]
        [OpenApiParameter(name: "code", In = ParameterLocation.Path, Required = true, Type = typeof(string), Description = "The short URL code.")]
        [OpenApiResponseWithBody(statusCode: HttpStatusCode.OK, contentType: "application/json", bodyType: typeof(int), Description = "The click count.")]
        [OpenApiResponseWithoutBody(statusCode: HttpStatusCode.NotFound, Description = "Short URL not found.")]
        public async Task<IActionResult> GetClickCountForShortUrl(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "clicks/{code}/count")] HttpRequestData req,
            string code)
        {
            _logger.LogInformation("Getting click count for short URL with code: {Code}", code);

            try
            {
                // Verify the short URL exists
                var shortUrl = await _shortUrlService.GetShortUrlAsync(code);
                if (shortUrl == null)
                {
                    return new NotFoundResult();
                }

                // Get the click count
                int count = await _clickTrackingService.GetClickCountAsync(code);
                return new OkObjectResult(count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting click count for short URL with code: {Code}", code);
                return new StatusCodeResult(StatusCodes.Status500InternalServerError);
            }
        }

        /// <summary>
        /// Gets summary statistics for all short URLs.
        /// </summary>
        /// <param name="req">The HTTP request.</param>
        /// <returns>An HTTP response containing the statistics.</returns>
        [Function("GetClickStatistics")]
        [OpenApiOperation(operationId: "GetClickStatistics", tags: new[] { "ClickTracking" })]
        [OpenApiResponseWithBody(statusCode: HttpStatusCode.OK, contentType: "application/json", bodyType: typeof(Dictionary<string, int>), Description = "The click statistics.")]
        public async Task<IActionResult> GetClickStatistics(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "clicks/statistics")] HttpRequestData req)
        {
            _logger.LogInformation("Getting click statistics for all URLs");

            try
            {
                // Get all short URLs
                var shortUrls = await _shortUrlService.GetAllShortUrlsAsync();
                
                // Create a dictionary to hold the results
                var statistics = new Dictionary<string, int>();
                
                // Get the click count for each URL
                foreach (var url in shortUrls)
                {
                    int count = await _clickTrackingService.GetClickCountAsync(url.Code);
                    statistics.Add(url.Code, count);
                }
                
                return new OkObjectResult(statistics);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting click statistics");
                return new StatusCodeResult(StatusCodes.Status500InternalServerError);
            }
        }
    }
}
