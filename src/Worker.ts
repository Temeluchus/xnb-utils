import BinaryReader from './Buffer/BinaryReader.js';
import BinaryWriter from './Buffer/BinaryWriter.js';
import LzxReader from './Buffer/LzxReader.js';
import XnbError from './XnbError.js';
import Log from './Log.js';
import ReaderManager from './TypeReader.js';
import SoundEffectReader from './Readers/SoundEffectReader.js';
import Texture2DReader from './Readers/Texture2DReader.js';
import SFDItemReader from './Readers/SFDItemReader.js';
import { decompress } from './Decompress.js';
import { decodeBlock, encodeBlock, encodeBound } from 'lz4';
import { Reader, Type } from './Type.js';
import SFDAnimationReader from './Readers/SFDAnimationReader.js';

/**
 * Contains list of all available readers.
 * New readers must be added here in order to work.
 */
const readers: Reader<unknown>[] = [
  new Texture2DReader(),
  new SoundEffectReader(),
  new SFDItemReader(),
  new SFDAnimationReader()
];

/**
 * Gets a Reader based on type.
 * @param type The `Type` or type string to get reader based off of.
 * @returns A Reader for the given type.
 *
 * Throws an error if no such type can be found.
 */
export function getReader(type: string | Type): Reader<unknown> | undefined {
  const parsed = typeof type === 'string' ? Type.fromString(type) : type;
  const found = readers.find((e) => e.type.equals(parsed));

  if (found === undefined) {
    throw new XnbError(`Invalid reader type '${type}' passed, unable to resolve!`);
  }

  return found;
}

// Constants.
const HIDEF_MASK = 0x1;
const COMPRESSED_LZ4_MASK = 0x40;
const COMPRESSED_LZX_MASK = 0x80;
const XNB_COMPRESSED_PROLOGUE_SIZE = 14;

interface Header {
  target: string;
  xnbVersion: number;
  hidef: boolean;
  compressed?: boolean;
  compressionType?: number;
}

interface ContentReader {
  type: string;
  version: number;
}

export interface Parsed<T> {
  header: Header;
  readers: ContentReader[];
  content: T;
}

/**
 * Unpacks an XNB file.
 * @param file The XNB file you want to load.
 * @param expect The reader used to unpack that file.
 */
