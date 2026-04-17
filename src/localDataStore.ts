export type StoredLocalDatasetEntry = {
  path: string;
  fileName: string;
  mimeType?: string;
  size: number;
  blob: Blob;
};

export type StoredLocalDatasetRecord = {
  id: string;
  fileName: string;
  mimeType?: string;
  size: number;
  lastModified: number;
  createdAt: string;
  updatedAt: string;
  kind: "blob" | "tree";
  blob?: Blob;
  entries?: StoredLocalDatasetEntry[];
};

const DB_NAME = "mouse_brain_viewer_local_data";
const DB_VERSION = 2;
const STORE_NAME = "datasets";

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openDb();
  return await new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    Promise.resolve()
      .then(() => run(store))
      .then((result) => {
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB transaction failed."));
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB transaction aborted."));
        };
      })
      .catch((error) => {
        try { tx.abort(); } catch { }
        db.close();
        reject(error);
      });
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export async function storeLocalDatasetFile(file: File): Promise<StoredLocalDatasetRecord> {
  const now = new Date().toISOString();
  const record: StoredLocalDatasetRecord = {
    id: createId("local"),
    fileName: file.name,
    mimeType: file.type || undefined,
    size: file.size,
    lastModified: file.lastModified,
    createdAt: now,
    updatedAt: now,
    kind: "blob",
    blob: file,
  };
  await withStore("readwrite", async (store) => { await requestToPromise(store.put(record)); });
  return record;
}

export async function storeLocalDatasetTree(name: string, entries: Array<{ path: string; file: File }>): Promise<StoredLocalDatasetRecord> {
  const now = new Date().toISOString();
  const normalizedEntries: StoredLocalDatasetEntry[] = entries.map((entry) => ({
    path: entry.path.replace(/^\/+/, ""),
    fileName: entry.file.name,
    mimeType: entry.file.type || undefined,
    size: entry.file.size,
    blob: entry.file,
  }));
  const size = normalizedEntries.reduce((sum, entry) => sum + entry.size, 0);
  const lastModified = entries.reduce((max, entry) => Math.max(max, entry.file.lastModified || 0), 0);
  const record: StoredLocalDatasetRecord = {
    id: createId("local"),
    fileName: name,
    mimeType: undefined,
    size,
    lastModified,
    createdAt: now,
    updatedAt: now,
    kind: "tree",
    entries: normalizedEntries,
  };
  await withStore("readwrite", async (store) => { await requestToPromise(store.put(record)); });
  return record;
}

export async function getLocalDatasetRecord(datasetId: string): Promise<StoredLocalDatasetRecord | null> {
  return await withStore("readonly", async (store) => {
    const value = await requestToPromise(store.get(datasetId) as IDBRequest<StoredLocalDatasetRecord | undefined>);
    return value ?? null;
  });
}

export async function getLocalDatasetBlob(datasetId: string): Promise<Blob | null> {
  const record = await getLocalDatasetRecord(datasetId);
  return record?.kind === "blob" ? record.blob ?? null : null;
}

export async function deleteLocalDatasetRecord(datasetId: string): Promise<void> {
  await withStore("readwrite", async (store) => { await requestToPromise(store.delete(datasetId)); });
}


export async function listLocalDatasetRecords(): Promise<StoredLocalDatasetRecord[]> {
  return await withStore("readonly", async (store) => {
    const values = await requestToPromise(store.getAll() as IDBRequest<StoredLocalDatasetRecord[]>);
    return [...(values ?? [])].sort((a, b) => {
      const at = new Date(a.updatedAt || a.createdAt).getTime();
      const bt = new Date(b.updatedAt || b.createdAt).getTime();
      return bt - at;
    });
  });
}

export async function renameLocalDatasetRecord(datasetId: string, nextFileName: string): Promise<StoredLocalDatasetRecord> {
  const trimmed = nextFileName.trim();
  if (!trimmed) {
    throw new Error("Dataset name cannot be empty.");
  }
  return await withStore("readwrite", async (store) => {
    const existing = await requestToPromise(store.get(datasetId) as IDBRequest<StoredLocalDatasetRecord | undefined>);
    if (!existing) {
      throw new Error("This local dataset is missing from browser storage.");
    }
    const updated: StoredLocalDatasetRecord = {
      ...existing,
      fileName: trimmed,
      updatedAt: new Date().toISOString(),
    };
    await requestToPromise(store.put(updated));
    return updated;
  });
}
