/** Copies text to the clipboard. Falls back to execCommand on plain-HTTP contexts
 *  (LAN access) where navigator.clipboard is undefined. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    if (!document.execCommand('copy')) throw new Error('Copy failed (execCommand)')
  } finally {
    area.remove()
  }
}
