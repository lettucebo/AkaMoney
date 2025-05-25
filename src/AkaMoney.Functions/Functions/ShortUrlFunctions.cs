using System;
using System.IO;
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
using Newtonsoft.Json;

namespace AkaMoney.Functions.Functions
{
    /// <summary>
    /// API endpoints for managing short URLs.
    /// </summary>
    public class ShortUrlFunctions
    {
        private readonly IShortUrlService _shortUrlService;
        private readonly ILogger<ShortUrlFunctions> _logger;

        /// <summary>
        /// Initializes a new instance of the ShortUrlFunctions class.
        /// </summary>
        /// <param name="shortUrlService">The service for working with short URLs.</param>
        /// <param name="loggerFactory">The logger factory.</param>
        public ShortUrlFunctions(
            IShortUrlService shortUrlService,
            ILoggerFactory loggerFactory)
        {
            _shortUrlService = shortUrlService ?? throw new ArgumentNullException(nameof(shortUrlService));
            _logger = loggerFactory.CreateLogger<ShortUrlFunctions>();
        }

        /// <summary>
        /// Creates a new short URL.
        /// </summary>
        /// <param name="req">The HTTP request containing the short URL creation details.</param>
        /// <returns>An HTTP response containing the created short URL.</returns>
        [Function("CreateShortUrl")]
        [OpenApiOperation(operationId: "CreateShortUrl", tags: new[] { "ShortUrl" })]
        [OpenApiRequestBody("application/json", typeof(CreateShortUrlRequest), Description = "The short URL creation request.")]
        [OpenApiResponseWithBody(statusCode: HttpStatusCode.OK, contentType: "application/json", bodyType: typeof(ShortUrl), Description = "The created short URL.")]
        [OpenApiResponseWithoutBody(statusCode: HttpStatusCode.BadRequest, Description = "Invalid request.")]
        public async Task<IActionResult> CreateShortUrl(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "shorturl")] HttpRequestData req)
        {
            _logger.LogInformation("Creating a new short URL");

            try
            {
                // Parse the request body
                string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
                var request = JsonConvert.DeserializeObject<CreateShortUrlRequest>(requestBody);

                if (request == null || string.IsNullOrEmpty(request.TargetUrl))
                {
                    return new BadRequestObjectResult("Target URL is required.");
                }

                // Check if a custom code was provided and if it's available
                if (!string.IsNullOrEmpty(request.CustomCode))
                {
                    bool isAvailable = await _shortUrlService.IsCodeAvailableAsync(request.CustomCode);
                    if (!isAvailable)
                    {
                        return new BadRequestObjectResult($"The code '{request.CustomCode}' is already in use.");
                    }
                }

                // Create the short URL
                var shortUrl = await _shortUrlService.CreateShortUrlAsync(request);
                return new OkObjectResult(shortUrl);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating short URL");
                return new StatusCodeResult(StatusCodes.Status500InternalServerError);
            }
        }

        /// <summary>
        /// Gets all short URLs.
        /// </summary>
        /// <param name="req">The HTTP request.</param>
        /// <param name="includeArchived">Whether to include archived short URLs.</param>
        /// <returns>An HTTP response containing all short URLs.</returns>
        [Function("GetAllShortUrls")]
        [OpenApiOperation(operationId: "GetAllShortUrls", tags: new[] { "ShortUrl" })]
        [OpenApiParameter(name: "includeArchived", In = ParameterLocation.Query, Required = false, Type = typeof(bool), Description = "Whether to include archived short URLs.")]
        [OpenApiResponseWithBody(statusCode: HttpStatusCode.OK, contentType: "application/json", bodyType: typeof(ShortUrl[]), Description = "All short URLs.")]
        public async Task<IActionResult> GetAllShortUrls(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "shorturl")] HttpRequestData req,
            [FromQuery] bool includeArchived = false)
        {
            _logger.LogInformation("Getting all short URLs");

            try
            {
                var shortUrls = await _shortUrlService.GetAllShortUrlsAsync(includeArchived);
                return new OkObjectResult(shortUrls);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting all short URLs");
                return new StatusCodeResult(StatusCodes.Status500InternalServerError);
            }
        }

        /// <summary>
        /// Gets a short URL by its code.
        /// </summary>
        /// <param name="req">The HTTP request.</param>
        /// <param name="code">The short URL code.</param>
        /// <returns>An HTTP response containing the short URL.</returns>
        [Function("GetShortUrl")]
        [OpenApiOperation(operationId: "GetShortUrl", tags: new[] { "ShortUrl" })]
        [OpenApiParameter(name: "code", In = ParameterLocation.Path, Required = true, Type = typeof(string), Description = "The short URL code.")]
        [OpenApiResponseWithBody(statusCode: HttpStatusCode.OK, contentType: "application/json", bodyType: typeof(ShortUrl), Description = "The short URL.")]
        [OpenApiResponseWithoutBody(statusCode: HttpStatusCode.NotFound, Description = "Short URL not found.")]
        public async Task<IActionResult> GetShortUrl(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "shorturl/{code}")] HttpRequestData req,
            string code)
        {
            _logger.LogInformation("Getting short URL with code: {Code}", code);

            try
            {
                var shortUrl = await _shortUrlService.GetShortUrlAsync(code);
                if (shortUrl == null)
                {
                    return new NotFoundResult();
                }

                return new OkObjectResult(shortUrl);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting short URL with code: {Code}", code);
                return new StatusCodeResult(StatusCodes.Status500InternalServerError);
            }
        }

        /// <summary>
        /// Updates a short URL.
        /// </summary>
        /// <param name="req">The HTTP request containing the short URL update details.</param>
        /// <param name="code">The short URL code to update.</param>
        /// <returns>An HTTP response containing the updated short URL.</returns>
        [Function("UpdateShortUrl")]
        [OpenApiOperation(operationId: "UpdateShortUrl", tags: new[] { "ShortUrl" })]
        [OpenApiParameter(name: "code", In = ParameterLocation.Path, Required = true, Type = typeof(string), Description = "The short URL code to update.")]
        [OpenApiRequestBody("application/json", typeof(UpdateShortUrlRequest), Description = "The short URL update request.")]
        [OpenApiResponseWithBody(statusCode: HttpStatusCode.OK, contentType: "application/json", bodyType: typeof(ShortUrl), Description = "The updated short URL.")]
        [OpenApiResponseWithoutBody(statusCode: HttpStatusCode.NotFound, Description = "Short URL not found.")]
        [OpenApiResponseWithoutBody(statusCode: HttpStatusCode.BadRequest, Description = "Invalid request.")]
        public async Task<IActionResult> UpdateShortUrl(
            [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "shorturl/{code}")] HttpRequestData req,
            string code)
        {
            _logger.LogInformation("Updating short URL with code: {Code}", code);

            try
            {
                // Parse the request body
                string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
                var request = JsonConvert.DeserializeObject<UpdateShortUrlRequest>(requestBody);

                if (request == null)
                {
                    return new BadRequestObjectResult("Request body is required.");
                }

                // Update the short URL
                try
                {
                    var shortUrl = await _shortUrlService.UpdateShortUrlAsync(code, request);
                    return new OkObjectResult(shortUrl);
                }
                catch (KeyNotFoundException)
                {
                    return new NotFoundResult();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating short URL with code: {Code}", code);
                return new StatusCodeResult(StatusCodes.Status500InternalServerError);
            }
        }

        /// <summary>
        /// Archives a short URL.
        /// </summary>
        /// <param name="req">The HTTP request.</param>
        /// <param name="code">The short URL code to archive.</param>
        /// <returns>An HTTP response indicating success or failure.</returns>
        [Function("ArchiveShortUrl")]
        [OpenApiOperation(operationId: "ArchiveShortUrl", tags: new[] { "ShortUrl" })]
        [OpenApiParameter(name: "code", In = ParameterLocation.Path, Required = true, Type = typeof(string), Description = "The short URL code to archive.")]
        [OpenApiResponseWithoutBody(statusCode: HttpStatusCode.NoContent, Description = "Short URL archived successfully.")]
        [OpenApiResponseWithoutBody(statusCode: HttpStatusCode.NotFound, Description = "Short URL not found.")]
        public async Task<IActionResult> ArchiveShortUrl(
            [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "shorturl/{code}")] HttpRequestData req,
            string code)
        {
            _logger.LogInformation("Archiving short URL with code: {Code}", code);

            try
            {
                bool success = await _shortUrlService.ArchiveShortUrlAsync(code);
                if (!success)
                {
                    return new NotFoundResult();
                }

                return new NoContentResult();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error archiving short URL with code: {Code}", code);
                return new StatusCodeResult(StatusCodes.Status500InternalServerError);
            }
        }
    }
}
