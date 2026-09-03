import Log from './Log.js';
import Lzx from './Lzx.js';
import LzxReader from './Buffer/LzxReader.js';
import XnbError from './XnbError.js';

/**
 * Decompress a certain amount of bytes.
 * @param buffer The BinaryReader from which to read.
 * @param compressedTodo The number of bytes to decompress.
 */
export function decompress(buffer: LzxReader, compressedTodo: number): Buffer {
  let pos: number = 0;

  let blockSize: number;
  let frameSize: number;

  // Create the LZX instance with 16-bit window frame.
  const lzx: Lzx = new Lzx(16);

  // The full decompressed array.
  let decompressed: number[] = [];

  // Loop over the bytes left.
  while (pos < compressedTodo) {
    // Flag is for determining if frame_size is fixed or not.
    const flag = buffer.readByte();

    // If flag is set to 0xFF that means we will read in frame size.
    if (flag === 0xff) {
      // Read in the frame size.
      frameSize = buffer.readLZXInt16();

      // Read in the block size.
      blockSize = buffer.readLZXInt16();

      // Advance the byte position forward.
      pos += 5;
    } else {
      // Rewind the buffer.
      buffer.bytePosition -= 1;

      // Read in the block size.
      blockSize = buffer.readLZXInt16();

      // Set the frame size.
      frameSize = 0x8000;

      // Advance byte position forward.
      pos += 2;
    }

    // Ensure the block and frame size aren't empty.
    if (blockSize === 0 || frameSize === 0) {
      break;
    }

    // Ensure the block and frame size don't exceed size of integers.
    if (blockSize > 0x10000 || frameSize > 0x10000) {
      throw new XnbError('Invalid size read in compression content.');
    }

    // Decompress the file based on frame and block size.
    Log.debug(`Block Size: ${blockSize}, Frame Size: ${frameSize}`);
    decompressed = decompressed.concat(lzx.decompress(buffer, frameSize, blockSize));

    // Increase buffer position.
    pos += blockSize;
  }

  // We have finished decompressing the file.
  Log.info('File has been successfully decompressed!');
  return Buffer.from(decompressed);
}
