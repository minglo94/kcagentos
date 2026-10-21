import type { ArchiverOptions } from "archiver";
// Keep the Node-only package external to webpack. Archiver 8 exports classes.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ZipArchive } = require("archiver") as typeof import("archiver");
export const createZipArchive = (options: ArchiverOptions = {}) => new ZipArchive(options);
