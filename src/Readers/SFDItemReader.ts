import BinaryReader from '../Buffer/BinaryReader.js';
import BinaryWriter from '../Buffer/BinaryWriter.js';
import ReaderManager from '../TypeReader.js';
import Color, { isSameColor } from '../Color.js';
import { decode, encode } from 'fast-png';
import { ReaderWithExports, Type } from '../Type.js';
import XnbError from '../XnbError.js';

interface ItemPart {
  textures: (Texture | undefined)[];
  type: number;
}

interface ExportItemPart {
  textures: (string | undefined)[];
  type: number;
}

interface Texture {
  width: number;
  height: number;
  data: Uint8Array;
}

interface SFDItem {
  gameName: string;
  fileName: string;
  equipmentLayer: number;
  id: string;
  jacketUnderBelt: boolean;
  canEquip: boolean;
  canScript: boolean;
  colorPalette: string;
  width: number;
  height: number;
  parts: ItemPart[];
}

interface SFDItemExport {
  gameName: string;
  fileName: string;
  equipmentLayer: number;
  id: string;
  jacketUnderBelt: boolean;
  canEquip: boolean;
  canScript: boolean;
  colorPalette: string;
  width: number;
  height: number;
  parts: ExportItemPart[];
}

export default class SFDItemReader extends ReaderWithExports<SFDItem, SFDItemExport> {
  public constructor() {
    super(new Type('SFD.Content.ItemsContentTypeReader'));
  }

  public override readFrom(buffer: BinaryReader, manager: ReaderManager): SFDItem {
    const fileName = buffer.readString();
    const gameName = buffer.readString();
    const equipmentLayer = buffer.readInt32();
    const id = buffer.readString();
    const jacketUnderBelt = buffer.readBoolean();
    const canEquip = buffer.readBoolean();
    const canScript = buffer.readBoolean();
    const colorPalette = buffer.readString();
    const width = buffer.readInt32();
    const height = buffer.readInt32();

    const colorsCount = buffer.readByte();
    const dynamicColorTable: Color[] = [];

    for (let i = 0; i < colorsCount; i++) {
      dynamicColorTable.push(Color.fromBuffer(buffer));
    }

    const outerLoop = buffer.readInt32();
    buffer.readChar();
    const parts: ItemPart[] = [];

    for (let i = 0; i < outerLoop; i++) {
      const type = buffer.readInt32();
      const innerLoop = buffer.readInt32();
      const size = width * height;
      const textures: (Texture | undefined)[] = [];

      for (let j = 0; j < innerLoop; j++) {
        if (buffer.readBoolean()) {
          let color: Color = new Color();
          const data: Color[] = [];
          let emptyImage = true;

          for (let k = 0; k < size; k++) {
            if (buffer.readBoolean()) {
              data[k] = new Color(color.red, color.blue, color.green, color.alpha);
            } else {
              data[k] = color = dynamicColorTable[buffer.readByte()];
              emptyImage = false;
            }
          }

          buffer.readChar();

          if (emptyImage) {
            textures[j] = undefined;
          } else {
            textures[j] = { data: Color.toArray(data), height, width };
          }
        } else {
          textures[j] = undefined;
        }
      }

      parts[i] = {
        textures,
        type
      };
    }

    return {
      canEquip,
      canScript,
      colorPalette,
      equipmentLayer,
      fileName,
      gameName,
      id,
      jacketUnderBelt,
      parts,
      width,
      height
    };
  }

