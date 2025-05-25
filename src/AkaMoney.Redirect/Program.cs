using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using AkaMoney.Services.Interfaces;
using AkaMoney.Services.Services;
using Microsoft.Extensions.Configuration;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

builder.Services
    .AddApplicationInsightsTelemetryWorkerService()
    .ConfigureFunctionsApplicationInsights();

// Register services
builder.Services.AddSingleton<IShortUrlService, ShortUrlService>();
builder.Services.AddSingleton<IClickTrackingService, ClickTrackingService>();

builder.Build().Run();
