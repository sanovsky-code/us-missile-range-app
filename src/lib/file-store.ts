/**
 * Helper for the `files` SQLite table + on-disk file storage.
 *
 * Files live under /files/<type>/<unique-name> at the project root.
 * The relative path (e.g. "files/documents/abc-report.pdf") is stored in
 * SQLite so the project folder can be copied to another machine and the
 * paths still resolve.
 *
 * No file types are required today; this is plumbing for future attachments
 * (e.g. document scans, site photos, exported reports).
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getDb } from "./db";

const FILES_ROOT = "files"; // relative to process.cwd()

export type FileBucket = "documents" | "images" | "exports";

export interface FileRecord {
  id: number;
  entity_type: string | null;
  entity_id: string | null;
  file_name: string;
  relative_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

function ensureBucketDir(bucket: FileBucket): string {
  const dir = path.join(process.cwd(), FILES_ROOT, bucket);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(name: string): string {
  // Strip directory components and keep a safe filename
  const base = path.basename(name).replace(/[^\w.\- ]/g, "_");
  return base || "untitled";
}

/**
 * Persist a file to /files/<bucket>/<unique>-<safeName> and record metadata.
 * Returns the inserted row (including its database id and relative path).
 */
export function saveFile(
  bucket: FileBucket,
  originalName: string,
  data: Buffer,
  options: { entityType?: string; entityId?: string; mimeType?: string } = {},
): FileRecord {
  const dir = ensureBucketDir(bucket);
  const unique = crypto.randomBytes(4).toString("hex");
  const final = `${unique}-${safeName(originalName)}`;
  const fullPath = path.join(dir, final);
  fs.writeFileSync(fullPath, data);

  // Always store a forward-slash, project-root-relative path so it works
  // when the folder is copied to another machine.
  const relativePath = `${FILES_ROOT}/${bucket}/${final}`;

  const result = getDb().prepare(`
    INSERT INTO files (entity_type, entity_id, file_name, relative_path, mime_type, file_size)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    options.entityType ?? null,
    options.entityId ?? null,
    originalName,
    relativePath,
    options.mimeType ?? null,
    data.length,
  );

  return {
    id: Number(result.lastInsertRowid),
    entity_type: options.entityType ?? null,
    entity_id: options.entityId ?? null,
    file_name: originalName,
    relative_path: relativePath,
    mime_type: options.mimeType ?? null,
    file_size: data.length,
    created_at: new Date().toISOString(),
  };
}

/** Resolve a stored relative_path to an absolute path on this machine. */
export function resolveStoredPath(relativePath: string): string {
  return path.join(process.cwd(), relativePath);
}

/** List metadata for files attached to a given entity. */
export function listFilesFor(entityType: string, entityId: string): FileRecord[] {
  return getDb().prepare(`
    SELECT id, entity_type, entity_id, file_name, relative_path, mime_type, file_size, created_at
    FROM files
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY created_at DESC
  `).all(entityType, entityId) as FileRecord[];
}

/** Delete the row and the on-disk file. */
export function deleteFile(id: number): boolean {
  const row = getDb().prepare("SELECT relative_path FROM files WHERE id = ?").get(id) as { relative_path?: string } | undefined;
  if (!row?.relative_path) return false;
  const abs = resolveStoredPath(row.relative_path);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
  getDb().prepare("DELETE FROM files WHERE id = ?").run(id);
  return true;
}
