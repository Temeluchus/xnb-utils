import * as fs from 'fs';
import * as path from 'path';
import Log from './Log.js';
import { Reader, ReaderWithExports } from './Type.js';
import { getReader, Parsed } from './Worker.js';
import XnbError from './XnbError.js';

// Sample object used to check if read json contains all the required fields.
const sampleJson: Parsed<unknown> = {
  header: {
    hidef: false,
    target: '',
    xnbVersion: 0
  },
  readers: [
    {
      type: '',
      version: 0
    }
  ],
  content: {}
};

/**
 * Checks if our reader can export/import data.
 * @param reader The reader to check.
 * @returns Returns ReaderWithExports if the reader can export/import, otherwise undefined.
 */
function hasExports<T, E>(reader: Reader<T>): reader is ReaderWithExports<T, E> {
  return typeof (reader as ReaderWithExports<T, E>).export !== 'undefined';
}

/**
 * Checks if two objects share the same properties and types.
 * Useful to check if an object contains all properites of a class / interface.
 * @param input The target object.
 * @param sample The object to check against.
 * @param strict Disallow extra fields.
 * @param recursive Recursively check for arrays.
 * @returns {boolean} Both objects match.
 */
export function isSameObject<T>(input: any, sample: T, strict = true, recursive = true): input is T {
  if (input === undefined || input === null) {
    Log.error(`${input} is null or undefined`);
    return false;
  }

  let s = sample as any;

  // If we have primitives we check that they are of the same type and that type is not object.
  if (typeof s === typeof input && typeof input !== 'object') return true;

  //If we have an array, then each of the items in the o array must be of the same type as the item in the sample array.
  if (input instanceof Array) {
    // If the sample was not an arry then we return false.
    if (!(s instanceof Array)) {
      Log.error(`${s} is not an array`);
      return false;
    }

    for (const e of input) {
      if (!isSameObject(e, s[0], strict, recursive)) return false;
    }
  } else {
    // We check if all the properties of sample are present.
    for (let key of Object.getOwnPropertyNames(sample)) {
      if (typeof input[key] !== typeof s[key]) {
        Log.error(`The target object ${key} is different than the other object (${input[key]} - ${s[key]})`);
        return false;
      }
      if (recursive && typeof s[key] === 'object' && !isSameObject(input[key], s[key], strict, recursive)) return false;
    }

    // We check that input does not have any extra properties to sample.
    if (strict) {
      for (let key of Object.getOwnPropertyNames(input)) {
        if (s[key] === undefined || s[key] === null) {
          Log.error(`${key} does not exist`);
          return false;
        }
      }
    }
  }

  return true;
}

// Saves a parsed XNB file and its exports.
export function exportXnb(filename: string, xnb: Parsed<unknown>): boolean {
  // Delete useless data.
  delete xnb.header.compressed;
  delete xnb.header.compressionType;

  // Get the directory name for the file.
  const dirname = path.dirname(filename);

  // Get the name for the file.
  const basename = path.basename(filename, '.json');

  // Create folder if directory doesn't exist.
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }

  // Get current reader and check if it can export files.
  const reader = getReader(xnb.readers[0].type)!;
  if (hasExports(reader)) {
    xnb.content = reader.export(xnb.content, (data, extname) => {
      const filename = `${basename}${extname}`;

      // Export file.
      Log.info(`Exporting ${filename}...`);
      fs.writeFileSync(path.resolve(dirname, filename), data);

      return filename;
    });
  }

  // Save the XNB object as JSON.
  fs.writeFileSync(filename, JSON.stringify(xnb, null, 2));

  // File successfully exported.
  return true;
}

// Reads an unpacked XNB file and its exports into parsed XNB.
export function importXnb(filename: string): Parsed<unknown> | undefined {
  // Get the directory name.
  const dirname = path.dirname(filename);

  // Get file extension.
  let json: Parsed<unknown>;
  const extension = path.extname(filename).toLocaleLowerCase();

  // Get the JSON and the contents.
  // If no JSON is passed, assume it from the file format, otherwise read it.
  if (extension !== '.json') {
    json = {
      header: {
        target: 'w',
        xnbVersion: 5,
        hidef: false
      },
      readers: [{ type: 'NONE', version: 0 }],
      content: {
        filename: path.basename(filename)
      }
    };
    switch (extension) {
      case '.wav':
        json.readers[0].type = 'Microsoft.Xna.Framework.Content.SoundEffectReader';
        break;

      case '.png':
        json.readers[0].type = 'Microsoft.Xna.Framework.Content.Texture2DReader';
        break;

      default:
        Log.error(`Couldn't recognize the given file.`);
        return undefined;
    }
  } else {
    json = JSON.parse(fs.readFileSync(filename, 'utf8'));
  }

  sampleJson.content = json.content;
  if (!isSameObject(json, sampleJson)) {
    throw new XnbError(`Invalid XNB json ${filename}`);
  }

  // Get current reader and check if it can import files.
  const reader = getReader(json.readers[0].type)!;
  if (hasExports(reader)) {
    json.content = reader.import(json.content, (filename) => fs.readFileSync(path.resolve(dirname, filename)));
  }

  return json;
}