export function unpack<T>(file: Buffer, expect?: Reader<T>): Parsed<T> {
  // Create a new instance of reader.
  const buffer = new LzxReader(file);

  // Validate the XNB file header.
  const { target, xnbVersion, hidef, compressed, compressionType } = parseHeader(buffer);
  Log.info('XNB file validated successfully!');

  // Read and validate the file size.
  const fileSize = buffer.readUInt32();
  if (buffer.size !== fileSize) {
    throw new XnbError('XNB file has been truncated!');
  }

  // Print out the file size.
  Log.debug(`File size: ${fileSize} bytes.`);

  // If the file is compressed then we need to decompress it.
  if (compressed) {
    // Get the decompressed size.
    const decompressedSize = buffer.readUInt32();
    Log.debug(`Uncompressed size: ${decompressedSize} bytes.`);

    // Decompress LZX format.
    if (compressionType === COMPRESSED_LZX_MASK) {
      // Get the amount of data to compress.
      const compressedTodo = fileSize - XNB_COMPRESSED_PROLOGUE_SIZE;

      // Decompress the buffer based on the file size.
      const decompressed = decompress(buffer, compressedTodo);

      // Copy the decompressed buffer into the file buffer.
      buffer.copyFrom(decompressed, XNB_COMPRESSED_PROLOGUE_SIZE, 0, decompressedSize);

      // Reset the byte seek head to read content.
      buffer.bytePosition = XNB_COMPRESSED_PROLOGUE_SIZE;
    } else if (compressionType === COMPRESSED_LZ4_MASK) {
      // Allocate buffer for LZ4 decode.
      const trimmed = buffer.buffer.subarray(XNB_COMPRESSED_PROLOGUE_SIZE);

      // Decode the trimmed buffer into decompressed buffer.
      const decompressed = Buffer.alloc(decompressedSize);
      decodeBlock(Buffer.from(trimmed), decompressed);

      // Copy the decompressed buffer into our buffer.
      buffer.copyFrom(decompressed, XNB_COMPRESSED_PROLOGUE_SIZE, 0, decompressedSize);

      // Reset the byte seek head to read content.
      buffer.bytePosition = XNB_COMPRESSED_PROLOGUE_SIZE;
    }
  }

  // NOTE: assuming the buffer is now decompressed
  // Get the 7-bit value for readers
  const count = buffer.read7BitNumber();

  // Log how many readers there are.
  Log.debug(`Readers: ${count}`);

  // A local copy of readers for the export process.
  const readers: ContentReader[] = [];

  // Loop over the number of readers we have.
  const loadedReaders: Reader<unknown>[] = [];
  for (let i = 0; i < count; i++) {
    // Read the type.
    const type = buffer.readString();

    // Read the version.
    const version = buffer.readInt32();

    // Get the reader for this type.
    const reader = getReader(type)!;

    // Add reader to the list.
    loadedReaders.push(reader);

    // Add local reader.
    readers.push({ type, version });
  }

  // Get the 7-bit value for shared resources.
  const shared = buffer.read7BitNumber();

  // Log the shared resources count.
  Log.debug(`Shared Resources: ${shared}`);

  // Don't accept shared resources since SDV XNB files don't have any.
  if (shared !== 0) {
    throw new XnbError(`Unexpected (${shared}) shared resources.`);
  }

  // Create content reader from the readers loaded.
  const content = new ReaderManager(loadedReaders);

  // Read the content in.
  const result = content.readFrom(buffer, expect);

  // Return the loaded XNB file.
  Log.info('Successfully read XNB file!');
  return {
    header: {
      target,
      xnbVersion,
      hidef,
      compressed
    },
    readers,
    content: result
  };
}

/**
 * Packs a file to the XNB format.
 * @param json The file to pack.
 */
export function pack(json: Parsed<unknown>): Buffer {
  // The output buffer for this file.
  const buffer = new BinaryWriter(Buffer.byteLength(JSON.stringify(json)));

  // Set the header information.
  const target = json.header.target;
  const xnbVersion = json.header.xnbVersion;
  const hidef = json.header.hidef;
  const lz4Compression = target === 'a' || target === 'i';
  const compressed = lz4Compression; // Support android LZ4 compression.

  // Write the header into the buffer.
  const encoder = new TextEncoder();
  buffer.writeBytes(encoder.encode('XNB'));
  buffer.writeBytes(encoder.encode(target));
  buffer.writeByte(xnbVersion);

  // Write the LZ4 mask for android compression only.
  buffer.writeByte(hidef ? 1 : 0 | (compressed && lz4Compression ? COMPRESSED_LZ4_MASK : 0));

  // Write temporary filesize.
  buffer.writeUInt32(0);

  // Write the decompression size temporarily if android.
  if (lz4Compression) {
    buffer.writeUInt32(0);
  }

  // Write the amount of readers.
  buffer.write7BitNumber(json.readers.length);

  // Loop over the readers and load the types.
  const readers: Reader<unknown>[] = [];
  for (let reader of json.readers) {
    readers.push(getReader(reader.type)!);
    buffer.writeString(reader.type);
    buffer.writeUInt32(reader.version);
  }

  // Write 0 shared resources.
  buffer.write7BitNumber(0);

  // Create reader resolver for content and write it.
  const content = new ReaderManager(readers);

  // Write the content to the reader resolver.
  content.writeTo(buffer, json.content);

  // Trim excess space in the buffer.
  buffer.trim();

  // LZ4 compression.
  if (lz4Compression) {
    // Create buffer with just the content.
    const contentBuffer = Buffer.alloc(buffer.bytePosition - XNB_COMPRESSED_PROLOGUE_SIZE);

    // Copy the content from the main buffer into the content buffer.
    buffer.buffer.copy(contentBuffer, 0, XNB_COMPRESSED_PROLOGUE_SIZE);

    // Create a buffer for the compressed data.
    let compressed = Buffer.alloc(encodeBound(contentBuffer.length));

    // Compress the data into the buffer.
    const compressedSize = encodeBlock(contentBuffer, compressed);

    // Slice off anything extra.
    compressed = compressed.subarray(0, compressedSize);

    // Write the decompressed size into the buffer.
    buffer.buffer.writeUInt32LE(contentBuffer.length, 10);

    // Write the file size into the buffer.
    buffer.buffer.writeUInt32LE(XNB_COMPRESSED_PROLOGUE_SIZE + compressedSize, 6);

    // Create a new return buffer.
    let returnBuffer = Buffer.from(buffer.buffer);

    // Splice in the content into the return buffer.
    compressed.copy(returnBuffer, XNB_COMPRESSED_PROLOGUE_SIZE, 0);

    // Slice off the excess.
    returnBuffer = returnBuffer.subarray(0, XNB_COMPRESSED_PROLOGUE_SIZE + compressedSize);

    // Return the buffer.
    return returnBuffer;
  }

  // Write the file size into the buffer.
  buffer.buffer.writeUInt32LE(buffer.bytePosition, 6);

  // Return the buffer.
  return buffer.buffer;
}

