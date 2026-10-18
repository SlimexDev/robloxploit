import sharp from 'sharp';
import { query, db } from '../server/db.js';
import { saveImage } from '../server/images.js';

const demos = [
  { title: 'Blox Fruits — Start your adventure', game: 'Blox Fruits', tag: 'BLOX FRUITS', subtitle: 'THE NEXT ADVENTURE', colors: ['#164443', '#76d3a0'], type: 0 },
  { title: 'RIVALS — Ready for the next round', game: 'RIVALS', tag: 'RIVALS', subtitle: 'READY. SET. PLAY.', colors: ['#47232a', '#fca176'], type: 1 },
  { title: '99 Nights — Explore the forest', game: '99 Nights in the Forest', tag: '99 NIGHTS', subtitle: 'INTO THE UNKNOWN', colors: ['#182d38', '#89b4c5'], type: 2 },
  { title: 'Grow a Garden — Make it your own', game: 'Grow a Garden', tag: 'GROW A GARDEN', subtitle: 'MAKE SOMETHING GROW', colors: ['#324326', '#d1de84'], type: 0 },
  { title: 'Fisch — Beyond the shore', game: 'Fisch', tag: 'FISCH', subtitle: 'BEYOND THE SHORE', colors: ['#1b3751', '#81c4f0'], type: 2 },
  { title: 'Blade Ball — A new challenge', game: 'Blade Ball', tag: 'BLADE BALL', subtitle: 'A NEW CHALLENGE', colors: ['#382752', '#c3a2f8'], type: 1 },
];

try {
  const [count] = await query('SELECT COUNT(*) AS total FROM scripts');
  if (Number(count.total)) { console.log('Database already contains scripts; seed skipped.'); }
  else {
    for (const [index, item] of demos.entries()) {
      const [bg, accent] = item.colors;
      const art = item.type === 0
        ? `<path d="M400 180 510 120 620 180 510 245Z" fill="${accent}" opacity=".75"/><path d="M400 180v75l110 65v-75Z" fill="${accent}" opacity=".4"/><path d="M510 245v75l110-65v-75Z" fill="${accent}" opacity=".25"/><path d="m510 120 0-75m-20 30 20-30 20 30" stroke="${accent}" stroke-width="8" fill="none"/>`
        : item.type === 1
          ? `<circle cx="510" cy="180" r="94" fill="none" stroke="${accent}" stroke-width="2" opacity=".35"/><circle cx="510" cy="180" r="60" fill="none" stroke="${accent}" stroke-width="18" opacity=".65"/><path d="m550 70-90 115h50l-35 105 100-135h-60Z" fill="${accent}"/>`
          : `<circle cx="525" cy="112" r="51" fill="${accent}" opacity=".55"/><path d="m335 330 110-180 70 100 48-70 110 150Z" fill="${accent}" opacity=".23"/><path d="m410 330 100-165 120 165Z" fill="${accent}" opacity=".38"/><path d="M350 300h320M390 318h245" stroke="${accent}" opacity=".35" stroke-width="2"/>`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 700 394"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="#101018"/></linearGradient><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0v32" fill="none" stroke="#ffffff" stroke-opacity=".035"/></pattern></defs><rect width="700" height="394" fill="url(#g)"/><rect width="700" height="394" fill="url(#p)"/><circle cx="530" cy="200" r="180" fill="none" stroke="${accent}" opacity=".08"/>${art}<text x="34" y="55" fill="${accent}" font-family="Arial" font-size="12" letter-spacing="4">ROBLOXPLOIT / COLLECTION 0${index + 1}</text><text x="34" y="199" fill="#ffffff" font-family="Arial" font-weight="900" font-size="${item.tag.length > 10 ? 31 : 47}">${item.tag}</text><text x="36" y="229" fill="${accent}" font-family="Arial" font-size="11" letter-spacing="3">${item.subtitle}</text><rect x="34" y="274" width="88" height="25" rx="4" fill="#ffffff" opacity=".08"/><text x="46" y="291" fill="#ffffff" opacity=".65" font-family="Arial" font-size="10" letter-spacing="2">DEMO ART</text></svg>`;
      const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
      const image = await saveImage({ buffer });
      await query('INSERT INTO scripts (title, game, description, code, image, published, created_at) VALUES (?, ?, ?, ?, ?, 1, DATE_SUB(NOW(), INTERVAL ? HOUR))', [item.title, item.game, `A demo library entry for ${item.game}.\n\nThis sample Lua code only prints a greeting; it is not a functional game script. Edit the content, replace the cover, or delete this demo from the admin dashboard.`, `-- RobloXploit demo: ${item.game}\n-- Replace this sample from the admin panel.\nprint("Hello from RobloXploit!")`, image, index * 4]);
    }
    console.log('Added 6 clearly labeled demo scripts with original WebP cover artwork.');
  }
} finally { await db.end(); }
