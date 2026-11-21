/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, e.g. https://api.example.com. Empty means demo mode. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
