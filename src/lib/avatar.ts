export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** The picker hint is not validation: users can select any file through the OS. */
export function avatarExtension(file: Pick<File, "type" | "size">): string {
  const extension = EXTENSIONS[file.type];
  if (!extension) throw new Error("Escolha uma imagem JPG, PNG ou WebP.");
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_AVATAR_BYTES) throw new Error("A imagem deve ter conteúdo e no máximo 2 MB.");
  return extension;
}
