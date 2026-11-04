/**
 * Flyway's migration checksum, so the migrator can validate the `flyway_schema_history` rows that
 * Flyway wrote while the Spring Boot backend was running.
 *
 * Flyway (`ChecksumCalculator`) reads the script line by line, drops the line terminators and a leading
 * byte order mark, feeds the UTF-8 bytes of every line into one CRC32, and stores the result as a signed
 * 32 bit integer. Line endings therefore do not matter (LF and CRLF give the same checksum), but any
 * other change does. Verified against the checksums Flyway recorded for V1 to V4.
 */

/** CRC32 (IEEE 802.3, reflected polynomial 0xEDB88320) lookup table, computed once. */
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/**
 * Continues a CRC32 computation over `bytes`, the same as `java.util.zip.CRC32.update`.
 *
 * @param crc the running CRC from a previous call, 0 to start.
 * @returns the updated CRC as an unsigned 32 bit number.
 */
export function crc32Update(crc: number, bytes: Uint8Array): number {
  let c = (crc ^ 0xffffffff) >>> 0;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Splits text into lines like `java.io.BufferedReader.readLine`: on `\n`, `\r\n` or `\r`, without
 * an extra empty line after a final terminator.
 */
export function readLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(/\r\n|\r|\n/);
  if (/[\r\n]$/.test(text)) lines.pop(); // "a\n" is one line, not "a" and ""
  return lines;
}

/** The checksum Flyway stores in `flyway_schema_history.checksum` for a SQL migration with this text. */
export function flywayChecksum(sql: string): number {
  const encoder = new TextEncoder();
  const text = sql.startsWith("﻿") ? sql.slice(1) : sql;
  let crc = 0;
  for (const line of readLines(text)) crc = crc32Update(crc, encoder.encode(line));
  return crc | 0; // Java's (int) cast: reinterpret as signed 32 bit
}
