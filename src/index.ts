import * as fs from 'fs';
import * as path from 'path';
import * as xnb from './Worker.js';
import chalk from 'chalk';
import Log from './Log.js';
import { importXnb, exportXnb } from './Exporter.js';
import { walk } from 'walk';

// Used for displaying the successes and fails amount.
const successes: string[] = [];
const fails: Array<{ file: string; error?: string }> = [];

/**
 * Unpack an XNB file to JSON.
 * @param input The path of the XNB file to unpack.
 * @param output The path at which to save the result.
 */
function unpackFile(input: string, output: string): void {
  try {
    // Ensure that the input file has the right extension.
    if (path.extname(input).toLocaleLowerCase() !== '.xnb') {
      return;
    }

    // Load the XNB and get the object from it.
    Log.info(`Reading file '${input}'...`);
    const result = xnb.unpack(fs.readFileSync(input));

    // Save the converted file.
    if (!exportXnb(output, result)) {
      Log.error(`File ${output} failed to save!`);
      fails.push({ file: input });
      return;
    }

    Log.info(`Output file saved: ${output}`);
    successes.push(input);
  } catch (ex: any) {
    Log.error(`Filename: ${input}\n${ex.stack}\n`);
    fails.push({ file: input, error: ex });
  }
}

/**
 * Pack a file to xnb.
 * @param input The path of the JSON file to pack.
 * @param output The path at which to save the resulting file.
 */
function packFile(input: string, output: string): void {
  try {
    // Resolve the imports.
    Log.info(`Reading file '${input}' ...`);
    const json = importXnb(input);

    // Couldn't recognize the file.
    if (!json) {
      return;
    }

    // Convert the JSON to the correct XNB.
    const buffer = xnb.pack(json);
    fs.writeFileSync(output, buffer);

    Log.info(`Output file saved: ${output}`);
    successes.push(input);
  } catch (ex: any) {
    Log.error(`Filename: ${input}\n${ex.stack}\n`);
    fails.push({ file: input, error: ex });
  }
}

function main(
  input: string,
  output: string,
  handler: (input: string, output: string) => unknown,
  options: { debug: boolean; onlyErrors: boolean }
): unknown {
  // Configure logger.
  Log.showInfo = !options.onlyErrors;
  Log.showWarnings = !options.onlyErrors;
  Log.showErrors = true;
  Log.showDebug = options.debug;

  // Expand paths.
  input = path.resolve(input);
  output = path.resolve(output);

  // If this isn't a directory then just run the function.
  if (!fs.statSync(input).isDirectory()) {
    //Get the extension from the original path name and load new extension.
    const ext = path.extname(input);
    const newExt = ext === '.xnb' ? '.json' : '.xnb';

    // Output is not defined.
    if (output === undefined) {
      output = path.join(path.dirname(input), path.basename(input, ext) + newExt);
    } // Output is a directory.
    else if (fs.statSync(output).isDirectory()) {
      output = path.join(output, path.basename(input, ext) + newExt);
    }

    // Unpack/Pack the file.
    return handler(input, output);
  }

  // If output is not defined, it is the same as input.
  if (output === undefined) {
    output = input;
  }

  // Go through each file.
  const walker = walk(input, { filters: ['json', 'xnb'] });
  walker.on('file', (root: string, stats: { name: string }, next: () => void) => {
    // Get the extension.
    const ext = path.extname(stats.name).toLocaleLowerCase();

    // Swap the input base directory with the base output directory for our target directory.
    const target = root.replace(input, output);

    // Get the source path.
    const inputFile = path.join(root, stats.name);

    // Get the target extension and form final output path.
    const targetExt = ext === '.xnb' ? '.json' : '.xnb';
    const outputFile = path.join(target, path.basename(stats.name, ext) + targetExt);

    // Ensure the path to the output file exists, otherwise create directory.
    if (!fs.existsSync(path.dirname(inputFile))) {
      fs.mkdirSync(outputFile);
    }

    // Unpack and load next file.
    handler(inputFile, outputFile);
    next();
  });

  console.log(`${chalk.bold(chalk.green('Success'))} ${successes.length}`);
  console.log(`${chalk.bold(chalk.red('Fail'))} ${fails.length}`);
}
