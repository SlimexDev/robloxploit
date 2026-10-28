import { randomBytes } from 'node:crypto';
import helmet from 'helmet';

export function isMonetag(ad) {
  return Boolean(ad?.enabled && (!ad.type || ad.type === 'embed') && typeof ad.html === 'string'
    && /src=["']https:\/\/quge5\.com\/88\/tag\.min\.js["']/.test(ad.html)
    && /data-zone=["']302956["']/.test(ad.html));
}

export function configurePublicAds(res, ads, deployed = Boolean(process.env.VERCEL)) {
  res.locals.ads = ads;
  res.locals.monetagEnabled = deployed && isMonetag(ads.banner);
  if (!res.locals.monetagEnabled) return;
  res.locals.scriptNonce = randomBytes(24).toString('base64');
  // Only nonce-authorized scripts and their loaded children run; no arbitrary inline scripts.
  helmet.contentSecurityPolicy({ directives: {
    'script-src': ["'self'", `'nonce-${res.locals.scriptNonce}'`, "'strict-dynamic'", 'https://www.youtube.com', 'https://quge5.com', 'https://5gvci.com'],
    'frame-src': ["'self'", 'https:'],
    'connect-src': ["'self'", 'https:'],
    'img-src': ["'self'", 'https:', 'data:', 'blob:'],
    'style-src': ["'self'", 'https:', "'unsafe-inline'"],
    'worker-src': ["'self'"],
    'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null,
  } })({}, res, () => {});
}
