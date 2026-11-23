'use strict';
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
function decodePracticeImage(nativeImage, value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64 ||
      !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Choose a PNG or JPEG image up to 6 MiB.');
  const bytes = Buffer.from(value.slice(value.indexOf(',') + 1), 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Image exceeds 6 MiB.');
  // Check encoded dimensions before native decode to reject oversized images.
  if (value.startsWith('data:image/png;')) {
    if (bytes.length < 24 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid PNG.');
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    if (!width || !height || width*height>12000000) throw new Error('Image exceeds 12 megapixels.');
  }
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) throw new Error('The image could not be read.');
  const { width, height } = image.getSize();
  if (width*height>12000000) throw new Error('Image exceeds 12 megapixels.');
  return image;
}
module.exports = { decodePracticeImage, MAX_IMAGE_BYTES };
