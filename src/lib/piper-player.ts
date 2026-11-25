import { PIPER_CACHE, type PiperProgress, type PiperRequest, type PiperResponse, type PiperVoice } from './piper-protocol';
import { clearPiperReady, markPiperReady } from './voice-settings';

const FIRST_TIMEOUT = 240_000;
const CHUNK_TIMEOUT = 60_000;

export type PiperHandlers = {
    onProgress?: (progress: PiperProgress) => void;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (message: string) => void;
};

type Pending = {
    resolve: (message: PiperResponse) => void;
    reject: (error: Error) => void;
    onProgress?: (progress: PiperProgress) => void;
    generation: number;
};

type RequestInput =
    | Omit<Extract<PiperRequest, { type: 'preload' }>, 'id'>
    | Omit<Extract<PiperRequest, { type: 'speak' }>, 'id'>;

/** Parte el texto en frases cortas: Piper sintetiza mejor por oración y el audio empieza antes. */
export function splitSentences(text: string): string[] {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const parts = clean.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [clean];
    const chunks: string[] = [];
    for (const part of parts) chunks.push(...splitLong(part.trim(), 220));
    return chunks.filter(Boolean);
}

function splitLong(text: string, max: number): string[] {
    if (text.length <= max) return [text];
    const words = text.split(' ');
    const chunks: string[] = [];
    let current = '';
    for (const word of words) {
        if (current && current.length + word.length + 1 > max) {
            chunks.push(current);
            current = word;
        } else {
            current = current ? `${current} ${word}` : word;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

export class PiperPlayer {
    private worker: Worker | null = null;
    private audio: AudioContext | null = null;
    private pending = new Map<number, Pending>();
    private sources = new Set<AudioBufferSourceNode>();
    private nextId = 1;
    private generation = 0;

    /** Debe llamarse dentro de un gesto del usuario para que iOS permita el audio. */
    unlock(): void {
        const audio = this.createAudio();
        if (!audio) return;
        void audio.resume().catch(() => {});
        try {
            const source = audio.createBufferSource();
            source.buffer = audio.createBuffer(1, 1, 22_050);
            source.connect(audio.destination);
            source.start();
        } catch { /* El error se muestra al intentar hablar. */ }
    }

    async preload(voice: PiperVoice, onProgress?: (progress: PiperProgress) => void): Promise<void> {
        this.unlock();
        await this.request({ type: 'preload', voice }, FIRST_TIMEOUT, onProgress);
        markPiperReady(voice);
    }

    speak(text: string, voice: PiperVoice, handlers: PiperHandlers = {}): void {
        void this.play(text, voice, handlers);
    }

    stop(): void {
        this.generation++;
        for (const source of this.sources) {
            try { source.stop(); } catch { /* Ya terminó. */ }
            source.disconnect();
        }
        this.sources.clear();
    }

    async clearCache(): Promise<void> {
        this.stop();
        this.resetWorker();
        clearPiperReady();
        try { await caches.delete(PIPER_CACHE); } catch { /* Sin caché. */ }
    }

    dispose(): void {
        this.stop();
        this.worker?.terminate();
        this.worker = null;
        this.failAll('La voz se cerró.');
        void this.audio?.close().catch(() => {});
        this.audio = null;
    }

    private async play(text: string, voice: PiperVoice, handlers: PiperHandlers): Promise<void> {
        this.stop();
        const generation = this.generation;
        const chunks = splitSentences(text);
        if (!chunks.length) {
            handlers.onError?.('No hay texto para leer.');
            return;
        }
        const audio = this.createAudio();
        if (!audio) {
            handlers.onError?.('Este dispositivo no pudo iniciar la voz.');
            return;
        }
        try {
            let nextStart = 0;
            let started = false;
            let lastEnded: Promise<void> | null = null;
            for (const chunk of chunks) {
                const response = await this.request(
                    { type: 'speak', voice, text: chunk },
                    started ? CHUNK_TIMEOUT : FIRST_TIMEOUT,
                    handlers.onProgress,
                );
                if (generation !== this.generation) return;
                if (response.type !== 'audio') return;
                if (!started) {
                    started = true;
                    markPiperReady(voice);
                    handlers.onStart?.();
                }
                const buffer = audio.createBuffer(1, response.samples.length, response.sampleRate);
                buffer.copyToChannel(new Float32Array(response.samples), 0);
                const source = audio.createBufferSource();
                source.buffer = buffer;
                source.connect(audio.destination);
                await audio.resume().catch(() => {});
                if (generation !== this.generation) return;
                const ended = new Promise<void>((resolve) => {
                    source.onended = () => {
                        this.sources.delete(source);
                        resolve();
                    };
                });
                const when = Math.max(audio.currentTime + 0.06, nextStart);
                source.start(when);
                nextStart = when + buffer.duration;
                this.sources.add(source);
                lastEnded = ended;
            }
            if (!lastEnded) return;
            const maxWait = Math.max(15_000, (nextStart - audio.currentTime) * 1000 + 15_000);
            await new Promise<void>((resolve) => {
                const timer = setTimeout(resolve, maxWait);
                void lastEnded.then(() => { clearTimeout(timer); resolve(); });
            });
            if (generation === this.generation) handlers.onEnd?.();
        } catch (error) {
            if (generation !== this.generation) return;
            handlers.onError?.(error instanceof Error ? error.message : 'No se pudo generar la voz.');
        }
    }

    private request(
        message: RequestInput,
        timeout: number,
        onProgress?: (progress: PiperProgress) => void,
    ): Promise<PiperResponse> {
        const worker = this.ensureWorker();
        const id = this.nextId++;
        const generation = this.generation;
        return new Promise<PiperResponse>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                // Una petición de una respuesta que ya se interrumpió no debe
                // reiniciar el worker que atiende la respuesta actual.
                if (this.generation === generation) {
                    this.resetWorker();
                    reject(new Error('La voz tardó demasiado en cargar. Revisa la conexión e inténtalo de nuevo.'));
                } else {
                    reject(new Error('Se canceló la voz.'));
                }
            }, timeout);
            this.pending.set(id, {
                resolve: (value) => { clearTimeout(timer); resolve(value); },
                reject: (error) => { clearTimeout(timer); reject(error); },
                onProgress,
                generation,
            });
            worker.postMessage({ ...message, id } as PiperRequest);
        });
    }

    private ensureWorker(): Worker {
        if (!this.worker) {
            const worker = new Worker(new URL('./piper-voice.worker.ts', import.meta.url), { type: 'module' });
            worker.onmessage = (event: MessageEvent<PiperResponse>) => {
                const message = event.data;
                const pending = this.pending.get(message.id);
                if (!pending) return;
                if (message.type === 'progress') {
                    pending.onProgress?.({ loaded: message.loaded, total: message.total });
                    return;
                }
                this.pending.delete(message.id);
                if (message.type === 'error') pending.reject(new Error(message.error));
                else pending.resolve(message);
            };
            worker.onerror = () => {
                // Si el worker ya se reemplazó, su error no debe tumbar la voz nueva.
                if (this.worker !== worker) return;
                this.worker = null;
                worker.terminate();
                this.failAll('No se pudo iniciar la voz en este teléfono.');
            };
            this.worker = worker;
        }
        return this.worker;
    }

    private resetWorker(): void {
        this.worker?.terminate();
        this.worker = null;
        this.failAll('La voz se reinició.');
    }

    private failAll(message: string): void {
        for (const pending of this.pending.values()) pending.reject(new Error(message));
        this.pending.clear();
    }

    private createAudio(): AudioContext | null {
        if (typeof window === 'undefined') return null;
        try {
            this.audio ??= new AudioContext();
            return this.audio;
        } catch {
            return null;
        }
    }
}

export const piperPlayer = new PiperPlayer();
