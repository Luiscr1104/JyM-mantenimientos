// Copia los binarios de Piper/ONNX a public/piper para servirlos desde el mismo
// origen: así el service worker los cachea y la voz funciona sin depender de un CDN.
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'public', 'piper');
const assets = [
    ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.wasm'],
    ['node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.wasm', 'piper_phonemize.wasm'],
    ['node_modules/@diffusionstudio/piper-wasm/build/piper_phonemize.data', 'piper_phonemize.data'],
];

await mkdir(target, { recursive: true });
for (const [origin, name] of assets) {
    try {
        const source = join(root, origin);
        const destination = join(target, name);
        const [from, to] = await Promise.all([
            stat(source),
            stat(destination).catch(() => null),
        ]);
        if (to?.size === from.size) continue;
        await copyFile(source, destination);
        console.log(`Piper: ${name} copiado a public/piper.`);
    } catch (error) {
        console.error(`Piper: no se pudo copiar ${name}.`, error);
        process.exitCode = 1;
    }
}
