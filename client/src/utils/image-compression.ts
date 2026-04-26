/**
 * Image compression utilities for site visit photo uploads
 * These functions help reduce file sizes to prevent 413 errors
 */

/**
 * Compress a base64 image by reducing quality and dimensions
 */
export function compressImage(
  base64Image: string, 
  maxWidth: number = 1280, 
  maxHeight: number = 720, 
  quality: number = 0.6
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        canvas.width = width;
        canvas.height = height;
        
        // Draw image with new dimensions
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to base64 with compression
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      } catch (error) {
        reject(error);
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image for compression'));
    };
    
    img.src = base64Image;
  });
}

/**
 * Estimate the file size in bytes from a base64 string
 */
export function estimateFileSize(base64String: string): number {
  // Remove data URL prefix if present
  const base64Data = base64String.replace(/^data:image\/[a-z]+;base64,/, '');
  
  // Calculate size: base64 uses 4 characters for every 3 bytes
  const padding = (base64Data.match(/=/g) || []).length;
  return (base64Data.length * 3) / 4 - padding;
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Check if image needs compression based on file size
 */
export function shouldCompressImage(base64Image: string, maxSizeBytes: number = 2 * 1024 * 1024): boolean {
  const fileSize = estimateFileSize(base64Image);
  return fileSize > maxSizeBytes;
}

/**
 * Automatically compress image if it exceeds size limits
 */
export async function autoCompressIfNeeded(
  base64Image: string, 
  maxSizeBytes: number = 2 * 1024 * 1024
): Promise<string> {
  if (!shouldCompressImage(base64Image, maxSizeBytes)) {
    return base64Image;
  }
  
  console.log(`Image size ${formatFileSize(estimateFileSize(base64Image))} exceeds limit, compressing...`);
  
  // Try different compression levels
  let compressed = base64Image;
  let quality = 0.8;
  
  while (shouldCompressImage(compressed, maxSizeBytes) && quality > 0.3) {
    compressed = await compressImage(base64Image, 1280, 720, quality);
    quality -= 0.1;
    console.log(`Compressed to ${formatFileSize(estimateFileSize(compressed))} with quality ${quality + 0.1}`);
  }
  
  // If still too large, reduce dimensions
  if (shouldCompressImage(compressed, maxSizeBytes)) {
    compressed = await compressImage(base64Image, 800, 600, 0.5);
    console.log(`Final compression: ${formatFileSize(estimateFileSize(compressed))}`);
  }
  
  return compressed;
}