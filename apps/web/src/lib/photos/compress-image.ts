// ---------------------------------------------------------------------------
// Image Compression Utility for offline photo capture
// ---------------------------------------------------------------------------

/**
 * Compress an image file/blob to reduce size for storage and upload
 * @param file - The source image file or blob
 * @param maxDimension - Maximum width or height (default 2048)
 * @param quality - JPEG quality 0-1 (default 0.85)
 * @returns Compressed image as Blob
 */
export async function compressImage(
  file: File | Blob,
  maxDimension = 2048,
  quality = 0.85,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      try {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height / width) * maxDimension);
            width = maxDimension;
          } else {
            width = Math.round((width / height) * maxDimension);
            height = maxDimension;
          }
        }

        // Use OffscreenCanvas if available, otherwise fall back to regular canvas
        let canvas: HTMLCanvasElement | OffscreenCanvas;
        let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

        if (typeof OffscreenCanvas !== 'undefined') {
          canvas = new OffscreenCanvas(width, height);
          ctx = canvas.getContext('2d');
        } else {
          canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          ctx = canvas.getContext('2d');
        }

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw image to canvas (this resizes it)
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob
        if (canvas instanceof OffscreenCanvas) {
          canvas.convertToBlob({ type: 'image/jpeg', quality }).then(resolve).catch(reject);
        } else {
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to compress image'));
              }
            },
            'image/jpeg',
            quality,
          );
        }
      } catch (error: unknown) {
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Get image dimensions without loading full image
 */
export async function getImageDimensions(
  file: File | Blob,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}
