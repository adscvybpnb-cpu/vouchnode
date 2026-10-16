const IMAGE_SIGNATURES = [
  {
    mime: 'image/jpeg',
    matches: (buffer: Buffer) =>
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff,
  },
  {
    mime: 'image/png',
    matches: (buffer: Buffer) =>
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ])),
  },
  {
    mime: 'image/gif',
    matches: (buffer: Buffer) =>
      buffer.length >= 6 &&
      ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6)),
  },
  {
    mime: 'image/webp',
    matches: (buffer: Buffer) =>
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP',
  },
] as const;

export function detectImageMimeType(buffer: Buffer): string | undefined {
  return IMAGE_SIGNATURES.find(({ matches }) => matches(buffer))?.mime;
}
