import Binary from './Binary.js';

/**
 * Helper class to write raw data in binary files.
 * Provides functions to write any kind of data in a more comfortable way.
 */
export default class BinaryWriter extends Binary {
  public constructor(size: number = 0) {
    super(Buffer.alloc(size));
  }

  /**
   * Trim the buffer to the byte position.
   * This is used to remove all the unused space allocated in the buffer.
   */
  public trim(): void {
    const tempBuffer = Buffer.alloc(this._bytePosition);
    this._buffer.copy(tempBuffer, 0, 0, this._bytePosition);
    this._buffer = tempBuffer;
  }

  // Allocates number of bytes into the buffer and assigns more space if needed.
  public alloc(bytes: number): BinaryWriter {
    if (this._buffer.length <= this._bytePosition + bytes) {
      const tempBuffer = Buffer.alloc(this._buffer.length + bytes);
      this._buffer.copy(tempBuffer, 0);
      this._buffer = tempBuffer;
    }

    return this;
  }

  // Merge two buffers.
  public concat(buffer: Buffer): void {
    this.trim();
    this._buffer = Buffer.concat([this._buffer, buffer]);
    this._bytePosition += buffer.length;
  }

  public writeString(value: string): void {
    this.write7BitNumber(value.length);
    this.alloc(value.length).buffer.write(value, this._bytePosition);
    this._bytePosition += value.length;
  }

  public writeChars(value: string): void {
    this.alloc(value.length).buffer.write(value, this._bytePosition);
    this._bytePosition += value.length;
  }

  public writeChar(value: string): void {
    const length = value.length;
    if (length !== 1) {
      throw new Error(`Expected 1, got ${length}.`);
    }

    this.alloc(length).buffer.write(value, this._bytePosition);
    this._bytePosition += length;
  }

  // NOTE: Byte and UInt8 is the same type.
  public writeByte(value: number): void {
    this.alloc(1).buffer.writeUInt8(value, this._bytePosition);
    this._bytePosition++;
  }

  public writeInt8(value: number): void {
    this.alloc(1).buffer.writeInt8(value, this._bytePosition);
    this._bytePosition++;
  }

  public writeInt16(value: number): void {
    this.alloc(2).buffer.writeInt16LE(value, this._bytePosition);
    this._bytePosition += 2;
  }

  public writeBytes(value: Uint8Array): void {
    this.alloc(value.length).buffer.set(value, this._bytePosition);
    this._bytePosition += value.length;
  }

  public writeUInt16(value: number): void {
    this.alloc(2).buffer.writeUInt16LE(value, this._bytePosition);
    this._bytePosition += 2;
  }

  public writeInt32(value: number): void {
    this.alloc(4).buffer.writeInt32LE(value, this._bytePosition);
    this._bytePosition += 4;
  }

  public writeUInt32(value: number): void {
    this.alloc(4).buffer.writeUInt32LE(value, this._bytePosition);
    this._bytePosition += 4;
  }

  public writeSingle(value: number): void {
    this.alloc(4).buffer.writeFloatLE(value, this._bytePosition);
    this._bytePosition += 4;
  }

  public writeDouble(value: number): void {
    this.alloc(4).buffer.writeDoubleLE(value, this._bytePosition);
    this._bytePosition += 4;
  }

  public writeBoolean(value: boolean): void {
    this.writeByte(value ? 1 : 0);
  }

  public write7BitNumber(value: number): void {
    this.alloc(2);
    do {
      let byte = value & 0x7f;
      value = value >> 7;
      if (value) byte |= 0x80;
      this.buffer.writeUInt8(byte, this._bytePosition);
      this._bytePosition++;
    } while (value);
  }
}
