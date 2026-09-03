import Log from '../Log.js';
import BinaryReader from '../Buffer/BinaryReader.js';
import BinaryWriter from '../Buffer/BinaryWriter.js';
import ReaderManager from '../TypeReader.js';
import XnbError from '../XnbError.js';
import { ReaderWithExports, Type } from '../Type.js';
import { compress, decompress, flags } from 'dxt-js';
import { decode, encode } from 'fast-png';

interface Texture2D {
  format: number;
  data: Uint8Array;
  width: number;
  height: number;
}

interface Texture2DExport {
  format: number;
  filename: string;
}

export default class Texture2DReader extends ReaderWithExports<Texture2D, Texture2DExport> {
  public constructor() {
    super(new Type('Microsoft.Xna.Framework.Content.Texture2DReader'));
  }

  public override readFrom(buffer: BinaryReader, resolver: ReaderManager): Texture2D {
    const format = buffer.readInt32();
    const width = buffer.readUInt32();
    const height = buffer.readUInt32();
    const mipCount = buffer.readUInt32();

    if (mipCount > 1) {
      Log.warn(`Found mipcount of ${mipCount}, only the first will be used.`);
    }

    const dataSize = buffer.readUInt32();
    let data = buffer.readBytes(dataSize);

    if (format === 4) {
      data = decompress(data, width, height, flags.DXT1);
    } else if (format === 5) {
      data = decompress(data, width, height, flags.DXT3);
    } else if (format === 6) {
      data = decompress(data, width, height, flags.DXT5);
    } else if (format === 2) {
      throw new XnbError('Texture2D format type ECT1 not implemented!');
    } else if (format !== 0) {
      throw new XnbError(`Non-implemented Texture2D format type (${format}) found.`);
    }

    // Add the alpha channel into the image.
    for (let i = 0; i < data.length; i += 4) {
      const inverseAlpha = 255 / data[i + 3];
      data[i] = Math.min(Math.ceil(data[i] * inverseAlpha), 255);
      data[i + 1] = Math.min(Math.ceil(data[i + 1] * inverseAlpha), 255);
      data[i + 2] = Math.min(Math.ceil(data[i + 2] * inverseAlpha), 255);
    }

    return {
      format,
      data,
      width,
      height
    };
  }

  public override writeTo(buffer: BinaryWriter, content: Texture2D, manager: ReaderManager): void {
    const width = content.width;
    const height = content.height;

    buffer.writeInt32(content.format);
    buffer.writeUInt32(content.width);
    buffer.writeUInt32(content.height);
    buffer.writeUInt32(1);

    let data = content.data;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] / 255;
      data[i] = Math.floor(data[i] * alpha);
      data[i + 1] = Math.floor(data[i + 1] * alpha);
      data[i + 2] = Math.floor(data[i + 2] * alpha);
    }

    if (content.format === 4) {
      data = compress(data, width, height, flags.DXT1);
    } else if (content.format === 5) {
      data = compress(data, width, height, flags.DXT3);
    } else if (content.format === 6) {
      data = compress(data, width, height, flags.DXT5);
    }

    buffer.writeUInt32(data.length);
    buffer.writeBytes(data);
  }

  public override export(
    value: Texture2D,
    exportFile: (data: Uint8Array, extension: string) => string
  ): Texture2DExport {
    return {
      format: value.format,
      filename: exportFile(encode(value), '.png')
    };
  }

  public import(value: Texture2DExport, importFile: (filename: string) => Uint8Array): Texture2D {
    const image = decode(importFile(value.filename));
    return {
      format: value.format,
      width: image.width,
      height: image.height,
      data: new Uint8Array(image.data.buffer)
    };
  }
}
