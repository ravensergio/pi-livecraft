# Quote Selection Plan — "ask about this" from reply text

## Idea
Select text in an assistant reply → a small floating hint appears near the
selection → click it → the selection lands in the composer as a markdown
blockquote, ready to send back. (Pattern seen in other harnesses/clients.)

## Design
1. **Detect**: `selectionchange` listener; non-empty selection whose anchor and
   focus are inside the SAME `.message.assistant .content` element → show hint
2. **Hint button**: small floating chip (`❝ Ask about this`) at the selection's
   bounding rect (top edge). Hides on: scroll, deselection, collapse of the
   message, typing in the composer
3. **Insert**: at composer cursor position, as blockquote — `> ` prefixed per
   line for multi-line selections. Reuse the existing insert-at-cursor path from
   slash commands. Focus the composer after insert

## Rules / edge cases
- Selection spanning multiple messages → no hint (single message only)
- Code blocks → quoted as-is (`>` lines, no fence)
- Composer focused/typing → no hint
- Desktop-first; mobile touch selection out of scope for v1

## Steps
- [ ] 1. `SelectionQuote.tsx`: selection tracking + floating hint component
      (positioning, show/hide rules)
- [ ] 2. Composer: expose insert-at-cursor (lift from slash-command path if
      needed); wire quote insertion + focus
- [ ] 3. Styling: hint chip matches dialog/button language; z-index above
      conversation, below dialogs
- [ ] 4. Test: single/multi-line selections, code blocks, cross-message
      selection (must not trigger), scroll behavior, after composer send

## Rollback policy
**If it does not seem right — revert.** Each step lands as its own commit on top
of current HEAD; rollback = `git revert` of those commits. No partial states:
either the full feature ships or none of it does.

## Success criteria
- Select → hint appears within a frame, positioned sensibly at any scroll depth
- Click → quoted text in composer with cursor after it, ready to type/send
- Zero impact when nothing is selected (no per-frame work)
