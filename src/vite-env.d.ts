/// <reference types="vite/client" />

interface Window {
  EXCALIDRAW_ASSET_PATH: string;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
