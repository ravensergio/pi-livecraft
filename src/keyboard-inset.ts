/**
 * Height of the region covered by the mobile on-screen keyboard.
 *
 * `layoutHeight` is the (stable) layout viewport height — exact here because
 * .app-shell pins the document to 100dvh with overflow: hidden. `offsetTop`
 * and `height` come from `window.visualViewport` (CSS px). The keyboard
 * covers everything below `offsetTop + height`.
 */
export function keyboardInset(layoutHeight: number, offsetTop: number, height: number): number {
  return Math.max(0, layoutHeight - (offsetTop + height))
}
