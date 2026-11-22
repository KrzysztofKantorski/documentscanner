using DocumentScanner.API.Dtos;
using DocumentScanner.Domain.Entities;
using DocumentScanner.Application.Applications;
using Microsoft.AspNetCore.Mvc;
using MediatR;

namespace DocumentScanner.API.Controllers
{
    [ApiController]
    public class ApplicationsController : BaseApiController
    {
        private readonly ISender _sender;
        public ApplicationsController(ISender sender)
        {
            _sender = sender;
        }
        [HttpPost]
        public async Task<ActionResult<JobApplication>> SubmitApplication(
            [FromForm] SubmitApplicationRequestDto dto,
            [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
            CancellationToken cancellationToken)
        {
            if (dto.Cv is null || dto.Cv.Length == 0)
            {
                ModelState.AddModelError("cv", "Dołącz plik CV w formacie PDF.");
                return ValidationProblem(ModelState);
            }

            await using var cvStream = dto.Cv.OpenReadStream();

            var command = new Submit.Command
            {
                OfferId = dto.OfferId,
                FullName = dto.FullName,
                Email = dto.Email,
                Phone = dto.Phone,
                ProfileUrl = dto.ProfileUrl,
                Consent = dto.Consent,
                CvFileName = dto.Cv.FileName,
                CvFileSize = dto.Cv.Length,
                CvContent = cvStream,
                IdempotencyKey = idempotencyKey
            };

            var result = await _sender.Send(command, cancellationToken);

            return Created(
                $"/api/applications/{result.ApplicationId}",
                new SubmitApplicationResponseDto(result.ApplicationId));
        }
    }
}
