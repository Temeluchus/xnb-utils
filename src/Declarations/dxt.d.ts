declare module 'dxt-js' {
  export function decompress(inputData: Uint8Array, width: number, height: number, flags: number): Uint8Array;

  export function compress(inputData: Uint8Array, width: number, height: number, flags: number): Uint8Array;

  export enum flags {
    DXT1 = 1 << 0,
    DXT3 = 1 << 1,
    DXT5 = 1 << 2,
    ColourIterativeClusterFit = 1 << 8,
    ColourClusterFit = 1 << 3,
    ColourRangeFit = 1 << 4,
    ColourMetricPerceptual = 1 << 5,
    ColourMetricUniform = 1 << 6,
    WeightColourByAlpha = 1 << 7
  }
}