  public override writeTo(buffer: BinaryWriter, content: SFDItem, manager: ReaderManager): void {
    buffer.writeString(content.fileName);
    buffer.writeString(content.gameName);
    buffer.writeInt32(content.equipmentLayer);
    buffer.writeString(content.id);
    buffer.writeBoolean(content.jacketUnderBelt);
    buffer.writeBoolean(content.canEquip);
    buffer.writeBoolean(content.canScript);
    buffer.writeString(content.colorPalette);
    buffer.writeInt32(content.width);
    buffer.writeInt32(content.height);

    const dynamicColorTable: Color[] = [];
    for (let i = 0; i < content.parts.length; i++) {
      for (let j = 0; j < content.parts[i].textures.length; j++) {
        if (content.parts[i].textures[j] !== undefined) {
          for (let k = 0; k < content.parts[i].textures[j]!.data.length; k += 4) {
            const color = Color.fromArray(content.parts[i].textures[j]!.data, k);
            if (!dynamicColorTable.find((c) => isSameColor(c, color))) {
              dynamicColorTable.push(color);
            }
          }
        }
      }
    }

    buffer.writeByte(dynamicColorTable.length);

    for (let i = 0; i < dynamicColorTable.length; i++) {
      buffer.writeBytes(dynamicColorTable[i].toBuffer());
    }

    buffer.writeInt32(content.parts.length);
    buffer.writeChar('\n');

    for (let i = 0; i < content.parts.length; i++) {
      buffer.writeInt32(content.parts[i].type);
      buffer.writeInt32(content.parts[i].textures.length);

      for (let j = 0; j < content.parts[i].textures.length; j++) {
        if (content.parts[i].textures[j] !== undefined) {
          buffer.writeBoolean(true);
          // let num1 = content.parts[i].textures[j]!.data[0];
          // if (num1 >= 255) num1 = 0;
          // let color: Color = new Color(num1, 0, 0, 0);

          let color: Color = new Color();

          for (let k = 0; k < content.parts[i].textures[j]!.data.length; k += 4) {
            const color3 = Color.fromArray(content.parts[i].textures[j]!.data, k);
            if (isSameColor(color3, color)) {
              buffer.writeBoolean(true);
            } else {
              buffer.writeBoolean(false);
              const num2 = dynamicColorTable.findIndex((c) => isSameColor(c, color3));
              if (num2 === -1) {
                throw new XnbError(
                  `ItemsContentTypeWrite: Color at ${content.parts[i].textures[j]} is not inside color table`
                );
              }
              buffer.writeByte(num2);
              color = color3;
            }
          }
          buffer.writeChar('\n');
        } else {
          buffer.writeBoolean(false);
        }
      }
    }
  }

  public override export(value: SFDItem, exportFile: (data: Uint8Array, extension: string) => string): SFDItemExport {
    let exportedFiles: ExportItemPart[] = [];
    let count: number = 0;
    for (const part of value.parts) {
      let files: (string | undefined)[] = [];
      for (const texture of part.textures) {
        if (texture) {
          const png = encode(texture);
          files.push(exportFile(png, `_${part.type}_${++count}.png`));
        } else {
          files.push(undefined);
        }
      }

      exportedFiles[part.type] = {
        textures: files,
        type: part.type
      };
    }

    return {
      canEquip: value.canEquip,
      canScript: value.canScript,
      colorPalette: value.colorPalette,
      equipmentLayer: value.equipmentLayer,
      fileName: value.fileName,
      gameName: value.gameName,
      height: value.height,
      width: value.width,
      id: value.id,
      jacketUnderBelt: value.jacketUnderBelt,
      parts: exportedFiles
    };
  }

  public override import(value: SFDItemExport, importFile: (filename: string) => Uint8Array): SFDItem {
    let exportedFiles: ItemPart[] = [];
    for (const part of value.parts) {
      let textures: (Texture | undefined)[] = [];
      for (const texture of part.textures) {
        if (texture) {
          const png = decode(importFile(texture));
          textures.push({
            data: new Uint8Array(png.data.buffer),
            height: png.height,
            width: png.width
          });
        } else {
          textures.push(undefined);
        }
      }

      exportedFiles[part.type] = {
        textures: textures,
        type: part.type
      };
    }

    return {
      canEquip: value.canEquip,
      canScript: value.canScript,
      colorPalette: value.colorPalette,
      equipmentLayer: value.equipmentLayer,
      fileName: value.fileName,
      gameName: value.gameName,
      height: value.height,
      width: value.width,
      id: value.id,
      jacketUnderBelt: value.jacketUnderBelt,
      parts: exportedFiles
    };
  }
}
