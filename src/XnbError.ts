export default class XnbError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    this.message = message;
    Error.captureStackTrace(this, XnbError);
  }
}
