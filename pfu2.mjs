import { putFromUrl, del } from '@vercel/blob';
const t0 = Date.now();
const el = () => ((Date.now()-t0)/1000).toFixed(1)+'s';
const src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/320px-PNG_transparency_demonstration_1.png';
try {
  console.log('calling putFromUrl…');
  const blob = await putFromUrl('items/t.webp', src, {
    access: 'private', addRandomSuffix: true,
    optimizeImage: { width: 600, quality: 82, format: 'webp' },
    abortSignal: AbortSignal.timeout(40000),
  });
  console.log(el(), 'ok ->', blob.pathname);
  await del(blob.pathname);
  console.log('cleaned up');
} catch (e) {
  console.log(el(), 'FAILED:', e.name, '|', String(e.message).slice(0,250));
}
process.exit(0);
