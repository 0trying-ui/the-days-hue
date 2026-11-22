// Background thread for photos: decode, shrink and JPEG-encode without touching the page's main thread,
// so animations keep running while large phone photos are processed.
// Request: { id, file, size, by: 'long' | 'short', quality, as: 'dataurl' | 'blob' }
self.onmessage = async ({ data }) => {
  const { id, file, size, by, quality, as } = data;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const side = by === 'short' ? Math.min(bmp.width, bmp.height) : Math.max(bmp.width, bmp.height);
    const k = Math.min(1, size / side),
      w = Math.max(1, Math.round(bmp.width * k)),
      h = Math.max(1, Math.round(bmp.height * k));
    const c = new OffscreenCanvas(w, h),
      g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality });
    const out = as === 'blob' ? blob : new FileReaderSync().readAsDataURL(blob);
    self.postMessage({ id, out });
  } catch (e) {
    self.postMessage({ id, error: String((e && e.message) || e) });
  }
};
