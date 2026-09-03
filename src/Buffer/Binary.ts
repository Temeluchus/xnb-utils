/**
 * Base class for handling binary files.
 * BinaryReader and BinaryWriter inherits this class.
 */
export default abstract class Binary {
  protected constructor(buffer: Buffer) {
    this._buffer = buffer;
  }

  protected _bytePosition: number = 0;

  public get bytePosition(): number {
    return this._bytePosition;
  }

  public set bytePosition(value: number) {
    this._bytePosition = value;
  }

  protected _buffer: Buffer;

  public get buffer(): Buffer {
    return this._buffer;
  }

  public get size(): number {
    return this.buffer.length;
  }
}
