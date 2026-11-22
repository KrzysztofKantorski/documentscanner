namespace DocumentScanner.Application.Applications
{
    public interface IIdempotencyStore
    {
        Task<string?> GetApplicationIdAsync(string key, CancellationToken cancellationToken);
        Task SaveAsync(string key, string applicationId, CancellationToken cancellationToken);
    }
}
