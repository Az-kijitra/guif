// SHA-256 of a file and the sha256sum compatible line (SPEC-0600-0001 R-1402). Node built-ins only.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/**
 * Lowercase hex SHA-256 of a file, read as a stream. Rejects when the file cannot be read.
 * @param {string} path
 * @returns {Promise<string>}
 */
export function sha256File(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

/**
 * One line of a checksum file, compatible with `sha256sum -c` (binary mode).
 * @param {string} hex
 * @param {string} name
 */
export function formatChecksumLine(hex, name) {
  return `${hex} *${name}`;
}
