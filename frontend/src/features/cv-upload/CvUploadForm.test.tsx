import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CvUploadForm } from './CvUploadForm'

const offer = { id: 'offer-1', title: 'Junior .NET Developer', company: 'Contoso', location: 'Gliwice' }
const pdf = () => new File(['%PDF-1.7 test'], 'Anna_Nowak_CV.pdf', { type: 'application/pdf' })

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Imię i nazwisko/), 'Anna Nowak')
  await user.type(screen.getByLabelText(/E-mail/), 'anna@example.com')
  await user.upload(screen.getByLabelText(/CV w formacie PDF/), pdf())
  await screen.findByText('Anna_Nowak_CV')
  await user.click(screen.getByRole('checkbox'))
}

describe('CvUploadForm', () => {
  it('shows errors and focuses the first invalid field on empty submit', async () => {
    const user = userEvent.setup()
    render(<CvUploadForm offer={offer} />)

    await user.click(screen.getByRole('button', { name: 'Wyślij aplikację' }))

    const name = screen.getByLabelText(/Imię i nazwisko/)
    expect(document.activeElement).toBe(name)
    expect(name.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Podaj imię i nazwisko.')).toBeTruthy()
    expect(screen.getByText('Dodaj swoje CV w formacie PDF.')).toBeTruthy()
    expect(screen.getByText(/Zgoda jest wymagana/)).toBeTruthy()
  })

  it('does not show an error while the user is still typing', async () => {
    const user = userEvent.setup()
    render(<CvUploadForm offer={offer} />)

    const email = screen.getByLabelText(/E-mail/)
    await user.type(email, 'anna@')
    expect(email.getAttribute('aria-invalid')).toBe('false')

    await user.tab()
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toContain('-error')
  })

  it('announces the consent error when the box is unchecked', async () => {
    const user = userEvent.setup()
    render(<CvUploadForm offer={offer} />)
    const consent = screen.getByRole('checkbox')

    await user.click(consent)
    await user.click(consent)

    expect(consent.getAttribute('aria-invalid')).toBe('true')
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Zgoda jest wymagana/))
  })

  it('rejects a dropped file that is not a PDF', async () => {
    render(<CvUploadForm offer={offer} />)
    const zone = document.querySelector('.dropzone')!
    const fake = new File(['MZ...'], 'virus.pdf', { type: 'application/pdf' })

    fireEvent.drop(zone, { dataTransfer: { files: [fake], types: ['Files'] } })

    expect(await screen.findByText(/nie jest prawidłowym PDF/)).toBeTruthy()
    expect(screen.queryByText('virus')).toBeNull()
  })

  it('rejects dropping more than one file', async () => {
    render(<CvUploadForm offer={offer} />)
    const zone = document.querySelector('.dropzone')!

    fireEvent.drop(zone, { dataTransfer: { files: [pdf(), pdf()], types: ['Files'] } })

    expect(await screen.findByText('Dodaj tylko jeden plik z CV.')).toBeTruthy()
  })

  it('uploads in demo mode and shows the receipt', async () => {
    const user = userEvent.setup()
    const onSubmitted = vi.fn()
    render(<CvUploadForm offer={offer} onSubmitted={onSubmitted} />)

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Wyślij aplikację' }))

    expect(screen.getByRole('progressbar')).toBeTruthy()
    const heading = await screen.findByRole('heading', { name: 'Aplikacja wysłana' }, { timeout: 4000 })
    expect(document.activeElement).toBe(heading)
    expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ demo: true }))
  })

  it('cancels an upload and keeps what the user typed', async () => {
    const user = userEvent.setup()
    render(<CvUploadForm offer={offer} />)

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Wyślij aplikację' }))
    await act(() => user.click(screen.getByRole('button', { name: 'Anuluj wysyłanie' })))

    expect(screen.queryByRole('progressbar')).toBeNull()
    expect((screen.getByLabelText(/Imię i nazwisko/) as HTMLInputElement).value).toBe('Anna Nowak')
    expect(screen.getByText('Anna_Nowak_CV')).toBeTruthy()
  })
})
