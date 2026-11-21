import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = () => void

class FakeXhr {
  static last: FakeXhr
  status = 0
  response: unknown = null
  responseType = ''
  timeout = 0
  method = ''
  url = ''
  body: FormData | null = null
  aborted = false
  upload = { addEventListener: vi.fn() }
  private listeners: Record<string, Listener[]> = {}

  constructor() {
    FakeXhr.last = this
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader() {}
  addEventListener(type: string, listener: Listener) {
    ;(this.listeners[type] ??= []).push(listener)
  }
  send(body: FormData) {
    this.body = body
  }
  abort() {
    this.aborted = true
    this.fire('abort')
  }
  respond(status: number, response: unknown) {
    this.status = status
    this.response = response
    this.fire('load')
  }
  fire(type: string) {
    this.listeners[type]?.forEach((listener) => listener())
    if (type !== 'progress') this.listeners.loadend?.forEach((listener) => listener())
  }
}

const payload = () => ({
  offerId: 'offer-1',
  fullName: ' Anna Nowak ',
  email: 'anna@example.com',
  phone: '',
  profileUrl: '',
  consent: true,
  cv: new File(['%PDF-1.7'], 'cv.pdf', { type: 'application/pdf' }),
})

async function loadApi() {
  vi.resetModules()
  vi.stubEnv('VITE_API_URL', 'https://api.example.test/')
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  return import('./api')
}

beforeEach(() => vi.unstubAllEnvs())
afterEach(() => vi.unstubAllGlobals())

describe('submitApplication against the API', () => {
  it('posts multipart data and resolves with the application id', async () => {
    const { submitApplication, isDemoMode } = await loadApi()
    expect(isDemoMode).toBe(false)

    const result = submitApplication(payload(), { onProgress: vi.fn(), signal: new AbortController().signal })
    const xhr = FakeXhr.last
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('https://api.example.test/api/applications')
    expect(xhr.body?.get('fullName')).toBe('Anna Nowak')
    expect(xhr.body?.get('consent')).toBe('true')
    expect(xhr.body?.has('phone')).toBe(false)
    expect((xhr.body?.get('cv') as File).name).toBe('cv.pdf')

    xhr.respond(201, { applicationId: 'app-42' })
    await expect(result).resolves.toEqual({ applicationId: 'app-42', demo: false })
  })

  it.each([
    [413, /za duży/],
    [415, /odrzucił plik/],
    [429, /Za dużo prób/],
    [503, /chwilowy problem/],
  ])('maps HTTP %i to a readable message', async (status, message) => {
    const { submitApplication, UploadError } = await loadApi()
    const result = submitApplication(payload(), { onProgress: vi.fn(), signal: new AbortController().signal })
    FakeXhr.last.respond(status, null)
    await expect(result).rejects.toBeInstanceOf(UploadError)
    await expect(result).rejects.toThrow(message)
  })

  it('rejects a success response without an application id', async () => {
    const { submitApplication } = await loadApi()
    const result = submitApplication(payload(), { onProgress: vi.fn(), signal: new AbortController().signal })
    FakeXhr.last.respond(200, { id: 1 })
    await expect(result).rejects.toThrow(/nieoczekiwaną odpowiedź/)
  })

  it('aborts the request when the signal fires', async () => {
    const { submitApplication } = await loadApi()
    const controller = new AbortController()
    const result = submitApplication(payload(), { onProgress: vi.fn(), signal: controller.signal })
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(FakeXhr.last.aborted).toBe(true)
  })
})
