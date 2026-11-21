import { useEffect, useRef, useState, type DragEvent } from 'react'
import { FieldError } from './FieldError'
import { AlertIcon, FileIcon, UploadIcon } from './icons'
import { formatBytes, MAX_CV_BYTES } from './validation'

type Props = {
  inputId: string
  file: File | null
  error: string | null
  warning: string | null
  checking: boolean
  disabled: boolean
  onFiles: (files: File[]) => void
  onClear: () => void
}

export function CvDropzone({
  inputId,
  file,
  error,
  warning,
  checking,
  disabled,
  onFiles,
  onClear,
}: Props) {
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const labelId = `${inputId}-label`
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const fileId = `${inputId}-file`
  const warningId = `${inputId}-warning`

  // A file dropped next to the zone would otherwise replace the whole page
  // with the browser's PDF viewer and lose everything typed into the form.
  useEffect(() => {
    const keepPage = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    window.addEventListener('dragover', keepPage)
    window.addEventListener('drop', keepPage)
    return () => {
      window.removeEventListener('dragover', keepPage)
      window.removeEventListener('drop', keepPage)
    }
  }, [])

  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files')

  const onDragEnter = (event: DragEvent) => {
    if (disabled || !hasFiles(event)) return
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  const onDragOver = (event: DragEvent) => {
    if (disabled || !hasFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  // dragleave also fires when the pointer moves onto a child element,
  // so the zone only resets once every enter has a matching leave.
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (disabled) return
    onFiles(Array.from(event.dataTransfer.files))
  }

  const clear = () => {
    onClear()
    inputRef.current?.focus()
  }

  // The input's own value is cleared after each pick, so without this a screen
  // reader would report "no file chosen" while a file is attached.
  const describedBy = [hintId, file ? fileId : null, warning ? warningId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ')
  const zoneState = dragging ? 'dragging' : file ? 'filled' : 'empty'

  return (
    <div className="field">
      <span id={labelId} className="field-label">
        CV w formacie PDF <span aria-hidden="true">*</span>
      </span>
      <span id={hintId} className="field-hint">
        Jeden plik PDF bez hasła, maks. {formatBytes(MAX_CV_BYTES)}.
      </span>

      <div
        className="dropzone"
        data-state={zoneState}
        data-invalid={error ? 'true' : undefined}
        data-disabled={disabled ? 'true' : undefined}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          id={inputId}
          name="cv"
          type="file"
          accept="application/pdf,.pdf"
          className="file-input"
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : 'false'}
          aria-required="true"
          disabled={disabled}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            // Clearing the value lets the same file be picked again after removing it.
            event.target.value = ''
            if (files.length) onFiles(files)
          }}
        />

        {file ? (
          <div className="dropzone-file">
            <span className="dropzone-file-icon">
              <FileIcon />
            </span>
            <span className="dropzone-file-meta" id={fileId}>
              <span className="visually-hidden">Dodany plik: </span>
              <FileName name={file.name} />
              <span className="dropzone-file-size">{formatBytes(file.size)}</span>
            </span>
            <span className="dropzone-file-actions">
              <label htmlFor={inputId} className="button button-ghost" data-disabled={disabled || undefined}>
                Zmień
              </label>
              <button type="button" className="button button-ghost" onClick={clear} disabled={disabled}>
                Usuń
                <span className="visually-hidden"> plik {file.name}</span>
              </button>
            </span>
          </div>
        ) : (
          <label htmlFor={inputId} className="dropzone-prompt">
            <span className="dropzone-icon">
              <UploadIcon />
            </span>
            {dragging || checking ? (
              <span className="dropzone-title">
                {dragging ? 'Upuść plik, aby go dodać' : 'Sprawdzam plik…'}
              </span>
            ) : (
              <>
                {/* Dragging needs a mouse, so touch screens get a plain "pick a file" prompt. */}
                <span className="dropzone-title pointer-only">Przeciągnij CV tutaj</span>
                <span className="dropzone-subtitle pointer-only">
                  albo <span className="dropzone-link">wybierz plik z dysku</span>
                </span>
                <span className="dropzone-title touch-only">Dodaj CV</span>
                <span className="dropzone-subtitle touch-only">
                  <span className="dropzone-link">Wybierz plik z urządzenia</span>
                </span>
              </>
            )}
          </label>
        )}
      </div>

      {warning && (
        <span id={warningId} className="field-warning">
          <AlertIcon />
          <span>
            <span className="visually-hidden">Uwaga: </span>
            {warning}
          </span>
        </span>
      )}
      {error && <FieldError id={errorId} message={error} />}
    </div>
  )
}

// Long names are cut in the middle so the ".pdf" ending stays visible.
function FileName({ name }: { name: string }) {
  const [, stem, extension = ''] = /^(.*?)(\.pdf)?$/i.exec(name)!
  return (
    <span className="filename" title={name}>
      <span>{stem}</span>
      {extension}
    </span>
  )
}
