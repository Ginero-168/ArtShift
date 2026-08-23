export type FileHandle = {
  name: string;
  type: string;
  bytes: Uint8Array;
};

export interface FileSystemPort {
  openImage(file: File): Promise<FileHandle>;
  save(name: string, bytes: Uint8Array, type: string): Promise<void>;
}

export const browserFileSystem: FileSystemPort = {
  async openImage(file) {
    return { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
  },
  async save(name, bytes, type) {
    const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  },
};
