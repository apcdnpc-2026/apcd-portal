declare module 'exifr' {
  interface ParseOptions {
    gps?: boolean;
    pick?: string[];
  }
  function parse(input: File | Buffer | ArrayBuffer, options?: ParseOptions): Promise<any>;
  export { parse };
  export default { parse };
}
