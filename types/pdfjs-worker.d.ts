// pdf.js ships no declarations for its worker entry; Core only hands the module object back to pdf.js.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
