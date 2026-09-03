import BinaryReader from '../Buffer/BinaryReader.js';
import BinaryWriter from '../Buffer/BinaryWriter.js';
import { ReaderWithExports, Type } from '../Type.js';
import ReaderManager from '../TypeReader.js';
import XnbError from '../XnbError.js';

interface SoundEffect {
  formatSize: number;
  format: Uint8Array;
  dataSize: number;
  data: Uint8Array;
}

interface SoundEffectExport {
  filename: string;
}

export default class SoundEffectReader extends ReaderWithExports<SoundEffect, SoundEffectExport> {
  public constructor() {
    super(new Type('Microsoft.Xna.Framework.Content.SoundEffectReader'));
  }

  public override readFrom(buffer: BinaryReader, resolver: ReaderManager): SoundEffect {
    const formatSize = buffer.readUInt32();
    const format = buffer.readBytes(formatSize);
    // const format = buffer.peekBytes(16);
    // buffer.bytePosition += formatSize;
    const dataSize = buffer.readUInt32();
    const data = buffer.readBytes(dataSize);
    // const loopStart = buffer.readInt32();
    // const loopLength = buffer.readInt32();
    // const duration = buffer.readInt32();

    if (formatSize !== 18) {
      throw new XnbError('Audio format not supported.');
    }

    return {
      format,
      formatSize,
      data,
      dataSize
    };
  }

  public override writeTo(buffer: BinaryWriter, content: SoundEffect, manager: ReaderManager): void {
    buffer.writeUInt32(content.formatSize); // Format size.
    buffer.writeBytes(content.format);
    buffer.writeUInt32(content.dataSize);
    buffer.writeBytes(content.data);

    // Necessary to work, can be 0.
    buffer.writeInt32(0); // Loop Start.
    buffer.writeInt32(0); // Loop Length.
    buffer.writeInt32(0); // Duration.
  }

  public override export(
    value: SoundEffect,
    exportFile: (data: Uint8Array, extension: string) => string
  ): SoundEffectExport {
    // For more information about the specifications, consider visiting:
    // https://isip.piconepress.com/projects/speech/software/tutorials/production/fundamentals/v1.0/section_02/s02_01_p05.html.

    const size = value.data.length + value.format.length + 5 * 4; // File size.
    const binaryWriter = new BinaryWriter(0);
    binaryWriter.writeChars('RIFF'); // RIFF file description header.
    binaryWriter.writeInt32(size - 8); // The file size LESS 8 bytes.
    binaryWriter.writeChars('WAVE'); // The ascii text string WAVE.
    binaryWriter.writeChars('fmt '); // The ascii text string 'fmt ' (note the trailing space).

    // Get more info from format header.
    const binaryReader = new BinaryReader(value.format);
    const wavTypeFormat = binaryReader.readBytes(2);
    const flags = binaryReader.readBytes(2);
    const sampleRate = binaryReader.readInt32();
    const bytesPerSec = binaryReader.readInt32();
    const blockAlignment = binaryReader.readBytes(2);
    const bitsPerSample = binaryReader.readBytes(2);

    binaryWriter.writeInt32(value.formatSize); // The size of the WAV type format.
    binaryWriter.writeBytes(wavTypeFormat); // This is a PCM header, or a value of 0x01.
    binaryWriter.writeBytes(flags); // Mono or Stereo flags.
    binaryWriter.writeInt32(sampleRate); // Self-explanatory
    binaryWriter.writeInt32(bytesPerSec); // Self-explanatory
    binaryWriter.writeBytes(blockAlignment); // Self-explanatory
    binaryWriter.writeBytes(bitsPerSample); // Self-explanatory

    if (value.formatSize === 18) {
      binaryWriter.writeByte(0);
      binaryWriter.writeByte(0);
    }

    binaryWriter.writeChars('data'); // Start of audio data
    binaryWriter.writeInt32(value.dataSize); // Size of audio data
    binaryWriter.writeBytes(value.data); // Audio data

    return {
      filename: exportFile(binaryWriter.buffer, '.wav')
    };
  }

  public override import(value: SoundEffectExport, importFile: (filename: string) => Uint8Array): SoundEffect {
    const audio = new BinaryReader(importFile(value.filename));
    audio.bytePosition += 16;
    const formatSize = audio.readUInt32();
    const format = audio.readBytes(formatSize);
    audio.bytePosition += 4; // 'data'
    const dataSize = audio.readInt32();
    const data = audio.readBytes(dataSize);

    return {
      data,
      dataSize,
      format,
      formatSize
    };
  }
}
