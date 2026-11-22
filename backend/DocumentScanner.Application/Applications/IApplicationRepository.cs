using DocumentScanner.Domain.Entities;
using System;
using System.Collections.Generic;
using System.Text;

namespace DocumentScanner.Application.Applications
{
    public interface IApplicationRepository
    {
        Task SaveAsync(JobApplication application, CancellationToken cancellationToken);
    }
}