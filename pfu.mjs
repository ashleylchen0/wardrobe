import { putFromUrl, head, del } from '@vercel/blob';
const src = 'https://image.uniqlo.com/UQ/ST3/WesternCommon/imagesgoods/459565/item/goods_09_459565.jpg';
try {
  const blob = await putFromUrl('items/test-fetch.webp', src, {
    access: 'private', addRandomSuffix: true,
    optimizeImage: { width: 1200, quality: 82, format: 'webp' },
  });
  const h = await head(blob.pathname);
  console.log('stored :', blob.pathname);
  console.log('type   :', h.contentType);
  console.log('size   :', (h.size/1024).toFixed(0), 'KB');
  await del(blob.pathname);
  console.log('cleaned up');
} catch (e) { console.log('FAILED:', e.message); }
