using DocumentScanner.Domain.Entities;
using MediatR;


namespace DocumentScanner.Application.Applications
{
    public class Submit
    {
        public class Command : IRequest<Result>
        {
            public required string OfferId { get; init; }
            public required string FullName { get; init; }
            public required string Email { get; init; }
            public string? Phone { get; init; }
            public string? ProfileUrl { get; init; }
            public required bool Consent { get; init; }
            public required string CvFileName { get; init; }
            public required long CvFileSize { get; init; }
            public required Stream CvContent { get; init; }
            public string? IdempotencyKey { get; init; }
        }

        public record Result(string ApplicationId);

        public class Handler : IRequestHandler<Command, Result>
        {
            private readonly IApplicationRepository _repository;
            private readonly IIdempotencyStore _idempotencyStore;
            public Handler(IApplicationRepository repository, IIdempotencyStore idempotencyStore)
            {
                _repository = repository;
                _idempotencyStore = idempotencyStore;
            }
            public async Task<Result> Handle(Command request, CancellationToken cancellationToken)
            {
                if (!string.IsNullOrWhiteSpace(request.IdempotencyKey))
                {
                    var existingId = await _idempotencyStore.GetApplicationIdAsync(
                        request.IdempotencyKey,
                        cancellationToken);

                    if (existingId is not null)
                    {
                        return new Result(existingId);
                    }
                }

                var application = new JobApplication
                {
                    OfferId = request.OfferId,
                    FullName = request.FullName,
                    Email = request.Email,
                    Phone = request.Phone,
                    ProfileUrl = request.ProfileUrl,
                    ConsentAccepted = request.Consent,
                    CvFileName = request.CvFileName,
                    CvFileSize = request.CvFileSize
                };

                await _repository.SaveAsync(application, cancellationToken);

                var applicationId = application.Id.ToString("N");

                if (!string.IsNullOrWhiteSpace(request.IdempotencyKey))
                {
                    await _idempotencyStore.SaveAsync(
                        request.IdempotencyKey,
                        applicationId,
                        cancellationToken);
                }

                return new Result(applicationId);
            }
        }
    }
}
