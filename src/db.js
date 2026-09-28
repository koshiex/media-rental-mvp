import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

export function openDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

// BEGIN IMMEDIATE takes the write lock up front, so the overlap check and the
// insert that follows it cannot interleave with another writer (NFR-03).
export function inTransaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function isEmpty(db) {
  return db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0;
}
