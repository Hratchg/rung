export type PromptBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'step'; n: string; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'para'; text: string }

export type PromptPart = { kind: 'text' | 'variable' | 'term'; text: string }

export function promptBlocks(prompt: string): PromptBlock[] {
  const blocks: PromptBlock[] = []
  for (const raw of prompt.split('\n')) {
    const line = raw.trimEnd()
    const text = line.trim()
    const last = blocks[blocks.length - 1]
    if (!text) continue
    if (text.startsWith('## ')) {
      blocks.push({ kind: 'heading', text: text.slice(3) })
      continue
    }
    const step = text.match(/^(\d+)\.\s+(.*)$/)
    if (step && line === text) {
      blocks.push({ kind: 'step', n: step[1], text: step[2] })
      continue
    }
    if (text.startsWith('- ')) {
      blocks.push({ kind: 'bullet', text: text.slice(2) })
      continue
    }
    if (last && last.kind !== 'heading' && (line !== text || last.kind === 'para')) {
      last.text = `${last.text} ${text}`
      continue
    }
    blocks.push({ kind: 'para', text })
  }
  return blocks
}

export function promptParts(text: string): PromptPart[] {
  const parts: PromptPart[] = []
  const pattern = /\{\{(\w+)\}\}|^([a-z]+_[a-z_]+):(?=\s)/g
  let at = 0
  for (const m of text.matchAll(pattern)) {
    const index = m.index ?? 0
    if (index > at) parts.push({ kind: 'text', text: text.slice(at, index) })
    if (m[1]) parts.push({ kind: 'variable', text: m[1] })
    else parts.push({ kind: 'term', text: m[2] }, { kind: 'text', text: ':' })
    at = index + m[0].length
  }
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) })
  return parts
}
