/// <reference lib="webworker" />
import createPhonemizer from '@diffusionstudio/piper-wasm/build/piper_phonemize.js';
import * as ort from 'onnxruntime-web';
import { PIPER_CACHE, type PiperRequest, type PiperResponse, type PiperVoice } from './piper-protocol';

// The retrained Davefx at this exact revision uses CC0 recordings and the CC0 rdh base.
// Previous versions of the same name inherited lessac and must not be used here.
const revision = '5ec43b186ef915a195d3ddbcfd9916e76c503c3f';
const models = {
    davefx: 'es/es_ES/davefx/medium/es_ES-davefx-medium.onnx',
    carlfm: 'es/es_ES/carlfm/x_low/es_ES-carlfm-x_low.onnx',
} as const;
type LoadedVoice = { config: VoiceConfig; session: ort.InferenceSession };
type VoiceConfig = {
    espeak: { voice: string };
    audio: { sample_rate: number };
    inference: { noise_scale: number; length_scale: number; noise_w: number };
    speaker_id_map: Record<string, number>;
};

const base = `https://huggingface.co/rhasspy/piper-voices/resolve/${revision}/`;
const assetBase = '/piper/';
const cacheName = PIPER_CACHE;

// iOS PWA no ofrece aislamiento de origen para hilos WASM; un solo hilo basta.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = assetBase;
ort.env.logLevel = 'error';

const loaded = new Map<PiperVoice, Promise<LoadedVoice>>();
let phonemizer: Promise<{ callMain: (args: string[]) => void }> | undefined;
let onPhonemes: ((ids: number[]) => void) | undefined;
let phonemeSequence = 0;

function post(message: PiperResponse, transfer: Transferable[] = []): void {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer);
}

async function openCache(): Promise<Cache | null> {
    try {
        return await caches.open(cacheName);
    } catch {
        return null;
    }
}

type Progress = (loaded: number, total: number) => void;

/** Descarga con progreso y guarda el archivo en Cache Storage para la próxima sesión. */
async function readAsset(url: string, report: Progress): Promise<ArrayBuffer> {
    const cache = await openCache();
    const cached = await cache?.match(url).catch(() => null);
    if (cached) return cached.arrayBuffer();

    let response: Response;
    try {
        response = await fetch(url);
    } catch {
        throw new Error('No se pudo descargar la voz. Revisa la conexión e inténtalo de nuevo.');
    }
    if (!response.ok) throw new Error(`No se pudo descargar la voz (error ${response.status}).`);
    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body || !total) {
        const buffer = await response.arrayBuffer();
        await cache?.put(url, new Response(buffer)).catch(() => {});
        return buffer;
    }

    const bytes = new Uint8Array(total);
    const reader = response.body.getReader();
    let offset = 0;
    let lastBytes = 0;
    let lastReport = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes.set(value, offset);
        offset += value.length;
        const now = Date.now();
        if (offset - lastBytes > 1_000_000 || now - lastReport > 250) {
            lastBytes = offset;
            lastReport = now;
            report(offset, total);
        }
    }
    report(offset, total);
    const exact = offset === total ? bytes : bytes.slice(0, offset);
    await cache?.put(url, new Response(exact)).catch(() => {});
    return exact.buffer;
}

async function getVoice(voice: PiperVoice, report: Progress): Promise<LoadedVoice> {
    let result = loaded.get(voice);
    if (!result) {
        for (const [key, previous] of [...loaded]) {
            if (key === voice) continue;
            loaded.delete(key);
            previous.then(({ session }) => session.release()).catch(() => {});
        }
        result = (async () => {
            const url = base + models[voice];
            const [configBuffer, modelBuffer] = await Promise.all([
                readAsset(`${url}.json`, () => {}),
                readAsset(url, report),
            ]);
            const config = JSON.parse(new TextDecoder().decode(configBuffer)) as VoiceConfig;
            const session = await ort.InferenceSession.create(modelBuffer);
            return { config, session };
        })();
        loaded.set(voice, result);
        result.catch(() => loaded.delete(voice));
    }
    return result;
}

