/**
 * /skills command — list, load, disable, enable skills.
 *
 *   /skills              list all skills (name, description, status, source)
 *   /skills <name>       load that skill now (same as the hidden /skill:<name>)
 *   /skills off <name>   model stops auto-using it (edits the skill's frontmatter, auto-reload)
 *   /skills on <name>    undo that
 *
 * Pairs with settings.json "enableSkillCommands": false, which hides the
 * per-skill /skill:<name> commands from the command list.
 * BACKUP COPY — the live extension is ~/.pi/agent/extensions/skills.ts (auto-loaded
 * globally for TUI + Livecraft). Do NOT wire this file via --extension, or /skills
 * registers twice in Livecraft sessions.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const home = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME

interface SkillInfo {
  name: string
  description: string
  filePath: string
  baseDir: string
  disabled: boolean
  source: string
}

function findSkillFiles(root: string, depthCap: number): string[] {
  const out: string[] = []
  function walk(dir: string, depth: number): void {
    if (depth > depthCap) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        // don't descend into nested dependency trees
        if (e.name === 'node_modules' && depth > 0) continue
        walk(p, depth + 1)
      } else if (e.name === 'SKILL.md') {
        out.push(p)
      }
    }
  }
  walk(root, 0)
  return out
}

function parseSkill(filePath: string, source: string): SkillInfo | undefined {
  let content: string
  try {
    content = readFileSync(filePath, 'utf-8')
  } catch {
    return undefined
  }
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const fm = m ? m[1] : ''
  const get = (key: string): string | undefined => {
    const r = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
    return r ? r[1].trim() : undefined
  }
  const name = get('name')
  if (!name) return undefined
  return {
    name,
    description: get('description') ?? '',
    filePath,
    baseDir: join(filePath, '..'),
    disabled: (get('disable-model-invocation') ?? '').toLowerCase() === 'true',
    source,
  }
}

function findSkills(cwd: string): SkillInfo[] {
  const roots: Array<[string, string, number]> = [
    [join(home ?? '', '.pi', 'agent', 'skills'), 'user', 4],
    [join(home ?? '', '.agents', 'skills'), 'user', 4],
    [join(home ?? '', '.pi', 'agent', 'npm', 'node_modules'), 'package', 5],
    [join(home ?? '', '.pi', 'agent', 'git'), 'package', 5],
    [join(cwd, '.pi', 'skills'), 'project', 4],
    [join(cwd, '.agents', 'skills'), 'project', 4],
  ]
  const seen = new Set<string>()
  const skills: SkillInfo[] = []
  for (const [root, source, cap] of roots) {
    for (const f of findSkillFiles(root, cap)) {
      if (seen.has(f)) continue
      seen.add(f)
      const s = parseSkill(f, source)
      if (s) skills.push(s)
    }
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

/** Exact match, else unique prefix, else unique substring. */
function matchSkill(
  skills: SkillInfo[],
  query: string,
): { skill?: SkillInfo; candidates?: SkillInfo[] } {
  const exact = skills.find((s) => s.name === query)
  if (exact) return { skill: exact }
  const prefix = skills.filter((s) => s.name.startsWith(query))
  if (prefix.length === 1) return { skill: prefix[0] }
  if (prefix.length > 1) return { candidates: prefix }
  const sub = skills.filter((s) => s.name.includes(query))
  if (sub.length === 1) return { skill: sub[0] }
  if (sub.length > 1) return { candidates: sub }
  return {}
}

function setDisabled(filePath: string, disabled: boolean): void {
  const content = readFileSync(filePath, 'utf-8')
  const m = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/)
  if (!m) throw new Error('skill has no frontmatter')
  let fm = m[2]
  const key = 'disable-model-invocation'
  if (disabled) {
    if (!new RegExp(`^${key}:`, 'm').test(fm)) fm += `\n${key}: true`
  } else {
    fm = fm
      .split('\n')
      .filter((l) => !l.trim().startsWith(key))
      .join('\n')
  }
  writeFileSync(filePath, content.replace(m[0], `${m[1]}${fm}${m[3]}`))
}

export default function(pi: ExtensionAPI) {
  pi.registerCommand('skills', {
    description:
      'List skills; /skills <name> loads one; /skills off|on <name> toggles model auto-use',
    getArgumentCompletions: (prefix) => {
      const all = findSkills(process.cwd())
      const names = ['off', 'on', ...all.map((s) => s.name)]
      const hits = names.filter((n) => n.startsWith(prefix))
      return hits.length ? hits.map((n) => ({ value: n, label: n })) : null
    },
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean)
      const skills = findSkills(ctx.cwd)

      if (parts.length === 0) {
        const lines = skills.map((s) => {
          const state = s.disabled ? 'OFF ' : '    '
          const desc = s.description.length > 56 ? s.description.slice(0, 55) + '…' : s.description
          return `${state} ${s.name.padEnd(28)} ${desc.padEnd(58)} [${s.source}]`
        })
        const off = skills.filter((s) => s.disabled).length
        // setWidget (not notify): Livecraft renders it as a dismissible panel;
        // notify would show the whole list in a tiny auto-dismissing toast.
        ctx.ui.setWidget('skills', [
          `skills — ${skills.length} total, ${off} disabled`,
          ...lines,
          '',
          '/skills <name> loads · /skills off|on <name> toggles · × dismisses',
        ])
        return
      }

      if (parts[0] === 'off' || parts[0] === 'on') {
        const name = parts.slice(1).join(' ')
        const m = matchSkill(skills, name)
        if (m.candidates) {
          ctx.ui.notify(
            `Ambiguous: ${name} → ${m.candidates.map((c) => c.name).join(', ')}`,
            'error',
          )
          return
        }
        if (!m.skill) {
          ctx.ui.notify(`Skill not found: ${name}`, 'error')
          return
        }
        const s = m.skill
        const disable = parts[0] === 'off'
        if (s.disabled === disable) {
          ctx.ui.notify(`Skill ${name} is already ${disable ? 'disabled' : 'enabled'}`, 'info')
          return
        }
        try {
          setDisabled(s.filePath, disable)
        } catch (err) {
          ctx.ui.notify(`Failed to update ${s.filePath}: ${String(err)}`, 'error')
          return
        }
        ctx.ui.notify(
          `Skill ${name} ${
            disable ? 'disabled — model will not auto-use it' : 'enabled'
          }. Reloading…`,
          'info',
        )
        await ctx.reload()
        return
      }

      const name = parts[0]
      const rest = parts.slice(1).join(' ')
      const m = matchSkill(skills, name)
      if (m.candidates) {
        ctx.ui.notify(`Ambiguous: ${name} → ${m.candidates.map((c) => c.name).join(', ')}`, 'error')
        return
      }
      if (!m.skill) {
        ctx.ui.notify(`Skill not found: ${name}. Run /skills to list.`, 'error')
        return
      }
      const s = m.skill
      const content = readFileSync(s.filePath, 'utf-8')
      const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
      const block =
        `<skill name="${s.name}" location="${s.filePath}">\nReferences are relative to ${s.baseDir}.\n\n${body}\n</skill>`
      pi.sendUserMessage(rest ? `${block}\n\n${rest}` : block)
      ctx.ui.notify(`Skill loaded: ${s.name}`, 'info')
    },
  })
}
