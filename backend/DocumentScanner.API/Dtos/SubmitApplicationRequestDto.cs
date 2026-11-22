namespace DocumentScanner.API.Dtos
{
    public record SubmitApplicationRequestDto
    {
        public string OfferId { get; init; } = string.Empty;
        public string FullName { get; init; } = string.Empty;
        public string Email { get; init; } = string.Empty;
        public string? Phone { get; init; }
        public string? ProfileUrl { get; init; }
        public bool Consent { get; init; }
        public IFormFile? Cv { get; init; }
    }
}