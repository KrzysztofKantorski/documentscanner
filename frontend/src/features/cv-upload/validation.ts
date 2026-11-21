// Azure AI Document Intelligence on the free tier (F0) rejects files over 4 MB,
// so that is the default. The paid tier accepts more: raise VITE_MAX_CV_MB.
const DEFAULT_MAX_CV_MB = 4
const configuredMb = Number(import.meta.env.VITE_MAX_CV_MB)
export const MAX_CV_BYTES =
  (Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : DEFAULT_MAX_CV_MB) * 1024 * 1024

const PDF_SIGNATURE = '%PDF-'

export type ApplicantFields = {
  fullName: string
  email: string
  phone: string
  profileUrl: string
  consent: boolean
}

export type FieldName = keyof ApplicantFields | 'cv'

export type FieldErrors = Partial<Record<FieldName, string>>

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '').replace('.', ',')} MB`
}

/**
 * Checks the file the way the backend will: by its first bytes, not by the
 * name or the MIME type the browser guessed. Returns an error message or null.
 */
export async function validateCvFile(file: File): Promise<string | null> {
  const looksLikePdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!looksLikePdf) return 'Wybierz plik w formacie PDF.'
  if (file.size === 0) return 'Ten plik jest pusty. Wybierz inny PDF.'
  if (file.size > MAX_CV_BYTES) {
    return `Plik ma ${formatBytes(file.size)}. Maksymalny rozmiar to ${formatBytes(MAX_CV_BYTES)}.`
  }

  // latin1 maps every byte to one character, so PDF keywords can be searched as text.
  const content = new TextDecoder('latin1').decode(await file.arrayBuffer())
  if (!content.startsWith(PDF_SIGNATURE)) {
    return 'Ten plik nie jest prawidłowym PDF-em. Wyeksportuj CV do PDF i spróbuj ponownie.'
  }
  // Document Intelligence cannot read password-protected PDFs, and the error
  // would otherwise surface only after the upload.
  if (content.includes('/Encrypt')) {
    return 'Ten PDF jest zabezpieczony hasłem. Zapisz CV bez hasła i spróbuj ponownie.'
  }
  return null
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Separators people type (spaces, dashes, brackets) are ignored; 9 to 15 digits
// covers Polish numbers with or without the 0048/+48 prefix.
const PHONE_PATTERN = /^\+?\d{9,15}$/

export function validateField(name: keyof ApplicantFields, fields: ApplicantFields): string | null {
  switch (name) {
    case 'fullName': {
      const value = fields.fullName.trim()
      if (!value) return 'Podaj imię i nazwisko.'
      if (value.length < 3) return 'Imię i nazwisko musi mieć co najmniej 3 znaki.'
      return null
    }
    case 'email': {
      const value = fields.email.trim()
      if (!value) return 'Podaj adres e-mail.'
      if (!EMAIL_PATTERN.test(value)) return 'Podaj e-mail w formacie ty@example.com.'
      return null
    }
    case 'phone': {
      const value = fields.phone.trim()
      if (value && !PHONE_PATTERN.test(value.replace(/[\s\-()]/g, ''))) {
        return 'Podaj numer w formacie +48 600 000 000 albo zostaw pole puste.'
      }
      return null
    }
    case 'profileUrl': {
      const value = fields.profileUrl.trim()
      if (value && !isHttpUrl(value)) {
        return 'Podaj pełny adres zaczynający się od https://, np. https://linkedin.com/in/jan.'
      }
      return null
    }
    case 'consent':
      return fields.consent ? null : 'Zgoda jest wymagana, żeby przetworzyć Twoje CV.'
  }
}

export function validateApplicant(fields: ApplicantFields): FieldErrors {
  const errors: FieldErrors = {}
  for (const name of Object.keys(fields) as (keyof ApplicantFields)[]) {
    const error = validateField(name, fields)
    if (error) errors[name] = error
  }
  return errors
}

// Recruiters will open this link later, so anything other than http(s)
// (javascript:, data:, file:) is refused here as well as on the server.
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
