const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
export const storageEnabled = Boolean(supabaseUrl && process.env.SUPABASE_SERVICE_ROLE_KEY);
export const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'script-covers';
if (!/^[a-z0-9-]+$/.test(bucket)) throw new Error('Invalid storage bucket name.');
if (process.env.VERCEL && !storageEnabled) throw new Error('Supabase Storage configuration is required on Vercel.');
if (supabaseUrl && new URL(supabaseUrl).protocol !== 'https:') throw new Error('SUPABASE_URL must use HTTPS.');
export const publicImagePrefix = `${supabaseUrl}/storage/v1/object/public/${bucket}/`;

export async function storageRequest(endpoint, { method = 'GET', body, contentType = 'application/json' } = {}) {
  const response = await fetch(`${supabaseUrl}/storage/v1/${endpoint}`, {
    method, body, signal: AbortSignal.timeout(15000),
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': contentType, 'Cache-Control': 'max-age=31536000' },
  });
  if (!response.ok) {
    const error = new Error('Image storage is unavailable. Check the Supabase configuration.');
    error.status = response.status;
    throw error;
  }
  return response;
}
export async function uploadWebp(filename, buffer) {
  if (!/^[a-f0-9-]{36}\.webp$/.test(filename)) throw new Error('Invalid image filename.');
  await storageRequest(`object/${bucket}/${filename}`, { method: 'POST', body: buffer, contentType: 'image/webp' });
  return publicImagePrefix + filename;
}