async function phonemize(text: string, language: string): Promise<number[]> {
    if (!phonemizer) {
        phonemizer = createPhonemizer({
            print: (data: string) => {
                try {
                    const parsed = JSON.parse(data) as { phoneme_ids?: number[] };
                    if (Array.isArray(parsed.phoneme_ids)) onPhonemes?.(parsed.phoneme_ids);
                } catch { /* Línea informativa, no JSON. */ }
            },
            printErr: (message: string) => console.error('Piper phonemizer:', message),
            locateFile: (url: string) => `${assetBase}${url.split('/').pop() ?? url}`,
        }).catch((error) => {
            phonemizer = undefined;
            throw error;
        });
    }
    const module = await phonemizer;
    const token = ++phonemeSequence;
    return new Promise<number[]>((resolve, reject) => {
        let settled = false;
        const finish = (action: () => void) => {
            if (settled) return;
            settled = true;
            onPhonemes = undefined;
            action();
        };
        onPhonemes = (ids) => {
            if (token !== phonemeSequence) return;
            finish(() => resolve(ids));
        };
        try {
            // El CLI de este build acepta el JSON de entrada como argumento de
            // `--input` (no lee de stdin) y publica un objeto por texto.
            module.callMain([
                '-l', language,
                '--input', JSON.stringify([{ text }]),
                '--espeak_data', '/espeak-ng-data',
            ]);
        } catch (error) {
            finish(() => reject(error));
            return;
        }
        finish(() => reject(new Error('La voz no pudo leer esta respuesta.')));
    });
}

/** Recorta el silencio de los extremos para que las frases encadenen sin pausas largas. */
function trimSilence(samples: Float32Array, sampleRate: number): Float32Array {
    const threshold = 0.005;
    let start = 0;
    let end = samples.length - 1;
    while (start < end && Math.abs(samples[start]) < threshold) start++;
    while (end > start && Math.abs(samples[end]) < threshold) end--;
    if (end <= start) return samples;
    const margin = Math.round(sampleRate * 0.03);
    start = Math.max(0, start - margin);
    end = Math.min(samples.length - 1, end + margin);
    return samples.subarray(start, end + 1);
}

async function handle(request: PiperRequest): Promise<void> {
    const { id, voice } = request;
    const report: Progress = (bytes, total) => post({ type: 'progress', id, loaded: bytes, total });
    try {
        if (!Object.prototype.hasOwnProperty.call(models, voice)) throw new Error('Voz no disponible.');
        if (request.type === 'preload') {
            await getVoice(voice, report);
            post({ type: 'ready', id, voice });
            return;
        }
        const { config, session } = await getVoice(voice, report);
        const ids = await phonemize(request.text, config.espeak.voice);
        if (!ids.length) throw new Error('La voz no pudo leer esta respuesta.');
        const inputs: Record<string, ort.Tensor> = {
            input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
            input_lengths: new ort.Tensor('int64', BigInt64Array.of(BigInt(ids.length)), [1]),
            scales: new ort.Tensor('float32', Float32Array.of(
                config.inference.noise_scale, config.inference.length_scale, config.inference.noise_w), [3]),
        };
        if (Object.keys(config.speaker_id_map).length) {
            inputs.sid = new ort.Tensor('int64', BigInt64Array.of(0n), [1]);
        }
        const output = await session.run(inputs);
        const samples = trimSilence(output.output.data as Float32Array, config.audio.sample_rate);
        post({ type: 'audio', id, samples, sampleRate: config.audio.sample_rate }, [samples.buffer]);
    } catch (reason) {
        post({ type: 'error', id, error: reason instanceof Error ? reason.message : 'No se pudo generar la voz.' });
    }
}

// Una sola petición a la vez: el fonemizador y la sesión ONNX no son reentrantes.
let chain: Promise<void> = Promise.resolve();
(self as unknown as DedicatedWorkerGlobalScope).onmessage = (event: MessageEvent<PiperRequest>) => {
    const request = event.data;
    chain = chain.then(() => handle(request)).catch(() => {});
};
