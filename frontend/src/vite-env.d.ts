/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, e.g. https://api.example.com. Empty means demo mode. */
  readonly VITE_API_URL?: string
  /** Largest CV accepted by the form, in MB. Defaults to 4 (Document Intelligence F0 limit). */
  readonly VITE_MAX_CV_MB?: string
  /** Link to the GDPR information notice shown next to the consent checkbox. Hidden when empty. */
  readonly VITE_PRIVACY_POLICY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
