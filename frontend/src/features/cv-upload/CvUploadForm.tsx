import { useEffect, useId, useRef, useState, type ChangeEvent, type SubmitEvent } from 'react'
import {
  APPLICATIONS_ENDPOINT,
  isDemoMode,
  submitApplication,
  UploadError,
  type ApplicationReceipt,
} from './api'
import { CvDropzone } from './CvDropzone'
import { FieldError } from './FieldError'
import { AlertIcon, CheckIcon, LockIcon } from './icons'
import {
  validateApplicant,
  validateCvFile,
  validateField,
  type ApplicantFields,
  type FieldErrors,
  type FieldName,
  type FileCheck,
} from './validation'
import './cv-upload.css'

export type JobOffer = {
  id: string
  title: string
  company: string
  location: string
}

type Props = {
  offer: JobOffer
  onSubmitted?: (receipt: ApplicationReceipt) => void
}

type Phase =
  | { kind: 'editing' }
  // `sent`: every byte is out and the server is working. Cancelling then could
  // leave a stored application behind, so the cancel button stops working.
  | { kind: 'uploading'; progress: number; sent: boolean }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; receipt: ApplicationReceipt }

const EMPTY_FIELDS: ApplicantFields = {
  fullName: '',
  email: '',
  phone: '',
  profileUrl: '',
  consent: false,
}

// Optional link to the GDPR information notice (art. 13), set per deployment.
const PRIVACY_POLICY_URL = import.meta.env.VITE_PRIVACY_POLICY_URL?.trim() || null

// DOM order, used to send focus to the first problem after a failed submit.
const FIELD_ORDER: FieldName[] = ['fullName', 'email', 'phone', 'profileUrl', 'cv', 'consent']

