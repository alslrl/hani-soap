export type RecoveryMetadata = { id: string; visitId: string; mimeType: string; createdAt: string; filename: string; audioSessionId?: string };
type RecoveryRecord = RecoveryMetadata & { chunks: Blob[] };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('hani-audio-recovery', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('recordings', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('이 브라우저에 녹음 복구본을 저장하지 못했습니다.'));
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recordings', mode);
    const request = action(tx.objectStore('recordings'));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('복구본 저장 실패')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('복구본 저장 중단')); };
  });
}
export async function createRecovery(meta: RecoveryMetadata) {
  await transaction('readwrite', (store) => store.put({ ...meta, chunks: [] }));
}
export async function appendRecovery(id: string, chunk: Blob) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('recordings', 'readwrite');
    const store = tx.objectStore('recordings');
    const read = store.get(id);
    read.onsuccess = () => {
      const record = read.result as RecoveryRecord | undefined;
      if (!record) { tx.abort(); return; }
      record.chunks.push(chunk);
      store.put(record);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(new Error('녹음 복구본 저장 실패')); };
  });
}
export async function listRecoveries(): Promise<RecoveryMetadata[]> {
  const rows = await transaction<RecoveryRecord[]>('readonly', (store) => store.getAll());
  return rows.filter((row) => row.chunks.length > 0).map(({ chunks: _chunks, ...meta }) => meta);
}
export async function readRecovery(id: string) {
  const row = await transaction<RecoveryRecord | undefined>('readonly', (store) => store.get(id));
  if (!row?.chunks.length) throw new Error('저장된 녹음이 없습니다.');
  return { ...row, blob: new Blob(row.chunks, { type: row.mimeType }) };
}
export async function removeRecovery(id: string) {
  await transaction('readwrite', (store) => store.delete(id));
}
