import BinaryReader from '../Buffer/BinaryReader.js';
import BinaryWriter from '../Buffer/BinaryWriter.js';
import ReaderManager from '../TypeReader.js';
import { Reader, Type } from '../Type.js';

interface Vector2 {
  x: number;
  y: number;
}

interface AnimationCollisionData {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AnimationPartData {
  globalId: number;
  localId: number;
  x: number;
  y: number;
  rotation: number;
  flip: number;
  scale: Vector2;
  postfix: string;
  type: number;
}

interface AnimationFrameData {
  parts: AnimationPartData[];
  collisions: AnimationCollisionData[];
  event: string;
  isRecoil: boolean;
  time: number;
}

interface AnimationData {
  name: string;
  frames: AnimationFrameData[];
}

export default class SFDItemReader extends Reader<AnimationData[]> {
  public constructor() {
    super(new Type('SFD.Content.AnimationsContentTypeReader'));
  }

  public override readFrom(buffer: BinaryReader, manager: ReaderManager): AnimationData[] {
    const animationDataLength = buffer.readInt32();
    const animationData: AnimationData[] = new Array<AnimationData>(animationDataLength);

    for (let i = 0; i < animationDataLength; i++) {
      const animationName = buffer.readString();
      const animationFrameLength = buffer.readInt32();
      const animationFrameData: AnimationFrameData[] = new Array<AnimationFrameData>(animationFrameLength);
      for (let j = 0; j < animationFrameLength; j++) {
        const event = buffer.readString();
        const time = buffer.readInt32();
        const animationCollisionLength = buffer.readInt32();
        const animationCollisionData: AnimationCollisionData[] = new Array<AnimationCollisionData>(
          animationCollisionLength
        );
        for (let k = 0; k < animationCollisionLength; k++) {
          const id = buffer.readInt32();
          const width = buffer.readSingle();
          const height = buffer.readSingle();
          const x = buffer.readSingle();
          const y = buffer.readSingle();
          animationCollisionData[k] = {
            id,
            x,
            y,
            width,
            height
          };
        }

        const animationPartLength = buffer.readInt32();
        const animationPartData: AnimationPartData[] = new Array<AnimationPartData>(animationPartLength);
        for (let k = 0; k < animationPartLength; k++) {
          const id = buffer.readInt32();
          const x = buffer.readSingle();
          const y = buffer.readSingle();
          const rotation = buffer.readSingle();
          const flip = buffer.readInt32();
          const scale: Vector2 = {
            x: buffer.readSingle(),
            y: buffer.readSingle()
          };
          const postfix = buffer.readString();
          animationPartData[k] = {
            globalId: id,
            localId: id % 50,
            type: id >= 0 ? id / 50 : -(-id / 50 + 1),
            x,
            y,
            rotation,
            flip,
            scale,
            postfix
          };
        }

        buffer.readChar();
        animationFrameData[j] = {
          parts: animationPartData,
          collisions: animationCollisionData,
          event: event,
          time: time,
          isRecoil: animationName.includes('RECOIL')
        };
      }

      buffer.readChar();
      animationData[i] = {
        frames: animationFrameData,
        name: animationName
      };
    }

    return animationData;
  }

  public override writeTo(buffer: BinaryWriter, content: AnimationData[], manager: ReaderManager): void {
    buffer.writeInt32(content.length);
    for (let i = 0; i < content.length; i++) {
      buffer.writeString(content[i].name);
      buffer.writeInt32(content[i].frames.length);

      for (let j = 0; j < content[i].frames.length; j++) {
        buffer.writeString(content[i].frames[j].event);
        buffer.writeInt32(content[i].frames[j].time);
        buffer.writeInt32(content[i].frames[j].collisions.length);

        for (let k = 0; k < content[i].frames[j].collisions.length; k++) {
          buffer.writeInt32(content[i].frames[j].collisions[k].id);
          buffer.writeSingle(content[i].frames[j].collisions[k].width);
          buffer.writeSingle(content[i].frames[j].collisions[k].height);
          buffer.writeSingle(content[i].frames[j].collisions[k].x);
          buffer.writeSingle(content[i].frames[j].collisions[k].y);
        }

        buffer.writeInt32(content[i].frames[j].parts.length);
        for (let k = 0; k < content[i].frames[j].parts.length; k++) {
          buffer.writeInt32(content[i].frames[j].parts[k].globalId);
          buffer.writeSingle(content[i].frames[j].parts[k].x);
          buffer.writeSingle(content[i].frames[j].parts[k].y);
          buffer.writeSingle(content[i].frames[j].parts[k].rotation);
          buffer.writeInt32(content[i].frames[j].parts[k].flip);
          buffer.writeSingle(content[i].frames[j].parts[k].scale.x);
          buffer.writeSingle(content[i].frames[j].parts[k].scale.y);
          buffer.writeString(content[i].frames[j].parts[k].postfix);
        }

        buffer.writeChar('\n');
      }

      buffer.writeChar('\n');
    }
  }
}
