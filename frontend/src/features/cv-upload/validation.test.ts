import { describe, expect, it } from 'vitest'
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
  it('accepts a real PDF', async () => {
    expect(await validateCvFile(pdf())).toBeNull()
  })

  it('rejects a file that is not a PDF by name or type', async () => {
    expect(await validateCvFile(new File(['hello'], 'cv.docx', { type: 'application/msword' }))).toMatch(
      /formacie PDF/,
    )
  })

  it('rejects a renamed file without the PDF signature', async () => {
    expect(await validateCvFile(pdf('MZ\x90\x00 not a pdf'))).toMatch(/nie jest prawidłowym PDF/)
  })

  it('rejects an empty file', async () => {
    expect(await validateCvFile(pdf(''))).toMatch(/pusty/)
  })

  it('rejects a file over the size limit', async () => {
    const big = pdf('%PDF-' + 'a'.repeat(MAX_CV_BYTES))
    expect(await validateCvFile(big)).toMatch(/Maksymalny rozmiar/)
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
    expect(validateField('phone', { ...validFields, phone: 'zadzwoń' })).not.toBeNull()
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
