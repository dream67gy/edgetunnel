import { mkdir, rm, copyFile, writeFile } from 'node:fs/promises';

// Keep repository files, workflows and configuration outside the public asset set.
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await copyFile('_worker.js', 'dist/_worker.js');
await writeFile('dist/_routes.json', JSON.stringify({ version: 1, include: ['/*'], exclude: [] }) + '\n');
console.log('Pages output prepared in dist/');
