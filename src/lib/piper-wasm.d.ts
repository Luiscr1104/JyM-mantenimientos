declare module '@diffusionstudio/piper-wasm/build/piper_phonemize.js' {
    export default function createPhonemizer(options: {
        print: (data: string) => void;
        printErr: (message: string) => void;
        locateFile: (path: string) => string;
    }): Promise<{ callMain: (args: string[]) => void }>;
}
