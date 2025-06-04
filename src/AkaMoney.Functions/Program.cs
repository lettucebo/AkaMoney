using AkaMoney.Services.Interfaces;
using AkaMoney.Services.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Identity.Web;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

// Azure Entra ID (former Azure AD) authentication
// 強制啟用 Entra ID JWT 驗證，移除匿名模式
builder.Services.AddMicrosoftIdentityWebApiAuthentication(builder.Configuration);

// Add custom services
builder.Services
    .AddScoped<IShortUrlService, ShortUrlService>()
    .AddScoped<IClickTrackingService, ClickTrackingService>();

// Add Logging and Application Insights
builder.Services
    .AddApplicationInsightsTelemetryWorkerService()
    .ConfigureFunctionsApplicationInsights();

// Add OpenAPI support
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSingleton<Microsoft.Azure.WebJobs.Extensions.OpenApi.Core.Abstractions.IOpenApiConfigurationOptions>(_ => {
    return new Microsoft.Azure.WebJobs.Extensions.OpenApi.Core.Configurations.OpenApiConfigurationOptions
    {
        Info = new Microsoft.OpenApi.Models.OpenApiInfo
        {
            Title = "AkaMoney API",
            Version = "1.0.0",
            Description = "API for AkaMoney short URL service",
            Contact = new Microsoft.OpenApi.Models.OpenApiContact
            {
                Name = "AkaMoney Support",
                Email = "support@akamoney.example.com"
            }
        }
    };
});

var app = builder.Build();
app.Run();
