import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { submitApplication, UploadError } from './api'
import { CvUploadForm } from './CvUploadForm'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  isDemoMode: false,
  submitApplication: vi.fn(),
}))

const offer = { id: 'offer-1', title: 'Junior .NET Developer', company: 'Contoso', location: 'Gliwice' }

afterEach(() => {
  cleanup()
  vi.mocked(submitApplication).mockReset()
})

async function submitValidForm() {
  const user = userEvent.setup()
  render(<CvUploadForm offer={offer} />)
  await user.type(screen.getByLabelText(/Imię i nazwisko/), 'Anna Nowak')
  await user.type(screen.getByLabelText(/E-mail/), 'anna@example.com')
  await user.upload(
    screen.getByLabelText(/CV w formacie PDF/),
    new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' }),
  )
  await screen.findByText('cv')
  await user.click(screen.getByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Wyślij aplikację' }))
}

describe('CvUploadForm with a real API', () => {
  it('shows server field errors next to the fields and focuses the first one', async () => {
    vi.mocked(submitApplication).mockRejectedValue(
      new UploadError('Serwer odrzucił część danych.', { email: 'Ten adres już aplikował.' }),
    )

    await submitValidForm()

    const email = await screen.findByLabelText(/E-mail/)
    expect(await screen.findByText('Ten adres już aplikował.')).toBeTruthy()
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(email)
  })

  it('shows a retry alert for errors that are not about a field', async () => {
    vi.mocked(submitApplication).mockRejectedValue(new UploadError('Serwer ma chwilowy problem.'))

    await submitValidForm()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/chwilowy problem/)
    expect(document.activeElement).toBe(alert)
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeTruthy()
  })

  it('sends the offer id and the applicant data', async () => {
    vi.mocked(submitApplication).mockResolvedValue({ applicationId: 'app-1', demo: false })

    await submitValidForm()

    expect(await screen.findByText('app-1')).toBeTruthy()
    expect(vi.mocked(submitApplication).mock.calls[0][0]).toMatchObject({
      offerId: 'offer-1',
      fullName: 'Anna Nowak',
      email: 'anna@example.com',
      consent: true,
    })
    expect(screen.queryByText(/Wersja demonstracyjna/)).toBeNull()
  })
})
