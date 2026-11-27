import { app, BrowserWindow, session } from 'electron'
import { DUPLICATE_LIMITS } from '../../shared/contracts/duplicates'
import { imageInfo, type DecodedPhoto, type ImageInfo } from './imageFormat'

const document =
  'data:text/html;base64,' +
  Buffer.from(
    "<!doctype html><meta charset=utf-8><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src blob:; base-uri 'none'; form-action 'none'\"><title>Sentinel isolated image decoder</title>"
  ).toString('base64')
const decodeTimeoutMs = 4500
const previewPattern = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/

// The only variable input to the expression is base64 bytes and validated scalar options.
function decodeExpression(encoded: string, header: ImageInfo, preview: boolean): string {
  return `(async () => {
    const params = ${JSON.stringify({ encoded, header, preview, thumbnail: DUPLICATE_LIMITS.thumbnail })};
    const image = await createImageBitmap(
      new Blob([Uint8Array.from(atob(params.encoded), c => c.charCodeAt(0))], { type: 'image/' + params.header.format }),
      { imageOrientation: 'from-image' }
    ).catch(() => null);
    if (!image) return null;
    try {
      const {width, height} = image;
      const dimensions = params.header;
      if (!(width === dimensions.width && height === dimensions.height) &&
          !(width === dimensions.height && height === dimensions.width)) return null;
      const canvas = document.createElement('canvas');
      canvas.width = 9;
      canvas.height = 8;
      let context = canvas.getContext('2d', {willReadFrequently:true});
      if (!context) return null;
      context.fillStyle = '#fff'; context.fillRect(0,0,9,8);
      context.drawImage(image, 0, 0, 9, 8);
      const pixels = context.getImageData(0,0,9,8).data;
      const sample = Array.from({ length: 72 }, (_, here) => {
        const i = here * 4;
        return (77 * pixels[i] + 150 * pixels[i + 1] + 29 * pixels[i + 2]) >> 8;
      });
      if (!params.preview) return {width, height, sample, preview:null};
      const scale = Math.min(1, params.thumbnail / Math.max(width,height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context = canvas.getContext('2d');
      if (!context) return null;
      context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return {width, height, sample, preview:canvas.toDataURL('image/png')};
    } finally { image.close(); }
  })()`
}

export class ImageDecoder {
  private window: BrowserWindow | null = null
  private ready: Promise<void> | null = null
  private busy = false
  private failures = 0

  private open(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window
    const isolated = session.fromPartition('sentinel-isolated-photos', { cache: false })
    isolated.setPermissionCheckHandler(() => false)
    isolated.setPermissionRequestHandler((_, __, respond) => respond(false))
    isolated.webRequest.onBeforeRequest((details, respond) => {
      respond({ cancel: details.url !== document })
    })
    const win = new BrowserWindow({
      show: false,
      width: 320,
      height: 240,
      skipTaskbar: true,
      webPreferences: {
        session: isolated,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        webSecurity: true,
        webviewTag: false,
        backgroundThrottling: false
      }
    })
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.webContents.on('will-frame-navigate', (event) => event.preventDefault())
    win.webContents.on('will-redirect', (event) => event.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.window = win
    this.ready = win.loadURL(document)
    return win
  }

  async decode(
    data: Uint8Array,
    format: ImageInfo['format'],
    preview: boolean
  ): Promise<DecodedPhoto | 'unavailable' | null> {
    if (
      this.busy ||
      this.failures >= 3 ||
      !app.isReady() ||
      data.byteLength > DUPLICATE_LIMITS.photoBytes
    )
      return 'unavailable'
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    const pngChunks = format === 'png' ? ([] as Buffer[]) : undefined
    let header: ImageInfo
    try {
      header = imageInfo(bytes, format, pngChunks)
    } catch {
      return null
    }
    this.busy = true
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const win = this.open()
      const result: unknown = await Promise.race([
        this.ready!.then(() => {
          const encoded = (pngChunks ? Buffer.concat(pngChunks) : bytes).toString('base64')
          return win.webContents.executeJavaScript(decodeExpression(encoded, header, preview))
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Decoder timed out')), decodeTimeoutMs)
        })
      ])
      if (!result || typeof result !== 'object') return null
      const reading = result as Partial<DecodedPhoto>
      if (
        !Number.isInteger(reading.width) ||
        !Number.isInteger(reading.height) ||
        reading.width! <= 0 ||
        reading.height! <= 0 ||
        reading.width! * reading.height! > DUPLICATE_LIMITS.photoPixels ||
        !Array.isArray(reading.sample) ||
        reading.sample.length !== 72 ||
        !reading.sample.every((v) => Number.isInteger(v) && v >= 0 && v <= 255) ||
        (reading.preview !== null &&
          (typeof reading.preview !== 'string' ||
            reading.preview.length > 210_000 ||
            !previewPattern.test(reading.preview)))
      )
        return null
      return reading as DecodedPhoto
    } catch {
      this.failures++
      this.close()
      return 'unavailable'
    } finally {
      clearTimeout(timer)
      this.busy = false
    }
  }

  close(): void {
    const win = this.window
    this.window = null
    this.ready = null
    if (win && !win.isDestroyed()) win.destroy()
  }
}
