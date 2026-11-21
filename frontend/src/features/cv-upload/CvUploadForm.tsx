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
  | { kind: 'uploading'; progress: number }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; receipt: ApplicationReceipt }

const EMPTY_FIELDS: ApplicantFields = {
  fullName: '',
  email: '',
  phone: '',
  profileUrl: '',
  consent: false,
}

// DOM order, used to send focus to the first problem after a failed submit.
const FIELD_ORDER: FieldName[] = ['fullName', 'email', 'phone', 'profileUrl', 'cv', 'consent']

export function CvUploadForm({ offer, onSubmitted }: Props) {
  const uid = useId()
  const ids = {
    heading: `${uid}-heading`,
    fullName: `${uid}-full-name`,
    email: `${uid}-email`,
    phone: `${uid}-phone`,
    profileUrl: `${uid}-profile-url`,
    cv: `${uid}-cv`,
    consent: `${uid}-consent`,
    progress: `${uid}-progress`,
  } satisfies Record<FieldName | 'heading' | 'progress', string>

  const [fields, setFields] = useState(EMPTY_FIELDS)
  const [edited, setEdited] = useState<Partial<Record<FieldName, boolean>>>({})
  const [errors, setErrors] = useState<FieldErrors>({})
  const [file, setFile] = useState<File | null>(null)
  const [checkingFile, setCheckingFile] = useState(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' })
  const [announcement, setAnnouncement] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const fileCheckRef = useRef(0)
  const announceTimer = useRef<number | undefined>(undefined)
  const doneHeadingRef = useRef<HTMLHeadingElement>(null)
  const failureRef = useRef<HTMLDivElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  // The control that had focus (cancel button, success view) disappears when the
  // form returns to editing, so focus is placed deliberately instead of falling to <body>.
  const focusOnEdit = useRef<'first-field' | 'submit' | null>(null)

  const uploading = phase.kind === 'uploading'

  useEffect(() => () => {
    abortRef.current?.abort()
    window.clearTimeout(announceTimer.current)
  }, [])

  useEffect(() => {
    if (phase.kind === 'done') doneHeadingRef.current?.focus()
    if (phase.kind === 'failed') failureRef.current?.focus()
    if (phase.kind === 'editing' && focusOnEdit.current) {
      if (focusOnEdit.current === 'first-field') document.getElementById(ids.fullName)?.focus()
      else submitRef.current?.focus()
      focusOnEdit.current = null
    }
  }, [phase.kind, ids.fullName])

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
    const error = validateField('consent', next)
    if (error && !errors.consent) announce(`Błąd: ${error}`)
    setFieldError('consent', error)
  }

  const onFiles = async (files: File[]) => {
    if (files.length > 1) {
      setFieldError('cv', 'Dodaj tylko jeden plik z CV.')
      announce('Błąd: Dodaj tylko jeden plik z CV.')
      return
    }
    const candidate = files[0]
    const check = ++fileCheckRef.current
    setCheckingFile(true)
    const error = await validateCvFile(candidate)
    if (check !== fileCheckRef.current) return
    setCheckingFile(false)
    setFieldError('cv', error)
    if (error) {
      setFile(null)
      announce(`Błąd: ${error}`)
      return
    }
    setFile(candidate)
    announce(`Dodano plik ${candidate.name}.`)
  }

  const onClearFile = () => {
    fileCheckRef.current += 1
    setCheckingFile(false)
    setFile(null)
    announce('Usunięto plik.')
  }

  const onSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (uploading) return

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
    setPhase({ kind: 'uploading', progress: 0 })
    announce('Wysyłam CV.')

    try {
      const receipt = await submitApplication(
        { ...fields, offerId: offer.id, cv: file! },
        {
          signal: controller.signal,
          onProgress: (fraction) =>
            setPhase({ kind: 'uploading', progress: Math.round(fraction * 100) }),
        },
      )
      setPhase({ kind: 'done', receipt })
      onSubmitted?.(receipt)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        focusOnEdit.current = 'submit'
        setPhase({ kind: 'editing' })
        announce('Anulowano wysyłanie. Twoje dane zostały w formularzu.')
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
    setFields(EMPTY_FIELDS)
    setEdited({})
    setErrors({})
    setFile(null)
    focusOnEdit.current = 'first-field'
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
        <p>
          Twoje CV na stanowisko <strong>{offer.title}</strong> w {offer.company} trafiło do
          analizy. Wynik dopasowania pojawi się, gdy system przeczyta dokument.
        </p>
        <dl className="receipt">
          <dt>Numer aplikacji</dt>
          <dd>
            <code>{phase.receipt.applicationId}</code>
          </dd>
        </dl>
        {phase.receipt.demo && (
          <p className="demo-note">Wersja demonstracyjna: plik nie został wysłany na serwer.</p>
        )}
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
              Na ten adres wyślemy wynik analizy.
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
              Zgodę możesz wycofać w dowolnym momencie. Plik służy tylko do tej rekrutacji.
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
              Wysyłanie CV… <span className="tabular">{phase.progress}%</span>
            </label>
            <progress id={ids.progress} max={100} value={phase.progress} />
          </div>
        )}

        <div className="form-actions">
          {uploading ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => abortRef.current?.abort()}
            >
              Anuluj wysyłanie
            </button>
          ) : (
            <button ref={submitRef} type="submit" className="button button-primary">
              {phase.kind === 'failed' ? 'Spróbuj ponownie' : 'Wyślij aplikację'}
            </button>
          )}
          <p className="form-footnote">
            <span aria-hidden="true">*</span> pole wymagane
          </p>
        </div>
      </form>

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  )
}
