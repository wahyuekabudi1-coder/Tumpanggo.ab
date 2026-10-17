/**
 * Compresses an image file client-side to a maximum resolution and downscales the quality.
 * This ensures that the Base64 representation is extremely small (typically <100KB)
 * and never exceeds Firestore's 1MB document size limit.
 * 
 * @param file The image File to compress
 * @param maxWidth Maximum width of the compressed image (default: 800)
 * @param maxHeight Maximum height of the compressed image (default: 800)
 * @param quality Compression quality from 0.0 to 1.0 (default: 0.6)
 * @returns Promise resolving to a base64 string (DataURL) of the compressed image
 */
export function compressImage(
  file: File,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.6
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions to maintain aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback to original reader result if canvas context is unavailable
          resolve(event.target?.result as string);
          return;
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses a Base64 DataURL directly.
 * Useful for signature canvases or existing Base64 strings.
 * 
 * @param base64Str The original Base64 string / DataURL
 * @param maxWidth Maximum width (default: 800)
 * @param maxHeight Maximum height (default: 800)
 * @param quality Compression quality from 0.0 to 1.0 (default: 0.6)
 * @returns Promise resolving to compressed Base64 DataURL
 */
export function compressBase64(
  base64Str: string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.6
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!base64Str || !base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };
    img.onerror = (err) => reject(err);
    img.src = base64Str;
  });
}
