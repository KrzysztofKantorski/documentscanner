import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatBytes, MAX_CV_BYTES, validateApplicant, validateCvFile, validateField } from './validation'

const pdf = (body = '%PDF-1.7\n...', name = 'cv.pdf', type = 'application/pdf') =>
  new File([body], name, { type })

const validFields = {
  fullName: 'Anna Nowak',
  email: 'anna@example.com',
  phone: '',
  profileUrl: '',
  consent: true,
}

describe('validateCvFile', () => {
  const errorOf = async (file: File) => (await validateCvFile(file)).error

  it('accepts a real PDF', async () => {
    expect(await validateCvFile(pdf())).toEqual({ error: null, warning: null })
  })

  it('rejects a file that is not a PDF by name or type', async () => {
    expect(await errorOf(new File(['hello'], 'cv.docx', { type: 'application/msword' }))).toMatch(/formacie PDF/)
  })

  it('rejects a renamed file without the PDF signature', async () => {
    expect(await errorOf(pdf('MZ\x90\x00 not a pdf'))).toMatch(/nie jest prawidłowym PDF/)
  })

  it('rejects an empty file', async () => {
    expect(await errorOf(pdf(''))).toMatch(/pusty/)
  })

  it('never reports a file just over the limit as the limit itself', async () => {
    const justOver = pdf('%PDF-' + 'a'.repeat(MAX_CV_BYTES - 4))
    expect(justOver.size).toBe(MAX_CV_BYTES + 1)
    expect(await errorOf(justOver)).toBe('Plik ma 4,1 MB. Maksymalny rozmiar to 4 MB.')
  })

  it('accepts an encrypted PDF but warns about passwords', async () => {
    const locked = pdf('%PDF-1.7\n1 0 obj\ntrailer << /Root 1 0 R /Encrypt 5 0 R >>\n%%EOF')
    const result = await validateCvFile(locked)
    expect(result.error).toBeNull()
    expect(result.warning).toMatch(/zaszyfrowany/)
  })

  it('does not warn when "/Encrypt" is only text in the document', async () => {
    const text = pdf('%PDF-1.7\nBT (Skills: /Encrypt keys, AES) Tj ET\n%%EOF')
    expect((await validateCvFile(text)).warning).toBeNull()
  })

  it('reports a file that cannot be read as a thrown error', async () => {
    const broken = pdf()
    broken.arrayBuffer = () => Promise.reject(new DOMException('gone', 'NotReadableError'))
    await expect(validateCvFile(broken)).rejects.toThrow()
  })
})

describe('validateField', () => {
  it('requires name, email and consent', () => {
    const empty = { fullName: '', email: '', phone: '', profileUrl: '', consent: false }
    expect(Object.keys(validateApplicant(empty)).sort()).toEqual(['consent', 'email', 'fullName'])
  })

  it('accepts a complete applicant', () => {
    expect(validateApplicant(validFields)).toEqual({})
  })

  it('rejects malformed email', () => {
    expect(validateField('email', { ...validFields, email: 'anna@example' })).not.toBeNull()
  })

  it('allows an empty phone but rejects letters', () => {
    expect(validateField('phone', validFields)).toBeNull()
    expect(validateField('phone', { ...validFields, phone: '+48 600 100 200' })).toBeNull()
    expect(validateField('phone', { ...validFields, phone: '0048 600 100 200' })).toBeNull()
    expect(validateField('phone', { ...validFields, phone: '(+48) 600-100-200' })).toBeNull()
    expect(validateField('phone', { ...validFields, phone: 'zadzwoń' })).not.toBeNull()
    expect(validateField('phone', { ...validFields, phone: '600 100' })).not.toBeNull()
  })

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'linkedin.com/in/anna'])(
    'rejects non-http profile link %s',
    (profileUrl) => {
      expect(validateField('profileUrl', { ...validFields, profileUrl })).not.toBeNull()
    },
  )

  it('accepts an https profile link', () => {
    expect(validateField('profileUrl', { ...validFields, profileUrl: 'https://linkedin.com/in/anna' })).toBeNull()
  })
})

describe('formatBytes', () => {
  it('formats with Polish decimal comma', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(4 * 1024 * 1024)).toBe('4 MB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1,5 MB')
  })
})

describe('MAX_CV_BYTES', () => {
  const load = async (value: string | undefined) => {
    vi.resetModules()
    vi.unstubAllEnvs()
    if (value !== undefined) vi.stubEnv('VITE_MAX_CV_MB', value)
    return (await import('./validation')).MAX_CV_BYTES
  }

  afterEach(() => vi.unstubAllEnvs())

  it('defaults to the 4 MB free tier limit', async () => {
    expect(await load(undefined)).toBe(4 * 1024 * 1024)
  })

  it('follows VITE_MAX_CV_MB', async () => {
    expect(await load('20')).toBe(20 * 1024 * 1024)
  })

  it.each(['abc', '0', '-5'])('falls back to 4 MB for invalid value %s', async (value) => {
    expect(await load(value)).toBe(4 * 1024 * 1024)
  })
})
