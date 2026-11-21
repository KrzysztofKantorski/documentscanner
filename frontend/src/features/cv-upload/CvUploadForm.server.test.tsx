import { act, cleanup, render, screen } from '@testing-library/react'
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

async function submitValidForm(user = userEvent.setup()) {
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

  it('stops offering cancel once every byte has been sent', async () => {
    vi.mocked(submitApplication).mockImplementation((_payload, { onProgress }) => {
      onProgress(1)
      return new Promise(() => {})
    })

    await submitValidForm()

    const cancel = await screen.findByRole('button', { name: 'Anuluj wysyłanie' })
    expect(cancel.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(cancel)
    expect(screen.getByText('Przetwarzamy CV…')).toBeTruthy()
    expect(screen.getByRole('progressbar').hasAttribute('value')).toBe(false)
  })

  it('reuses the idempotency key on retry and replaces it after an edit', async () => {
    vi.mocked(submitApplication).mockRejectedValue(new UploadError('Serwer ma chwilowy problem.'))
    const user = userEvent.setup()

    await submitValidForm(user)
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    await act(() => Promise.resolve())
    await user.type(screen.getByLabelText(/Telefon/), '600100200')
    await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    await act(() => Promise.resolve())

    const keys = vi.mocked(submitApplication).mock.calls.map(([, options]) => options.idempotencyKey)
    expect(keys).toHaveLength(3)
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])
  })
})
