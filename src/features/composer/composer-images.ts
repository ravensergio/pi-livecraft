export const maxComposerImages = 4
const maxComposerImageDimension = 1600
const maxComposerImageBytes = 1.5 * 1024 * 1024

export interface ComposerImage {
  id: string
  data: string
  mimeType: 'image/png'
}

/** Reduces each pasted image below the HTTP limit while preserving useful model resolution. */
export async function prepareComposerImage(file: File): Promise<ComposerImage | null> {
  const source = await loadImageSource(file)
  let width = Math.min(source.width, maxComposerImageDimension)
  let height = Math.round(source.height * (width / source.width))
  if (height > maxComposerImageDimension) {
    height = maxComposerImageDimension
    width = Math.round(source.width * (height / source.height))
  }

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image encoding is unavailable in this browser.')
  for (;;) {
    canvas.width = width
    canvas.height = height
    // No white fill: PNG keeps the alpha channel, so transparent areas stay transparent.
    context.clearRect(0, 0, width, height)
    context.drawImage(source, 0, 0, width, height)
    const blob = await canvasToPng(canvas)
    if (blob.size <= maxComposerImageBytes)
      return { id: crypto.randomUUID(), data: await blobToBase64(blob), mimeType: 'image/png' }
    if (Math.max(width, height) <= 640) return null
    width = Math.round(width * 0.8)
    height = Math.round(height * 0.8)
  }
}

/** Loads an image file into a Canvas-compatible element and releases its temporary URL after decoding. */
function loadImageSource(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('The pasted image cannot be read.'))
    }
    image.src = url
  })
}

/** Encodes the canvas as PNG — lossless, and transparency is preserved. */
function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('The image could not be encoded.')),
      'image/png',
    )
  )
}

/** Removes the data URL header, which is not part of the base64 format expected by Pi's RPC protocol. */
async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The image could not be read.'))
    reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'))
    reader.readAsDataURL(blob)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}
