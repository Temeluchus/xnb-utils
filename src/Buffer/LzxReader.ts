import BinaryReader from './BinaryReader.js';

/**
 * Special class for reading Lzx data.
 * Used when decompressing xnb files.
 */
export default class LzxReader extends BinaryReader {
  private _bitOffset: number = 0;

  public get bitOffset(): number {
    return this._bitOffset;
  }

  public set bitOffset(offset: number) {
    // When rewinding, reset it back to.
    if (offset < 0) offset = 16 - offset;

    // Set the offset and clamp to 16-bit frame.
    this._bitOffset = offset % 16;

    // Get byte seek for bit ranges that wrap past 16-bit frames.
    const byteSeek = ((offset - (Math.abs(offset) % 16)) / 16) * 2;

    // Seek ahead for overflow on 16-bit frames.
    this.bytePosition += byteSeek;
  }

  // Reads bits used for LZX compression.
  public readLZXBits(bits: number): number {
    let bitsLeft = bits;
    let read = 0;

    // Read bits in 16-bit chunks.
    while (bitsLeft > 0) {
      const peek = this._peek(2).readUInt16LE();

      // Clamp bits into the 16-bit frame we have left only read in as much as we have left.
      const bitsInFrame = Math.min(Math.max(bitsLeft, 0), 16 - this.bitOffset);

      // Set the offset based on current position in and bits count.
      const offset = 16 - this.bitOffset - bitsInFrame;

      // Create mask and shift the mask up to the offset <<.
      // Then shift the return back down into mask space >>.
      const value = (peek & ((2 ** bitsInFrame - 1) << offset)) >> offset;

      // Remove the bits we read from what we have left.
      bitsLeft -= bitsInFrame;

      // Add the bits read to the bit position.
      this.bitOffset += bitsInFrame;

      // Assign read with the value shifted over for reading in loops.
      read |= value << bitsLeft;
    }

    // Return the read bits.
    return read;
  }

  /**
   * Used to peek bits.
   * Basically read some data without advancing the buffer.
   * @param bits The number of bits to peek.
   */
  public peekLZXBits(bits: number): number {
    // Get the current bit position to store.
    const bitPosition = this.bitOffset;

    // Get the current byte position to store.
    const bytePosition = this.bytePosition;

    // Read the bits like normal.
    const read = this.readLZXBits(bits);

    // Just rewind the bit position, this will also rewind bytes where needed.
    this.bitOffset = bitPosition;

    // Restore the byte position.
    this.bytePosition = bytePosition;

    return read;
  }

  /**
   * Reads a 16-bit integer from a LZX bitstream
   *
   * Bytes are reverse as the bitstream sequences 16-bit integers stored as LSB -> MSB (bytes).
   * abc[...]xyzABCDEF as bits would be stored as:
   * [ijklmnop][abcdefgh][yzABCDEF][qrstuvwx].
   *
   * @param seek Whether to update the seek position
   */
  public readLZXInt16(seek: boolean = true): number {
    // Read in the next two bytes worth of data.
    const lsB = this.readByte();
    const msB = this.readByte();

    // Rewind the seek head.
    if (!seek) {
      this.bytePosition += -2;
    }

    return (lsB << 8) | msB;
  }

  // Aligns to 16-bit offset.
  public align(): void {
    if (this.bitOffset > 0) {
      this.bitOffset += 16 - this.bitOffset;
    }
  }
}
