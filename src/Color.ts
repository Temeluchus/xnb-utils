import BinaryReader from './Buffer/BinaryReader.js';

export default class Color {
  public red: number;
  public green: number;
  public blue: number;
  public alpha: number;
  public packedValue?: number;

  public constructor(red: number = 0, green: number = 0, blue: number = 0, alpha: number = 0, packedValue?: number) {
    this.red = red;
    this.green = green;
    this.blue = blue;
    this.alpha = alpha;
  }

  public static fromBuffer(buffer: BinaryReader): Color {
    const red = buffer.readByte();
    const green = buffer.readByte();
    const blue = buffer.readByte();
    const alpha = buffer.readByte();

    return new Color(red, green, blue, alpha);
  }

  public toBuffer(): Uint8Array {
    return Uint8Array.of(this.red, this.green, this.blue, this.alpha);
  }

  public static toArray(data: Color[]): Uint8Array {
    const values: number[] = [];
    let i = 0;
    for (const color of data) {
      values[i++] = color.red;
      values[i++] = color.green;
      values[i++] = color.blue;
      values[i++] = color.alpha;
    }

    return Uint8Array.from(values);
  }

  public static fromArray(data: Uint8Array, index: number): Color {
    const red = data[index]; // r
    const green = data[index + 1]; // g
    const blue = data[index + 2]; // b
    const alpha = data[index + 3]; // a

    return new Color(red, green, blue, alpha);
  }
}

export function isSameColor(first: Color, second: Color): boolean {
  return (
    first.red === second.red &&
    first.green === second.green &&
    first.blue === second.blue &&
    first.alpha === second.alpha
  );
}
