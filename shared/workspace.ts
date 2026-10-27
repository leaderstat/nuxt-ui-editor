export interface DocumentData {
  text: string; encoding: string; path: string; fullPath: string; id: number
  indexedAt: string; cached: boolean; diskDigest: string; lineCount: number; version?: string
}
export interface FileNode { label: string; path: string; children?: FileNode[] }
