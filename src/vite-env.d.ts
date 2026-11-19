/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** El dominio propio (luxbyemory.com). Sin él, todo vive en una sola dirección (desarrollo). */
  readonly VITE_DOMINIO_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
