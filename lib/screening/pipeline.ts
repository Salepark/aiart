import { createServiceClient } from '@/lib/supabase/service'
import { runL2, runL3, runL4, type LayerResult } from './ai'
import { getImageMeta, computeFileHash, computePHash, extractExif } from './image'
import { addPreviewWatermark } from './watermark'

type VerdictInsert = {
  artwork_id: string
  layer: string
  verdict: string
  reason: string
  axis?: string | null
  attributed_to?: string | null
  confidence?: number | null
  decided_by: string
}

/** 64-bit phash 간 해밍 거리 (hex string 입력) */
function hammingDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return Infinity
  let dist = 0
  for (let i = 0; i < a.length; i += 4) {
    const xor = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16)
    dist += xor.toString(2).split('').filter(c => c === '1').length
  }
  return dist
}

export async function runScreeningPipeline(artworkId: string): Promise<void> {
  const service = createServiceClient()

  const { data: artwork, error: fetchErr } = await service
    .from('artworks')
    .select('*')
    .eq('id', artworkId)
    .single()

  if (fetchErr || !artwork) throw new Error('artwork not found')

  // ── 전처리: 원본 다운로드 → 워터마크 미리보기 생성 + 이미지 분석 ──
  let preprocessed = false
  try {
    const { data: originalFile } = await service.storage
      .from('originals')
      .download(artwork.original_path)

    if (originalFile) {
      const buffer = Buffer.from(await originalFile.arrayBuffer())

      const [previewBuffer, meta, file_hash, phash, exif] = await Promise.all([
        addPreviewWatermark(buffer),
        getImageMeta(buffer),
        computeFileHash(buffer),
        computePHash(buffer),
        extractExif(buffer),
      ])

      // 워터마크 미리보기는 항상 JPEG로 인코딩되므로 경로 확장자도 .jpg로 통일
      const jpgPreviewPath = artwork.preview_path.replace(/\.\w+$/, '.jpg')

      await service.storage
        .from('artworks')
        .upload(jpgPreviewPath, previewBuffer, {
          contentType: 'image/jpeg', upsert: true,
        })

      if (jpgPreviewPath !== artwork.preview_path) {
        await service.storage.from('artworks').remove([artwork.preview_path])
        artwork.preview_path = jpgPreviewPath
        artwork.image_path = jpgPreviewPath
      }

      await service.from('artworks').update({
        preview_path:  jpgPreviewPath,
        image_path:    jpgPreviewPath,
        actual_width:  meta.actual_width,
        actual_height: meta.actual_height,
        file_hash,
        phash,
        exif,
      }).eq('id', artworkId)

      preprocessed = true
    }
  } catch (e) {
    console.error('[pipeline] preprocessing error:', e)
  }

  // 전처리(워터마크 생성)가 실패하면 워터마크 없는 원본이 그대로 노출될 수 있으므로
  // 자동 심사를 진행하지 않고 관리자 확인 대기 상태로 보류한다.
  if (!preprocessed) {
    await service.from('artworks').update({ status: 'held' }).eq('id', artworkId)
    return
  }

  await service.from('artworks').update({ status: 'screening' }).eq('id', artworkId)

  let overallVerdict: 'pass' | 'hold' | 'flag' = 'pass'

  // ── L1: 규칙 기반 ──────────────────────────────────────────────
  const l1Verdicts: VerdictInsert[] = []

  // 1a. 파일 해시 완전 중복
  const { data: exactDup } = await service
    .from('artworks')
    .select('id')
    .eq('file_hash', artwork.file_hash)
    .neq('id', artworkId)
    .limit(1)

  if (exactDup && exactDup.length > 0) {
    l1Verdicts.push({
      artwork_id: artworkId, layer: 'L1', verdict: 'flag', decided_by: 'rule',
      reason: `동일 파일 해시 중복 감지 (artwork_id: ${exactDup[0].id})`,
      axis: 'duplicate',
    })
  }

  // 1b. pHash 유사 중복 (해밍 거리 ≤ 10)
  if (artwork.phash && l1Verdicts.length === 0) {
    const { data: allPhashes } = await service
      .from('artworks')
      .select('id, phash')
      .neq('id', artworkId)
      .not('phash', 'is', null)

    const nearDup = (allPhashes ?? []).find(
      (a: { id: string; phash: string }) => hammingDistance(artwork.phash, a.phash) <= 10
    )
    if (nearDup) {
      l1Verdicts.push({
        artwork_id: artworkId, layer: 'L1', verdict: 'hold', decided_by: 'rule',
        reason: `유사 이미지 감지 — pHash 유사도 높음 (artwork_id: ${nearDup.id})`,
        axis: 'duplicate',
      })
    }
  }

  // 1c. 최소 해상도 미달 (512px)
  if (artwork.actual_width && artwork.actual_width < 512) {
    l1Verdicts.push({
      artwork_id: artworkId, layer: 'L1', verdict: 'flag', decided_by: 'rule',
      reason: `해상도 미달: ${artwork.actual_width}×${artwork.actual_height}px (최소 512px 필요)`,
      axis: 'format',
    })
  }

  // 1d. 신고 해상도 불일치 (±100px 이상 차이)
  if (
    artwork.declared_width && artwork.actual_width &&
    Math.abs(artwork.declared_width - artwork.actual_width) > 100
  ) {
    l1Verdicts.push({
      artwork_id: artworkId, layer: 'L1', verdict: 'hold', decided_by: 'rule',
      reason: `신고 가로 ${artwork.declared_width}px vs 실측 ${artwork.actual_width}px — 불일치`,
      axis: 'format',
    })
  }

  const l1Pass = l1Verdicts.length === 0
  if (l1Pass) {
    await service.from('screening_verdicts').insert({
      artwork_id: artworkId, layer: 'L1', verdict: 'pass', decided_by: 'rule',
      reason: '중복 없음, 해상도 및 형식 정상',
    })
  } else {
    await service.from('screening_verdicts').insert(l1Verdicts)
    if (l1Verdicts.some(v => v.verdict === 'flag')) overallVerdict = 'flag'
    else overallVerdict = 'hold'
  }

  // L1 flag → 즉시 종료
  if (overallVerdict === 'flag') {
    await service.from('artworks').update({ status: 'rejected' }).eq('id', artworkId)
    return
  }

  // ── L2 + L3: Claude vision (병렬) ──────────────────────────────
  const { data: urlData } = service.storage.from('artworks').getPublicUrl(artwork.image_path)
  const imageUrl = urlData.publicUrl

  const [l2, l3] = await Promise.all([
    runL2(imageUrl),
    runL3(imageUrl, artwork.declared_tool ?? '', artwork.declared_prompt ?? ''),
  ])

  await service.from('screening_verdicts').insert([
    { artwork_id: artworkId, layer: 'L2', verdict: l2.verdict, reason: l2.reason, decided_by: 'agent' },
    {
      artwork_id:   artworkId, layer: 'L3', verdict: l3.verdict, reason: l3.reason,
      axis:         l3.axis ?? null,
      attributed_to: l3.attributed_to ?? null,
      confidence:   l3.confidence ?? null,
      decided_by:   'agent',
    },
  ])

  if (l2.verdict === 'flag' || l3.verdict === 'flag') {
    overallVerdict = 'flag'
  } else if (l2.verdict === 'hold' || l3.verdict === 'hold') {
    if (overallVerdict === 'pass') overallVerdict = 'hold'
  }

  // ── L4: 종합 판정 ───────────────────────────────────────────────
  const l4 = runL4(l2, l3)
  await service.from('screening_verdicts').insert({
    artwork_id: artworkId, layer: 'L4', verdict: l4.verdict, reason: l4.reason, decided_by: 'agent',
  })

  // 최종 상태 업데이트
  // pass → 'screening' 유지 (관리자 최종 확인 후 passed로 올림)
  // hold → 'held'
  // flag → 'rejected'
  const newStatus =
    overallVerdict === 'flag' ? 'rejected' :
    overallVerdict === 'hold' ? 'held' :
    'screening'

  await service.from('artworks').update({ status: newStatus }).eq('id', artworkId)
}
