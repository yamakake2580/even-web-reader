import { promises as fs } from "node:fs";
import path from "node:path";
import type { ChapterMeta } from "./sites/types.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const NOVELS_DIR = path.join(DATA_DIR, "novels");
const CHAPTERS_DIR = path.join(DATA_DIR, "chapters");

// novelId/episode ultimately come from request URL segments; without this,
// a value like ".." (a valid single path segment) could escape NOVELS_DIR /
// CHAPTERS_DIR when joined into a filesystem path.
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function isSafeId(value: string): boolean {
  return SAFE_ID.test(value);
}

function assertSafeId(value: string): void {
  if (!isSafeId(value)) {
    throw new Error(`invalid id: ${value}`);
  }
}

export interface StoredNovel {
  id: string;
  site: string;
  title: string;
  author: string;
  chapters: ChapterMeta[];
}

export interface StoredChapter {
  title: string;
  text: string;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveNovel(novel: StoredNovel): Promise<void> {
  assertSafeId(novel.id);
  await ensureDir(NOVELS_DIR);
  await fs.writeFile(path.join(NOVELS_DIR, `${novel.id}.json`), JSON.stringify(novel, null, 2), "utf8");
}

export async function loadNovel(id: string): Promise<StoredNovel | null> {
  assertSafeId(id);
  return readJson<StoredNovel>(path.join(NOVELS_DIR, `${id}.json`));
}

export async function listNovels(): Promise<StoredNovel[]> {
  await ensureDir(NOVELS_DIR);
  const files = await fs.readdir(NOVELS_DIR);
  const novels = await Promise.all(
    files.filter((f) => f.endsWith(".json")).map((f) => readJson<StoredNovel>(path.join(NOVELS_DIR, f))),
  );
  return novels.filter((n): n is StoredNovel => n !== null);
}

export async function saveChapter(novelId: string, episode: string, chapter: StoredChapter): Promise<void> {
  assertSafeId(novelId);
  assertSafeId(episode);
  const dir = path.join(CHAPTERS_DIR, novelId);
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, `${episode}.json`), JSON.stringify(chapter, null, 2), "utf8");
}

export async function loadChapter(novelId: string, episode: string): Promise<StoredChapter | null> {
  assertSafeId(novelId);
  assertSafeId(episode);
  return readJson<StoredChapter>(path.join(CHAPTERS_DIR, novelId, `${episode}.json`));
}
