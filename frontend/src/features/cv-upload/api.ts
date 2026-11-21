export type ApplicationPayload = {
  offerId: string
  fullName: string
  email: string
  phone: string
  profileUrl: string
  consent: boolean
  cv: File
}

export type ApplicationReceipt = {
  applicationId: string
  demo: boolean
}

export type UploadOptions = {
  onProgress: (fraction: number) => void
  signal: AbortSignal
}

export class UploadError extends Error {
  name = 'UploadError'
}

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
export const APPLICATIONS_ENDPOINT = `${API_URL}/api/applications`
const UPLOAD_TIMEOUT_MS = 120_000

/** Without VITE_API_URL the form runs in demo mode and the file never leaves the browser. */
export const isDemoMode = API_URL === ''

export function submitApplication(
  payload: ApplicationPayload,
  options: UploadOptions,
): Promise<ApplicationReceipt> {
  return isDemoMode ? simulateUpload(options) : sendToApi(payload, options)
}

function toFormData(payload: ApplicationPayload): FormData {
  const body = new FormData()
  body.append('offerId', payload.offerId)
  body.append('fullName', payload.fullName.trim())
  body.append('email', payload.email.trim())
  if (payload.phone.trim()) body.append('phone', payload.phone.trim())
  if (payload.profileUrl.trim()) body.append('profileUrl', payload.profileUrl.trim())
  body.append('consent', String(payload.consent))
  body.append('cv', payload.cv, payload.cv.name)
  return body
}

// fetch() cannot report upload progress, so the request goes through XHR.
function sendToApi(payload: ApplicationPayload, { onProgress, signal }: UploadOptions) {
  return new Promise<ApplicationReceipt>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open('POST', APPLICATIONS_ENDPOINT)
    xhr.responseType = 'json'
    xhr.timeout = UPLOAD_TIMEOUT_MS
    xhr.setRequestHeader('Accept', 'application/json')

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    })

    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new UploadError(messageForStatus(xhr.status)))
        return
      }
      const applicationId = readApplicationId(xhr.response)
      if (!applicationId) {
        reject(new UploadError('Serwer zwrócił nieoczekiwaną odpowiedź. Spróbuj ponownie.'))
        return
      }
      onProgress(1)
      resolve({ applicationId, demo: false })
    })
    xhr.addEventListener('error', () =>
      reject(new UploadError('Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.')),
    )
    xhr.addEventListener('timeout', () =>
      reject(new UploadError('Wysyłanie trwało zbyt długo. Spróbuj ponownie.')),
    )
    xhr.addEventListener('abort', () => reject(abortError()))

    const onAbort = () => xhr.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    xhr.addEventListener('loadend', () => signal.removeEventListener('abort', onAbort))

    xhr.send(toFormData(payload))
  })
}

function readApplicationId(response: unknown): string | null {
  if (typeof response !== 'object' || response === null) return null
  const id = (response as Record<string, unknown>).applicationId
  return typeof id === 'string' && id.length > 0 && id.length <= 128 ? id : null
}

function messageForStatus(status: number): string {
  if (status === 413) return 'Plik jest za duży dla serwera. Zmniejsz PDF i spróbuj ponownie.'
  if (status === 415 || status === 422 || status === 400) {
    return 'Serwer odrzucił plik. Upewnij się, że to prawidłowy PDF.'
  }
  if (status === 429) return 'Za dużo prób w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.'
  if (status >= 500) return 'Serwer ma chwilowy problem. Spróbuj ponownie za kilka minut.'
  return `Nie udało się wysłać aplikacji (kod ${status}).`
}

function abortError() {
  return new DOMException('Wysyłanie anulowane.', 'AbortError')
}

function simulateUpload({ onProgress, signal }: UploadOptions) {
  return new Promise<ApplicationReceipt>((resolve, reject) => {
    let fraction = 0
    const timer = setInterval(() => {
      fraction = Math.min(1, fraction + 0.08)
      onProgress(fraction)
      if (fraction >= 1) {
        clearInterval(timer)
        resolve({ applicationId: `demo-${crypto.randomUUID().slice(0, 8)}`, demo: true })
      }
    }, 120)
    signal.addEventListener(
      'abort',
      () => {
        clearInterval(timer)
        reject(abortError())
      },
      { once: true },
    )
  })
}
