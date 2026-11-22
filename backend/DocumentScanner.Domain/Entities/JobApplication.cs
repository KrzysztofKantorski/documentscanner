namespace DocumentScanner.Domain.Entities;

public class JobApplication
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string OfferId { get; init; }
    public required string FullName { get; init; }
    public required string Email { get; init; }
    public string? Phone { get; init; }
    public string? ProfileUrl { get; init; }
    public required bool ConsentAccepted { get; init; }
    public required string CvFileName { get; init; }
    public required long CvFileSize { get; init; }
    public DateTimeOffset CreatedAtUtc { get; init; } = DateTimeOffset.UtcNow;
}