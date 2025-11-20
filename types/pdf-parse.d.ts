declare module "pdf-parse" {
  import type { Buffer } from "node:buffer";

  interface PDFParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata?: unknown;
    version: string;
    text: string;
  }

  function pdf(data: Buffer | Uint8Array | ArrayBuffer | string, options?: Record<string, unknown>): Promise<PDFParseResult>;

  export default pdf;
}
