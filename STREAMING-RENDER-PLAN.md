# Streaming Render Plan — incremental markdown for live messages

## Problem
While a message streams, every delta re-parses the ENTIRE message as markdown
(remark + syntax highlighting of all code blocks). A long reply gets rebuilt
~100 times per turn. Bursts of tokens (local llama.cpp servers emit in clumps)
pile up updates faster than one frame → visible jank: bum-stuck-bum.

Client-side typewriter smoothing was tried and REVERTED (fixed/adaptive reveal
rates can't beat the source rhythm — faster = hiccups, slower = lag). The real
fix is making each update cheap.

## Design
Split a live message into stable segments at safe markdown boundaries:
- closed code fences (``` pairs) → own segment
- blank-line paragraph breaks → segment boundaries
- consecutive non-blank lines stay together (lists/tables must not split)
- an OPEN code fence belongs to the tail (finalizes when it closes)

Finished segments render through a memoized component — parsed ONCE, cached by
React. Only the growing tail re-parses per update (~0.1ms vs ~10ms). Result:
raw bursts paint at 60fps like a terminal. History messages are untouched
(already parse-once via existing memoization).

## Steps
- [ ] 1. `segment-stream.ts`: pure splitter function + unit tests (fences open/
      closed, lists, tables, CRLF, setext headings, empty input)
- [ ] 2. MessageCard: render finished segments as memoized `<Markdown>` + live
      tail as plain `<Markdown>`; thinking parts get the same treatment
- [ ] 3. Verify pixel-identical output vs current single-parse on real sessions
      (this chat's 2400 messages = test bed): code blocks, lists, tables, bold,
      links, images, copy buttons
- [ ] 4. Performance check: long code-heavy reply streams without dropped frames
      (DevTools performance trace before/after)

## Rollback policy
**If it does not seem right — revert.** Each step lands as its own commit on top
of the current HEAD; rollback = `git revert` of those commits (or reset if
unpushed). No partial states: either the full feature ships or none of it does.
The pre-project state is stable and pushed, so a revert is always clean.

## Success criteria
- Long code-heavy reply: smooth continuous appearance, no hiccup/lag pattern
- Rendering identical to today for all finished content (no visual regressions)
- No measurable cost on history rendering (segments only apply while live)
