import sharp from 'sharp'
import crypto from 'crypto'

export async function getImageMeta(buffer: Buffer) {
  const image = sharp(buffer)
  const meta = await image.metadata()
  return {
    actual_width: meta.width ?? null,
    actual_height: meta.height ?? null,
  }
}

export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/** 8×8 average-hash (64-bit) as hex string */
export async function computePHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const avg = data.reduce((s, v) => s + v, 0) / data.length
  let bits = ''
  for (const v of data) bits += v >= avg ? '1' : '0'

  return BigInt('0b' + bits).toString(16).padStart(16, '0')
}

export async function extractExif(buffer: Buffer): Promise<Record<string, unknown> | null> {
  try {
    const { parse } = await import('exifr')
    const result = await parse(buffer, true)
    return result ?? null
  } catch {
    return null
  }
}
