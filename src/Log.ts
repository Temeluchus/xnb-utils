import chalk from 'chalk';

export default class Log {
  public static showInfo: boolean = false;
  public static showWarnings: boolean = false;
  public static showErrors: boolean = false;
  public static showDebug: boolean = false;

  // Displays an info message.
  public static info(message: string): void {
    if (this.showInfo) {
      console.log(chalk.bold(chalk.blue('[INFO] ')) + message);
    }
  }

  // Displays a debug message.
  public static debug(message: string): void {
    if (this.showDebug) {
      console.log(chalk.bold(chalk.magenta('[DEBUG] ')) + message);
    }
  }

  // Displays a warning message.
  public static warn(message: string): void {
    if (this.showWarnings) {
      console.log(chalk.bold(chalk.yellow('[WARN] ')) + message);
    }
  }

  // Displays an error message.
  public static error(message: string): void {
    if (this.showErrors) {
      console.log(chalk.bold(chalk.red('[ERROR] ')) + message);
    }
  }

  // Displays a binary message.
  public static toBinary(value: number, size: number = 8, sliceBegin: number = -1, sliceEnd: number = -1): string {
    let z = '';
    while (z.length < size) {
      z += '0';
    }

    z = z.slice(value.toString(2).length) + value.toString(2);
    if (sliceBegin === -1 && sliceEnd === -1) {
      return `0b${z}`;
    }

    return (
      chalk.gray('0b') +
      chalk.gray(z.slice(0, sliceBegin)) +
      chalk.bold(chalk.blue('[')) +
      chalk.bold(z.slice(sliceBegin, sliceEnd)) +
      chalk.bold(chalk.blue(']')) +
      chalk.gray(z.slice(sliceEnd))
    );
  }

  // Displays a hex message.
  public static toHex(value: number): string {
    return `0x${value.toString(16)}`;
  }
}
