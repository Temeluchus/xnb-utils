import ReaderManager from './TypeReader.js';
import BinaryReader from './Buffer/BinaryReader.js';
import BinaryWriter from './Buffer/BinaryWriter.js';

export class Type {
  // The full name of the type.
  public readonly name: string;

  public constructor(name: string) {
    this.name = name;
  }

  public static fromString(type: string): Type {
    return new Type(type);
  }

  public equals(other: Type): boolean {
    return other.name.split(',')[0] === this.name;
  }
}

export abstract class Reader<T> {
  public readonly type: Type;

  public constructor(type: Type) {
    this.type = type;
  }

  /**
   * Reads a value from a buffer.
   * @param buffer The buffer to read from.
   * @param manager The set of readers to resolve readers from.
   * @returns The type as specified by the type reader.
   */
  public abstract readFrom(buffer: BinaryReader, manager: ReaderManager): T;

  /**
   * Writes into the buffer.
   * @param buffer The buffer to write to.
   * @param content The data to write to the stream.
   * @param manager ReaderManager to write indexes of sub-readers.
   */
  public abstract writeTo(buffer: BinaryWriter, content: T, manager: ReaderManager): void;
}

export abstract class ReaderWithExports<T, E = T> extends Reader<T> {
  /**
   * Exports read value into a format suitable for JSON serialization, if not provided, JSON.stringify will be used.
   * You should probably save this in the exported json somewhere, so you can retrieve it in `import`.
   */
  public abstract export(value: T, exportFile: (data: Uint8Array, extension: string) => string): E;

  /**
   * Imports value as exported by `export` back into read value. If not provided, JSON.parse will be used.
   */
  public abstract import(value: E, importFile: (filename: string) => Uint8Array): T;
}
