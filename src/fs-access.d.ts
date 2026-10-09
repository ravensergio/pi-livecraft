/** Minimal File System Access API surface: the picker only needs the name,
 *  the backend resolves it to a full path. */
interface PickedDirectoryHandle {
  name: string
}

interface Window {
  showDirectoryPicker?(): Promise<PickedDirectoryHandle>
}