/**
 * Ensures the XNB header is valid.
 * @param buffer Buffer to read the header.
 * @returns The header file if valid.
 */
function parseHeader(buffer: BinaryReader): Header {
  // Get the magic from the beginning of the file.
  const magic = buffer.readChars(3);

  // Check if the magic header is correct.
  if (magic !== 'XNB') {
    throw new XnbError(`Invalid file magic found, expecting 'XNB', found '${magic}'`);
  }

  // Load the target platform.
  Log.debug('Valid XNB magic found!');
  const target = buffer.readChars(1).toLowerCase();

  // Read the target platform.
  switch (target) {
    case 'w':
      Log.debug('Target platform: Microsoft Windows');
      break;
    case 'm':
      Log.debug('Target platform: Windows Phone 7');
      break;
    case 'x':
      Log.debug('Target platform: Xbox 360');
      break;
    case 'a':
      Log.debug('Target platform: Android');
      break;
    case 'i':
      Log.debug('Target platform: iOS');
      break;
    default:
      Log.warn(`Invalid target platform '${target}' found.`);
      break;
  }

  // Read the XNB format version.
  const xnbVersion = buffer.readByte();
  switch (xnbVersion) {
    case 0x3:
      Log.debug('XNB Format Version: XNA Game Studio 3.0');
      break;
    case 0x4:
      Log.debug('XNB Format Version: XNA Game Studio 3.1');
      break;
    case 0x5:
      Log.debug('XNB Format Version: XNA Game Studio 4.0');
      break;
    default:
      Log.warn(`XNB Format Version ${Log.toHex(xnbVersion)} unknown.`);
      break;
  }

  // Read the flag bits.
  const flags = buffer.readByte();

  // Get the HiDef flag.
  const hidef = (flags & HIDEF_MASK) !== 0;

  // Get the compressed flag.
  const compressed = (flags & COMPRESSED_LZX_MASK || flags & COMPRESSED_LZ4_MASK) !== 0;

  // Set the compression type.
  const compressionType =
    (flags & COMPRESSED_LZX_MASK) !== 0 ? COMPRESSED_LZX_MASK : flags & COMPRESSED_LZ4_MASK ? COMPRESSED_LZ4_MASK : 0;

  // Debug content information.
  Log.debug(`Content: ${hidef ? 'HiDef' : 'Reach'}`);
  Log.debug(`Compressed: ${compressed}, ${compressionType === COMPRESSED_LZX_MASK ? 'LZX' : 'LZ4'}`);

  return { target, xnbVersion, hidef, compressed, compressionType };
}
