declare module 'zstd-codec' {
  interface ZstdSimple {
    compress(data: Uint8Array, level?: number): Uint8Array;
    decompress(data: Uint8Array): Uint8Array;
  }

  interface ZstdStreaming {
    compress(data: Uint8Array, level?: number): Uint8Array;
    decompress(data: Uint8Array, sizeHint?: number): Uint8Array;
  }

  interface ZstdInstance {
    Simple: new () => ZstdSimple;
    Streaming: new () => ZstdStreaming;
  }

  export const ZstdCodec: {
    run(callback: (zstd: ZstdInstance) => void): void;
  };
}
