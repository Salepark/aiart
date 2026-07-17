import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type LayerResult = {
  verdict: 'pass' | 'flag' | 'hold'
  reason: string
  axis?: string | null
  attributed_to?: string | null
  confidence?: number | null
}

function parseJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('no JSON found')
  return JSON.parse(match[0])
}

/** L2: 콘텐츠 안전성 */
export async function runL2(imageUrl: string): Promise<LayerResult> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          {
            type: 'text',
            text: `You are a content moderator for an AI art auction platform.
Analyze this artwork for content safety issues:
- NSFW content (nudity, sexual content, extreme violence/gore)
- Hate symbols, slurs, discriminatory imagery
- Visible watermarks or embedded copyright text
- Shock/disturbing content inappropriate for a marketplace

Respond ONLY with valid JSON (no other text):
{"verdict":"pass","reason":"one sentence"}
or {"verdict":"hold","reason":"one sentence"}
or {"verdict":"flag","reason":"one sentence"}`,
          },
        ],
      }],
    })
    const j = parseJson(msg.content[0].type === 'text' ? msg.content[0].text : '{}')
    return { verdict: j.verdict as LayerResult['verdict'], reason: String(j.reason) }
  } catch (e) {
    return { verdict: 'hold', reason: `L2 분석 오류: ${(e as Error).message}` }
  }
}

/** L3: IP/저작권 탐지 */
export async function runL3(
  imageUrl: string,
  declaredTool: string,
  declaredPrompt: string,
): Promise<LayerResult> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          {
            type: 'text',
            text: `You are an IP compliance officer for an AI art auction.
Check this AI-generated artwork for intellectual property issues:
1. Style so distinctively copying a specific living artist it could be mistaken as their work
2. Recognizable studio styles (Studio Ghibli, Disney, Pixar, etc.)
3. Identifiable fictional characters (Mickey Mouse, Pikachu, Marvel/DC heroes, etc.)
4. Recognizable real people's likenesses
5. Trademarked logos, brand text, product imagery

Tool: ${declaredTool || 'unknown'}
Prompt hint: ${declaredPrompt ? declaredPrompt.slice(0, 150) : 'not provided'}

Flag only clear, specific infringement — not general style similarity.

Respond ONLY with valid JSON (no other text):
{"verdict":"pass","axis":null,"attributed_to":null,"confidence":null,"reason":"one sentence"}
or {"verdict":"flag","axis":"artist|studio|character|real_person","attributed_to":"Name","confidence":0.9,"reason":"one sentence"}
or {"verdict":"hold","axis":"artist|studio|character|real_person","attributed_to":"Name or null","confidence":0.5,"reason":"one sentence"}`,
          },
        ],
      }],
    })
    const j = parseJson(msg.content[0].type === 'text' ? msg.content[0].text : '{}')
    return {
      verdict:      j.verdict as LayerResult['verdict'],
      reason:       String(j.reason),
      axis:         (j.axis as string | null) ?? null,
      attributed_to: (j.attributed_to as string | null) ?? null,
      confidence:   typeof j.confidence === 'number' ? j.confidence : null,
    }
  } catch (e) {
    return { verdict: 'hold', reason: `L3 분석 오류: ${(e as Error).message}` }
  }
}

/** L4: 종합 판정 (rule-based synthesis) */
export function runL4(l2: LayerResult, l3: LayerResult): LayerResult {
  if (l2.verdict === 'flag' || l3.verdict === 'flag') {
    const flagReasons = [l2, l3]
      .filter(r => r.verdict === 'flag')
      .map(r => r.reason)
      .join(' / ')
    return { verdict: 'flag', reason: `거부 사유: ${flagReasons}` }
  }
  if (l2.verdict === 'hold' || l3.verdict === 'hold') {
    const holdReasons = [l2, l3]
      .filter(r => r.verdict === 'hold')
      .map(r => r.reason)
      .join(' / ')
    return { verdict: 'hold', reason: `보류 사유: ${holdReasons}` }
  }
  return { verdict: 'pass', reason: '콘텐츠 안전성 및 IP 검토 모두 통과' }
}
