import { AlertIcon } from './icons'

export function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <span id={id} className="field-error">
      <AlertIcon />
      <span>
        <span className="visually-hidden">Błąd: </span>
        {message}
      </span>
    </span>
  )
}
