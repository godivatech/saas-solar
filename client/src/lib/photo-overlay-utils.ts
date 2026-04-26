/**
 * Photo Overlay Utilities
 * Reusable functions for adding timestamp and location overlays to captured photos
 */

export interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  accuracy: number;
}

export interface PhotoOverlayOptions {
  timestamp?: Date;
  location?: LocationData;
  overlayType: 'checkin' | 'checkout' | 'site_visit' | 'custom';
  customLabel?: string;
}

/**
 * Adds timestamp and location overlay to a captured photo
 * @param canvas The canvas element containing the photo
 * @param options Overlay configuration options
 * @returns Modified canvas with overlay
 */
export function addPhotoOverlay(canvas: HTMLCanvasElement, options: PhotoOverlayOptions): HTMLCanvasElement {
  const context = canvas.getContext('2d');
  if (!context) return canvas;

  const { timestamp = new Date(), location, overlayType, customLabel } = options;

  // Overlay configuration
  const overlayHeight = 80;
  const padding = 10;
  const lineHeight = 14;
  const fontSize = 14;
  const fontFamily = 'Arial';

  // Add dark overlay background
  context.fillStyle = 'rgba(0, 0, 0, 0.7)';
  context.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);

  // Configure text style
  context.fillStyle = 'white';
  context.font = `${fontSize}px ${fontFamily}`;

  // Add timestamp
  const typeLabel = getTypeLabel(overlayType, customLabel);
  const timestampText = `${typeLabel}: ${timestamp.toLocaleString()}`;
  context.fillText(timestampText, padding, canvas.height - overlayHeight + 20);

  // Add location if provided
  if (location) {
    const maxWidth = canvas.width - (padding * 2);
    const words = location.address.split(' ');
    let line = '';
    let y = canvas.height - overlayHeight + 35;
    let isFirstLine = true;

    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = context.measureText(testLine);

      if (metrics.width > maxWidth && line !== '') {
        const prefix = isFirstLine ? 'Location: ' : '';
        context.fillText(`${prefix}${line.trim()}`, padding, y);
        line = word + ' ';
        y += lineHeight;
        isFirstLine = false;
      } else {
        line = testLine;
      }
    }

    // Draw remaining text
    if (line.trim()) {
      const prefix = isFirstLine ? 'Location: ' : '';
      context.fillText(`${prefix}${line.trim()}`, padding, y);
    }
  }

  return canvas;
}

/**
 * Gets the appropriate label for the overlay type
 */
function getTypeLabel(type: PhotoOverlayOptions['overlayType'], customLabel?: string): string {
  if (customLabel) return customLabel;
  
  switch (type) {
    case 'checkin':
      return 'Check-in';
    case 'checkout':
      return 'Checkout';
    case 'site_visit':
      return 'Site Visit';
    default:
      return 'Photo';
  }
}

/**
 * Captures photo from video element with overlay
 * @param video Video element to capture from
 * @param canvas Canvas element to draw on
 * @param options Overlay options
 * @returns Base64 data URL of the captured photo with overlay
 */
export function capturePhotoWithOverlay(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  options: PhotoOverlayOptions
): string | null {
  const context = canvas.getContext('2d');
  if (!context || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  // Set canvas size to video size
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Draw video frame to canvas
  context.drawImage(video, 0, 0);

  // Add overlay
  addPhotoOverlay(canvas, options);

  // Convert to base64
  return canvas.toDataURL('image/jpeg', 0.8);
}