using DocumentScanner.Application.Applications;
using DocumentScanner.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(Submit).Assembly));

builder.Services.AddSingleton<IIdempotencyStore, InMemoryIdempotencyStore>();
builder.Services.AddScoped<IApplicationRepository, ConsoleApplicationRepository>();
builder.Services.AddControllers();

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins("http://localhost:5173")
              .WithHeaders("Idempotency-Key", "Accept", "Content-Type")
              .WithMethods("POST", "OPTIONS");
    });
});

var app = builder.Build();

app.UseCors("Frontend");
app.MapControllers();

app.Run();