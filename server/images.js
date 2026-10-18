import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { storageEnabled, publicImagePrefix, uploadWebp, storageRequest, bucket } from './storage.js';

export const uploadDir = path.resolve('uploads');
export async function saveImage(file) {
  if (!file) throw new Error('Please choose a cover image.');
  let buffer;
  try {
    const input = sharp(file.buffer, { limitInputPixels: 25000000 });
    const metadata = await input.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Unsupported image');
    buffer = await input.rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch {
    throw new Error('Invalid image. Choose a still JPG, PNG or WebP image up to 25 megapixels.');
  }
  const filename = `${randomUUID()}.webp`;
  if (storageEnabled) return uploadWebp(filename, buffer);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, filename), buffer);
  return `/uploads/${filename}`;
}
export async function removeImage(image) {
  if (storageEnabled && image?.startsWith(publicImagePrefix)) {
    const filename = image.slice(publicImagePrefix.length);
    if (!/^[a-f0-9-]{36}\.webp$/.test(filename)) return;
    await storageRequest(`object/${bucket}`, { method: 'DELETE', body: JSON.stringify({ prefixes: [filename] }) }).catch(error => console.error('Cannot remove old image:', error.status || error.name));
    return;
  }
  if (!/^\/uploads\/[a-f0-9-]{36}\.webp$/.test(image || '')) return;
  const target = path.resolve(uploadDir, path.basename(image));
  if (path.dirname(target) !== uploadDir) throw new Error('Invalid upload path');
  await unlink(target).catch(error => { if (error.code !== 'ENOENT') console.error('Cannot remove old image:', error.code); });
}
