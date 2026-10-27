declare module "gifenc" {
  type Palette = number[][];

  export function GIFEncoder(): {
    writeFrame(
      buffer: Uint8Array | Uint8ClampedArray,
      width: number,
      height: number,
      options?: { palette?: Palette; delay?: number; repeat?: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  };

  export function quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number): Palette;
  export function applyPalette(data: Uint8Array | Uint8ClampedArray, palette: Palette): Uint8Array;
}
