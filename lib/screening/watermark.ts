import sharp from 'sharp'

/** 출품 시: 대각선 반복 "PREVIEW · aiart.bid" 워터마크 */
export async function addPreviewWatermark(buffer: Buffer): Promise<Buffer> {
  const { width = 800, height = 600 } = await sharp(buffer).metadata()
  const fontSize = Math.max(14, Math.floor(Math.min(width, height) / 22))
  const gap = Math.floor(Math.min(width, height) / 3.5)

  const tiles: string[] = []
  for (let y = -height; y < height * 2; y += gap) {
    for (let x = -width; x < width * 2; x += gap) {
      tiles.push(`<text x="${x}" y="${y}">PREVIEW · aiart.bid</text>`)
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <style>text{fill:rgba(255,255,255,0.32);font-size:${fontSize}px;font-family:Arial,sans-serif;font-weight:bold}</style>
    <g transform="rotate(-30 ${width / 2} ${height / 2})">${tiles.join('')}</g>
  </svg>`

  return sharp(buffer)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .jpeg({ quality: 85 })
    .toBuffer()
}

/** 낙찰 시: 하단 바에 인증서 정보 삽입 */
export async function addBuyerWatermark(
  buffer: Buffer,
  info: { certificateId: string; editionNumber: number; editionTotal: number; issuedAt: string }
): Promise<Buffer> {
  const { width = 800, height = 600 } = await sharp(buffer).metadata()
  const barH = Math.max(36, Math.floor(height * 0.048))
  const fontSize = Math.floor(barH * 0.52)
  const text = `aiart.bid · Cert #${info.certificateId.slice(0, 8).toUpperCase()} · Ed.${info.editionNumber}/${info.editionTotal} · ${info.issuedAt.split('T')[0]}`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${barH}">
    <rect width="${width}" height="${barH}" fill="rgba(0,0,0,0.78)"/>
    <text x="${width / 2}" y="${Math.floor(barH * 0.72)}" text-anchor="middle"
      font-size="${fontSize}" font-family="Arial,sans-serif" fill="white">${text}</text>
  </svg>`

  return sharp(buffer)
    .composite([{ input: Buffer.from(svg), gravity: 'south' }])
    .jpeg({ quality: 95 })
    .toBuffer()
}
