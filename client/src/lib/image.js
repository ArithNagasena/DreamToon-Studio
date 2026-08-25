/**
 * Client-side image preparation for profile pictures.
 *
 * A phone photograph is several megabytes and the wrong shape. Cropping to a
 * square and downscaling here means the network, the database and every list
 * that renders the picture all deal with a predictable ~30 kB thumbnail, and
 * the designer never sees an upload rejected for being "too big".
 */
export const AVATAR_SIZE = 256;
export const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

export async function fileToAvatarDataUrl(file, size = AVATAR_SIZE) {
  if (!file) throw new Error('Choose an image file.');
  if (!/^image\/(png|jpe?g|webp|gif|bmp)$/i.test(file.type))
    throw new Error('Choose a PNG, JPEG or WebP image.');
  if (file.size > MAX_SOURCE_BYTES)
    throw new Error('That file is very large — try one under 12 MB.');

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';

    // centre-crop to a square first, so nothing is squashed
    const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const sx = ((img.naturalWidth || img.width) - side) / 2;
    const sy = ((img.naturalHeight || img.height) - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

    // JPEG keeps a photograph small; quality steps down only if it has to
    for (const quality of [0.86, 0.72, 0.6]) {
      const out = canvas.toDataURL('image/jpeg', quality);
      if (out.length <= 200_000) return out;
    }
    throw new Error('That picture could not be made small enough.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be read as an image.'));
    img.src = url;
  });
}
