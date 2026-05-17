import { desktopCapturer, screen } from 'electron';

// Capture the primary display as a PNG, returned as base64. Strips the data URL prefix.
// We deliberately do NOT write the screenshot to disk — it lives in memory only,
// is sent to GPT-4.1 mini for one request, and is discarded.
export async function captureScreen(): Promise<string> {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.size;
  // Scale down for token efficiency — vision models don't need full 4K.
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width:  Math.round(width  * scale),
      height: Math.round(height * scale),
    },
  });
  const source = sources[0];
  if (!source) throw new Error('No screen source available');
  const dataUrl = source.thumbnail.toDataURL();      // "data:image/png;base64,..."
  const base64  = dataUrl.replace(/^data:image\/png;base64,/, '');
  return base64;
}