export function CvUploadForm({ offer, onSubmitted }: Props) {
  const uid = useId()
  const ids = {
    heading: `${uid}-heading`,
    fullName: `${uid}-fullName`,
    email: `${uid}-email`,
    phone: `${uid}-phone`,
    profileUrl: `${uid}-profileUrl`,
    cv: `${uid}-cv`,
    consent: `${uid}-consent`,
    progress: `${uid}-progress`,
  } satisfies Record<FieldName | 'heading' | 'progress', string>

  const [fields, setFields] = useState(EMPTY_FIELDS)
  const [edited, setEdited] = useState<Partial<Record<FieldName, boolean>>>({})
  const [errors, setErrors] = useState<FieldErrors>({})
  const [file, setFile] = useState<File | null>(null)
  const [fileWarning, setFileWarning] = useState<string | null>(null)
  const [checkingFile, setCheckingFile] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' })
  const [announcement, setAnnouncement] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const fileCheckRef = useRef(0)
  const announceTimer = useRef<number | undefined>(undefined)
  const doneHeadingRef = useRef<HTMLHeadingElement>(null)
  const failureRef = useRef<HTMLDivElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  // The button that had focus is replaced whenever the phase changes, so focus is
  // placed deliberately instead of falling back to <body>.
  const focusOnEdit = useRef<FieldName | 'submit' | null>(null)
  // One key per version of the application: retries reuse it, any edit drops it.
  const idempotencyKey = useRef<string | null>(null)
  const unmounted = useRef(false)

  const uploading = phase.kind === 'uploading'

  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
      abortRef.current?.abort()
      window.clearTimeout(announceTimer.current)
    }
  }, [])

  useEffect(() => {
    if (phase.kind === 'uploading') cancelRef.current?.focus()
    if (phase.kind === 'done') doneHeadingRef.current?.focus()
    if (phase.kind === 'failed') failureRef.current?.focus()
    if (phase.kind === 'editing' && focusOnEdit.current) {
      const target = focusOnEdit.current
      focusOnEdit.current = null
      if (target === 'submit') submitRef.current?.focus()
      else document.getElementById(`${uid}-${target}`)?.focus()
    }
  }, [phase.kind, uid])

  // Leaving the page mid-upload would silently drop the application.
  useEffect(() => {
    if (!uploading) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  // One polite region for the whole form. The short delay lets a screen reader
  // finish reading the field that just received focus before the message.
  const announce = (message: string) => {
    if (unmounted.current) return
    window.clearTimeout(announceTimer.current)
    setAnnouncement('')
    announceTimer.current = window.setTimeout(() => setAnnouncement(message), 500)
  }

  const setFieldError = (name: FieldName, error: string | null) =>
    setErrors((current) => {
      if ((current[name] ?? null) === error) return current
      const next = { ...current }
      if (error) next[name] = error
      else delete next[name]
      return next
    })

  const onTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    const name = event.target.name as keyof ApplicantFields
    const next = { ...fields, [name]: event.target.value }
    setFields(next)
    idempotencyKey.current = null
    setEdited((current) => ({ ...current, [name]: true }))
    // While typing, errors may only disappear; new ones wait for blur or submit.
    if (errors[name] && !validateField(name, next)) setFieldError(name, null)
  }

  const onTextBlur = (name: keyof ApplicantFields) => {
    if (!edited[name]) return
    const error = validateField(name, fields)
    if (error && error !== errors[name]) announce(`Błąd: ${error}`)
    setFieldError(name, error)
  }

  const onConsentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = { ...fields, consent: event.target.checked }
    setFields(next)
    idempotencyKey.current = null
    const error = validateField('consent', next)
    if (error && !errors.consent) announce(`Błąd: ${error}`)
    setFieldError('consent', error)
  }

  const onFiles = async (files: File[]) => {
    // Some drag sources announce files but deliver none.
    if (files.length === 0) return
    // A newer pick always wins: results of older checks are dropped below.
    const check = ++fileCheckRef.current
    idempotencyKey.current = null
    setFile(null)
    setFileWarning(null)

    if (files.length > 1) {
      setCheckingFile(false)
      setFieldError('cv', 'Dodaj tylko jeden plik z CV.')
      announce('Błąd: Dodaj tylko jeden plik z CV.')
      return
    }

    const candidate = files[0]
    setFieldError('cv', null)
    setCheckingFile(true)
    let result: FileCheck
    try {
      result = await validateCvFile(candidate)
    } catch {
      // The file was moved, deleted or is a cloud placeholder the browser cannot read.
      result = { error: 'Nie udało się odczytać pliku. Wybierz go ponownie.', warning: null }
    }
    if (check !== fileCheckRef.current) return

    setCheckingFile(false)
    if (result.error) {
      setFieldError('cv', result.error)
      announce(`Błąd: ${result.error}`)
      return
    }
    setFile(candidate)
    setFileWarning(result.warning)
    announce(`Dodano plik ${candidate.name}.${result.warning ? ` Uwaga: ${result.warning}` : ''}`)
  }

  const onClearFile = () => {
    fileCheckRef.current += 1
    idempotencyKey.current = null
    setCheckingFile(false)
    setFile(null)
    setFileWarning(null)
    announce('Usunięto plik.')
  }

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (uploading) return
    if (checkingFile) {
      announce('Poczekaj, aż skończę sprawdzać plik.')
      return
    }

    const nextErrors = validateApplicant(fields)
    if (!file) nextErrors.cv = errors.cv ?? 'Dodaj swoje CV w formacie PDF.'
    else delete nextErrors.cv
    setErrors(nextErrors)

    const firstInvalid = FIELD_ORDER.find((name) => nextErrors[name])
    if (firstInvalid) {
      document.getElementById(ids[firstInvalid])?.focus()
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    idempotencyKey.current ??= crypto.randomUUID()
    setPhase({ kind: 'uploading', progress: 0, sent: false })
    announce('Wysyłam CV.')

    let announcedSent = false
    try {
      const receipt = await submitApplication(
        { ...fields, offerId: offer.id, cv: file! },
        {
          idempotencyKey: idempotencyKey.current,
          signal: controller.signal,
          onProgress: (fraction) => {
            const sent = fraction >= 1
            setPhase({ kind: 'uploading', progress: Math.round(fraction * 100), sent })
            if (sent && !announcedSent) {
              announcedSent = true
              announce('Plik wysłany. Przetwarzamy CV.')
            }
          },
        },
      )
      setPhase({ kind: 'done', receipt })
      onSubmitted?.(receipt)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (unmounted.current) return
        focusOnEdit.current = 'submit'
        setPhase({ kind: 'editing' })
        announce('Anulowano wysyłanie. Twoje dane zostały w formularzu.')
        return
      }
      if (error instanceof UploadError && Object.keys(error.fieldErrors).length) {
        const fieldErrors = error.fieldErrors
        setErrors((current) => ({ ...current, ...fieldErrors }))
        // Focus lands on the first rejected field, which reads its message aloud.
        focusOnEdit.current = FIELD_ORDER.find((name) => fieldErrors[name]) ?? 'submit'
        setPhase({ kind: 'editing' })
        return
      }
      const message =
        error instanceof UploadError ? error.message : 'Coś poszło nie tak. Spróbuj ponownie.'
      setPhase({ kind: 'failed', message })
    } finally {
      abortRef.current = null
    }
  }

  const reset = () => {
    fileCheckRef.current += 1
    idempotencyKey.current = null
    window.clearTimeout(announceTimer.current)
    setAnnouncement('')
    setFields(EMPTY_FIELDS)
    setEdited({})
    setErrors({})
    setFile(null)
    setFileWarning(null)
    setCheckingFile(false)
    focusOnEdit.current = 'fullName'
    setPhase({ kind: 'editing' })
  }

  if (phase.kind === 'done') {
    return (
      <section className="panel panel-done" aria-labelledby={ids.heading}>
        <span className="done-badge">
          <CheckIcon />
        </span>
        <h2 id={ids.heading} ref={doneHeadingRef} tabIndex={-1}>
          Aplikacja wysłana
        </h2>
        {phase.receipt.demo ? (
          <p>
            Tak wyglądałoby potwierdzenie aplikacji na stanowisko <strong>{offer.title}</strong> w{' '}
            {offer.company}. W wersji demonstracyjnej CV nie zostało nigdzie wysłane.
          </p>
        ) : (
          <p>
            Twoje CV na stanowisko <strong>{offer.title}</strong> w {offer.company} zostało przyjęte
            i czeka na analizę. Zachowaj numer aplikacji, gdyby trzeba było się do niej odwołać.
          </p>
        )}
        <dl className="receipt">
          <dt>Numer aplikacji</dt>
          <dd>
            <code>{phase.receipt.applicationId}</code>
          </dd>
        </dl>
        <button type="button" className="button button-secondary" onClick={reset}>
          Wyślij kolejne CV
        </button>
      </section>
    )
  }

  const describe = (name: FieldName, hintId?: string) =>
    [hintId, errors[name] ? `${ids[name]}-error` : null].filter(Boolean).join(' ') || undefined

  const fieldError = (name: FieldName) => {
    const message = errors[name]
    return message ? <FieldError id={`${ids[name]}-error`} message={message} /> : null
  }

  return (
    <section className="panel" aria-labelledby={ids.heading}>
      <header className="panel-header">
        <p className="eyebrow">Aplikujesz na stanowisko</p>
        <h2 id={ids.heading}>{offer.title}</h2>
        <p className="offer-meta">
          {offer.company} · {offer.location}
        </p>
      </header>

      {isDemoMode && (
        <p className="demo-note">
          Wersja demonstracyjna: wysyłka jest tylko symulowana, a CV nie opuszcza Twojej przeglądarki.
        </p>
      )}

      <form
        className="form"
        method="post"
        action={isDemoMode ? undefined : APPLICATIONS_ENDPOINT}
        encType="multipart/form-data"
        noValidate
        aria-labelledby={ids.heading}
        onSubmit={onSubmit}
      >
        <p className="form-footnote">
          Pola oznaczone <span aria-hidden="true">*</span>
          <span className="visually-hidden">gwiazdką</span> są wymagane.
        </p>

        <fieldset className="form-section" disabled={uploading}>
          <legend>Dane kontaktowe</legend>

          <div className="field">
            <label htmlFor={ids.fullName} className="field-label">
              Imię i nazwisko <span aria-hidden="true">*</span>
            </label>
            <input
              id={ids.fullName}
              name="fullName"
              type="text"
              autoComplete="name"
              enterKeyHint="next"
              maxLength={100}
              required
              value={fields.fullName}
              aria-invalid={errors.fullName ? 'true' : 'false'}
              aria-describedby={describe('fullName')}
              onChange={onTextChange}
              onBlur={() => onTextBlur('fullName')}
            />
            {fieldError('fullName')}
          </div>

          <div className="field">
            <label htmlFor={ids.email} className="field-label">
              E-mail <span aria-hidden="true">*</span>
            </label>
            <span id={`${ids.email}-hint`} className="field-hint">
              Pod tym adresem skontaktujemy się w sprawie rekrutacji.
            </span>
            <input
              id={ids.email}
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              maxLength={254}
              required
              value={fields.email}
              aria-invalid={errors.email ? 'true' : 'false'}
              aria-describedby={describe('email', `${ids.email}-hint`)}
              onChange={onTextChange}
              onBlur={() => onTextBlur('email')}
            />
            {fieldError('email')}
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor={ids.phone} className="field-label">
                Telefon <span className="optional">(opcjonalnie)</span>
              </label>
              <input
                id={ids.phone}
                name="phone"
                type="tel"
                autoComplete="tel"
                enterKeyHint="next"
                maxLength={20}
                value={fields.phone}
                aria-invalid={errors.phone ? 'true' : 'false'}
                aria-describedby={describe('phone')}
                onChange={onTextChange}
                onBlur={() => onTextBlur('phone')}
              />
              {fieldError('phone')}
            </div>

            <div className="field">
              <label htmlFor={ids.profileUrl} className="field-label">
                LinkedIn lub portfolio <span className="optional">(opcjonalnie)</span>
              </label>
              <input
                id={ids.profileUrl}
                name="profileUrl"
                type="url"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                maxLength={300}
                placeholder="https://"
                value={fields.profileUrl}
                aria-invalid={errors.profileUrl ? 'true' : 'false'}
                aria-describedby={describe('profileUrl')}
                onChange={onTextChange}
                onBlur={() => onTextBlur('profileUrl')}
              />
              {fieldError('profileUrl')}
            </div>
          </div>
        </fieldset>

        <fieldset className="form-section" disabled={uploading}>
          <legend>Dokument</legend>
          <CvDropzone
            inputId={ids.cv}
            file={file}
            error={errors.cv ?? null}
            warning={fileWarning}
            checking={checkingFile}
            disabled={uploading}
            onFiles={onFiles}
            onClear={onClearFile}
          />
        </fieldset>

        <fieldset className="form-section" disabled={uploading}>
          <legend className="visually-hidden">Zgoda na przetwarzanie danych</legend>
          <div className="field">
            <div className="checkbox">
              <input
                id={ids.consent}
                name="consent"
                type="checkbox"
                required
                checked={fields.consent}
                aria-invalid={errors.consent ? 'true' : 'false'}
                aria-describedby={describe('consent', `${ids.consent}-hint`)}
                onChange={onConsentChange}
              />
              <label htmlFor={ids.consent}>
                Wyrażam zgodę na przetwarzanie moich danych osobowych zawartych w CV w celu
                rekrutacji na to stanowisko, w tym na automatyczną analizę dopasowania CV do
                oferty. <span aria-hidden="true">*</span>
              </label>
            </div>
            <span id={`${ids.consent}-hint`} className="field-hint checkbox-hint">
              <LockIcon />
              <span>
                Zgodę możesz wycofać w dowolnym momencie. Plik służy tylko do tej rekrutacji.
                {PRIVACY_POLICY_URL && (
                  <>
                    {' '}
                    <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
                      Klauzula informacyjna RODO
                      <span className="visually-hidden"> (otwiera się w nowej karcie)</span>
                    </a>
                  </>
                )}
              </span>
            </span>
            {fieldError('consent')}
          </div>
        </fieldset>

        {phase.kind === 'failed' && (
          <div className="alert" role="alert" ref={failureRef} tabIndex={-1}>
            <AlertIcon />
            <div>
              <p className="alert-title">Nie udało się wysłać aplikacji</p>
              <p>{phase.message}</p>
            </div>
          </div>
        )}

        {uploading && (
          <div className="upload-progress">
            <label htmlFor={ids.progress}>
              {phase.sent ? (
                'Przetwarzamy CV…'
              ) : (
                <>
                  Wysyłanie CV… <span className="tabular">{phase.progress}%</span>
                </>
              )}
            </label>
            {/* No value while the server works: there is no progress to report. */}
            {phase.sent ? (
              <progress id={ids.progress} max={100} />
            ) : (
              <progress id={ids.progress} max={100} value={phase.progress} />
            )}
          </div>
        )}

        <div className="form-actions">
          {uploading ? (
            <>
              <button
                ref={cancelRef}
                type="button"
                className="button button-secondary"
                // aria-disabled instead of disabled keeps keyboard focus on the button.
                aria-disabled={phase.sent || undefined}
                aria-describedby={phase.sent ? `${ids.progress}-sent` : undefined}
                onClick={() => {
                  if (!phase.sent) abortRef.current?.abort()
                }}
              >
                Anuluj wysyłanie
              </button>
              {phase.sent && (
                <span id={`${ids.progress}-sent`} className="form-footnote">
                  Plik już dotarł, więc wysyłki nie można anulować.
                </span>
              )}
            </>
          ) : (
            <button ref={submitRef} type="submit" className="button button-primary">
              {phase.kind === 'failed' ? 'Spróbuj ponownie' : 'Wyślij aplikację'}
            </button>
          )}
        </div>
      </form>

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  )
}
