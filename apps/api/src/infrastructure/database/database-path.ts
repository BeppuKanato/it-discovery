import { resolve } from 'node:path';

// DBの保存先を決定する。
export function resolveDatabasePath(value = process.env['DATABASE_PATH']): string {
  if (value !== undefined && value.trim() === '') {
    throw new Error('DATABASE_PATH must not be empty');
  }
  if (value === ':memory:') return value;
  return resolve(value ?? './data/it-discovery.db');
}
