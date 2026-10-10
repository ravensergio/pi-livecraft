import type { ExtensionAPI, SessionEntry, SessionTreeNode } from '@earendil-works/pi-coding-agent'

/**
 * /tree-back <n> — continue the session from n messages ago.
 *
 * The session file is a tree: navigating moves the leaf pointer, so the
 * abandoned tail stays in the file (restorable) and the model only sees
 * the path up to the target. KV cache: the shared prefix is a cache hit;
 * only the new prompt gets prefilled.
 */
export default function registerTreeBack(pi: ExtensionAPI): void {
  pi.registerCommand('tree-back', {
    description:
      'Continue from n messages ago (e.g. /tree-back 2). The abandoned tail stays in the session file.',
    handler: async (args, ctx) => {
      const n = Number.parseInt(args.trim(), 10)
      if (!Number.isInteger(n) || n < 1) {
        ctx.ui.notify('Usage: /tree-back <count>', 'warning')
        return
      }
      const leafId = ctx.sessionManager.getLeafId()
      if (leafId === null) {
        ctx.ui.notify('The session is empty — nothing to go back from.', 'warning')
        return
      }
      const path = leafPath(ctx.sessionManager.getTree(), leafId)
      const messages = path.filter((entry) => entry.type === 'message')
      if (messages.length === 0) {
        ctx.ui.notify('No messages in this session yet.', 'warning')
        return
      }
      // Target = the entry before the last n messages; clamp at the first message.
      const targetIndex = messages.length - n - 1
      const target = targetIndex >= 0 ? messages[targetIndex] : messages[0]
      const result = await ctx.navigateTree(target.id, { summarize: false })
      if (result.cancelled) {
        ctx.ui.notify('Tree navigation was cancelled.', 'warning')
        return
      }
      ctx.ui.notify(
        `Continuing from ${Math.min(n, messages.length)} message(s) ago. `
          + 'The abandoned tail stays in the session file.',
        'info',
      )
    },
  })
}

/** Returns the entries on the root→leaf path, oldest first. */
function leafPath(tree: SessionTreeNode[], leafId: string): SessionEntry[] {
  for (const node of tree) {
    const found = findPath(node, leafId)
    if (found) return found
  }
  return []
}

function findPath(node: SessionTreeNode, leafId: string): SessionEntry[] | null {
  if (node.entry.id === leafId) return [node.entry]
  for (const child of node.children) {
    const found = findPath(child, leafId)
    if (found) return [node.entry, ...found]
  }
  return null
}
