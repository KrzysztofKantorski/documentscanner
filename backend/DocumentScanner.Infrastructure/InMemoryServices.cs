using System.Collections.Concurrent;
using DocumentScanner.Application.Applications;
using DocumentScanner.Domain.Entities;

namespace DocumentScanner.Infrastructure
{
    public class ConsoleApplicationRepository : IApplicationRepository
    {
        public Task SaveAsync(JobApplication application, CancellationToken cancellationToken)
        {
            Console.WriteLine(
                $"Odebrano aplikacje {application.Id:N} | Oferta: {application.OfferId} | CV: {application.CvFileName} ({application.CvFileSize} B)");

            return Task.CompletedTask;
        }
    }

    public class InMemoryIdempotencyStore : IIdempotencyStore
    {
        private readonly ConcurrentDictionary<string, string> _keys = new();

        public Task<string?> GetApplicationIdAsync(string key, CancellationToken cancellationToken)
        {
            _keys.TryGetValue(key, out var applicationId);
            return Task.FromResult(applicationId);
        }

        public Task SaveAsync(string key, string applicationId, CancellationToken cancellationToken)
        {
            _keys.TryAdd(key, applicationId);
            return Task.CompletedTask;
        }
    }
}
