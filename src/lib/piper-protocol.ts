export type PiperVoice = 'davefx' | 'carlfm';

export type PiperRequest =
    | { type: 'preload'; id: number; voice: PiperVoice }
    | { type: 'speak'; id: number; voice: PiperVoice; text: string };

export type PiperResponse =
    | { type: 'progress'; id: number; loaded: number; total: number }
    | { type: 'ready'; id: number; voice: PiperVoice }
    | { type: 'audio'; id: number; samples: Float32Array; sampleRate: number }
    | { type: 'error'; id: number; error: string };

export type PiperProgress = { loaded: number; total: number };

export const PIPER_CACHE = 'jym-piper-voices-v1';

// Tamaño aproximado de la primera descarga: modelo ONNX + espeak-ng-data + wasm de ORT.
export const PIPER_DOWNLOAD_MB: Record<PiperVoice, number> = {
    davefx: 93,
    carlfm: 58,
};

export const PIPER_LABEL: Record<PiperVoice, string> = {
    davefx: 'Davefx',
    carlfm: 'Carlfm',
};
