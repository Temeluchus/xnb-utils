import Binary from './Binary.js';
import XnbError from '../XnbError.js';

/**
 * Helper class to read raw data from binary files.
 * Provides functions to read any kind of data in a more comfortable way.
 */
export default class BinaryReader extends Binary {
  public constructor(buffer: Buffer | Uint8Array | string) {
    if (buffer instanceof Buffer) {
      super(buffer);
    } else {
      super(Buffer.from(buffer));
    }
  }

  // Writes another buffer into this buffer.
  public copyFrom(
    buffer: Buffer,
    targetIndex: number = 0,
    sourceIndex: number = 0,
    length: number = buffer.length
  ): void {
    // We need to resize the buffer to fit the contents.
    if (this.buffer.length < length + targetIndex) {
      // Create a temporary buffer of the new size.
      const tempBuffer = Buffer.alloc(this.buffer.length + (length + targetIndex - this.buffer.length));

      // Copy our buffer into the temp buffer.
      this.buffer.copy(tempBuffer);

      // Copy the buffer given into the temp buffer.
      buffer.copy(tempBuffer, targetIndex, sourceIndex, length);

      // Assign our buffer to the temporary buffer.
      this._buffer = tempBuffer;
    } else {
      // Copy the buffer into our buffer.
      buffer.copy(this.buffer, targetIndex, sourceIndex, length);
    }
  }

  // NOTE: Byte and UInt8 is the same type.
  public readByte(): number {
    return this._read(1).readUInt8();
  }

  public readBoolean(): boolean {
    return Boolean(this.readByte());
  }

  public readBytes(count: number): Uint8Array {
    return this._read(count);
  }

  public readInt8(): number {
    return this._read(1).readInt8();
  }

  public readUInt16(): number {
    return this._read(2).readUint16LE();
  }

  public readUInt32(): number {
    return this._read(4).readUint32LE();
  }

  public readInt16(): number {
    return this._read(2).readInt16LE();
  }

  public readInt32(): number {
    return this._read(4).readInt32LE();
  }

  public readSingle(): number {
    return this._read(4).readFloatLE();
  }

  public readDouble(): number {
    return this._read(4).readDoubleLE();
  }

  public readChars(count: number): string {
    return this._read(count).toString();
  }

  public readChar(): string {
    return this._read(1).toString();
  }

  public readString(): string {
    const length = this.read7BitNumber();
    return this.readBytes(length).toString();
  }

  public peekBytes(value: number): Uint8Array {
    return this._peek(value);
  }

  public peekByte(): number {
    return this._peek(1).readUInt8();
  }

  public peekInt8(): number {
    return this._peek(1).readInt8();
  }

  public peekUInt16(): number {
    return this._peek(2).readUInt16LE();
  }

  public peekUInt32(): number {
    return this._peek(4).readUInt32LE();
  }

  public peekInt16(): number {
    return this._peek(2).readInt16LE();
  }

  public peekInt32(): number {
    return this._peek(4).readInt32LE();
  }

  public peekSingle(): number {
    return this._peek(4).readFloatLE();
  }

  public peekDouble(): number {
    return this._peek(4).readDoubleLE();
  }

  public peekString(count: number): string {
    return this._peek(count).toString();
  }

  public peekChar(): string {
    return this._peek(1).toString();
  }

  public read7BitNumber(): number {
    let result = 0;
    let bitsRead = 0;
    let value: number;

    do {
      value = this.readByte();
      result |= (value & 0x7f) << bitsRead;
      bitsRead += 7;
    } while (value & 0x80);

    return result;
  }

  /**
   * Seeks to a specific index in the buffer.
   * In other terms it advances the buffer, so it will read new data in next calls.
   * This function is usually called after calling any read method.
   */
  protected _seek(index: number, origin: number = this._bytePosition): number {
    const offset = this._bytePosition;
    // this._offset = Math.max(origin + Number.parseInt(index), 0);
    this._bytePosition = Math.max(origin + index, 0);
    if (this._bytePosition < 0 || this._bytePosition > this.buffer.length) {
      throw new XnbError(`Buffer seek out of bounds! ${this._bytePosition} ${this.buffer.length}`);
    }

    return this._bytePosition - offset;
  }

  protected _read(count: number, seek: boolean = true): Buffer {
    const buffer = this.buffer.subarray(this._bytePosition, this._bytePosition + count);

    // Advance seek offset if reading normally (not peeking).
    if (seek) {
      this._seek(count);
    }

    return buffer;
  }

  /**
   * Peeks ahead to the buffer without seeking it.
   * Basically it reads new data without advancing the buffer.
   */
  protected _peek(count: number): Buffer {
    return this._read(count, false);
  }
}
