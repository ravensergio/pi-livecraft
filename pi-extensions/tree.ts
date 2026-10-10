import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

/**
 * lc-tree <entryId> — internal Livecraft command: continue this session from a
 * specific message. The UI's branch button sends it; users do not type it.
 *
 * Session files are trees: navigating moves the leaf pointer, so the
 * abandoned tail stays in the file (restorable) and the model only sees
 * the path up to the target. The shared prefix stays a KV-cache hit.
 */
export default function registerLivecraftTree(pi: ExtensionAPI): void {
  pi.registerCommand('lc-tree', {
    description: 'Livecraft: continue this session from a message (sent by the UI).',
    handler: async (args, ctx) => {
      const entryId = args.trim()
      if (!entryId) {
        ctx.ui.notify('Missing entry id for lc-tree.', 'warning')
        return
      }
      const result = await ctx.navigateTree(entryId, { summarize: false })
      if (result.cancelled) {
        ctx.ui.notify('Tree navigation was cancelled.', 'warning')
        return
      }
      // session_tree is an extension-only event (not in the RPC stream), so ping a
      // status key the Livecraft frontend watches to refresh the conversation.
      ctx.ui.setStatus('pi-livecraft.tree', 'moved')
      setTimeout(() => {
        try {
          ctx.ui.setStatus('pi-livecraft.tree', '')
        } catch {
          // ctx went stale (session switch) within the window — nothing to clear.
        }
      }, 1000)
      ctx.ui.notify('Continuing from the selected message.', 'info')
    },
  })
}
