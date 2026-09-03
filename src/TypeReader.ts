import BinaryReader from './Buffer/BinaryReader.js';
import BinaryWriter from './Buffer/BinaryWriter.js';
import XnbError from './XnbError.js';
import { Reader, Type } from './Type.js';

export default class ReaderManager {
  private readonly _readers: Reader<unknown>[];

  /**
   * Creating a new instance of ReaderManager.
   * @param readers Array of BaseReaders.
   */
  public constructor(readers: Reader<unknown>[]) {
    this._readers = readers;
  }

  /**
   * Reads XNB content annotated with the index of its reader.
   * @param buffer The buffer to read from.
   * @param expect Expected reader to resolve, throws if incorrect.
   */
  public readFrom<T>(buffer: BinaryReader, expect?: Reader<T>): T {
    // Read the index of which reader to use.
    const index = buffer.read7BitNumber() - 1;
    if (index >= this._readers.length) {
      throw new XnbError(`Invalid reader index ${index}`);
    }

    const reader = this._readers[index];
    if (typeof expect !== 'undefined' && !this._readerIs(reader, expect)) {
      throw new XnbError(`Expected reader ${expect.type.toString()}, found ${reader.type.toString()}`);
    }

    // read the buffer using the selected reader
    return reader.readFrom(buffer, this) as T;
  }

  // Writes the XNB file contents.
  public writeTo(buffer: BinaryWriter, content: unknown): void {
    // Write initial index; only readers containing other types should have to worry about this.
    buffer.write7BitNumber(1);
    this._readers[0].writeTo(buffer, content, this);
  }

  // Returns the index of the reader.
  public indexOf(reader: Reader<unknown>): number {
    const type = reader.type;
    return this._readers.findIndex((reader) => type.equals(reader.type));
  }

  // Returns a reader of a given type, or throws if it doesn't exist.
  public get(type: Type): Reader<unknown> | undefined {
    return this._readers.find((reader) => type.equals(reader.type));
  }

  public writeIndex(buffer: BinaryWriter, reader: Reader<unknown>): void {
    buffer.write7BitNumber(this.indexOf(reader) + 1);
  }

  private _readerIs<T>(reader: Reader<unknown>, other: Reader<T>): boolean {
    return reader.type.equals(other.type);
  }
}
