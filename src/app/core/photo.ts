import { Injectable, inject } from '@angular/core';

import { AiService, ContentPart } from './ai.service';

/** A box around something in a picture. Every value is 0 to 1000, relative to the picture's size. */
export interface Box {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export const PHOTO_SIZE = 320;

/**
 * The square to cut out for a profile photo: centred on the box, with some room around the face,
 * never bigger than the picture and never outside it. Returns pixel values.
 */
export function cropRect(box: Box, width: number, height: number, padding = 0.22): { x: number; y: number; size: number } {
  const cx = ((box.xmin + box.xmax) / 2 / 1000) * width;
  const cy = ((box.ymin + box.ymax) / 2 / 1000) * height;
  const w = ((box.xmax - box.xmin) / 1000) * width;
  const h = ((box.ymax - box.ymin) / 1000) * height;
  const size = Math.max(8, Math.min(Math.max(w, h) * (1 + padding * 2), width, height));
  const x = Math.min(Math.max(cx - size / 2, 0), width - size);
  const y = Math.min(Math.max(cy - size / 2, 0), height - size);
  return { x: Math.round(x), y: Math.round(y), size: Math.round(size) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the picture.'));
    img.src = url;
  });
}

/** Cuts a square out of a picture and returns it as a small JPEG data URL. */
async function cutSquare(source: string, pick: (w: number, h: number) => { x: number; y: number; size: number }): Promise<string> {
  const img = await loadImage(source);
  const r = pick(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  ctx.drawImage(img, r.x, r.y, r.size, r.size, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  return canvas.toDataURL('image/jpeg', 0.84);
}

/** The photo found by the AI, cut out of the picture it was found in. */
export function cropPhoto(source: string, box: Box): Promise<string> {
  return cutSquare(source, (w, h) => cropRect(box, w, h));
}

/** A photo the user chose: the middle square of the picture. */
export async function squarePhotoFromFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    return await cutSquare(url, (w, h) => {
      const size = Math.min(w, h);
      return { x: Math.round((w - size) / 2), y: Math.round((h - size) / 2), size };
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A photo from a picture the user gave: the face if it can be found, else the middle square. */
export function squarePhotoFromUrl(url: string): Promise<string> {
  return cutSquare(url, (w, h) => {
    const size = Math.min(w, h);
    return { x: Math.round((w - size) / 2), y: Math.round((h - size) / 2), size };
  });
}

/** Reads the AI's answer about where the photo is. Returns null when there is no photo or the answer is unusable. */
export function parsePhotoAnswer(raw: string, imageCount: number): { image: number; box: Box } | null {
  const m = /\{[\s\S]*\}/.exec(raw ?? '');
  if (!m) {
    return null;
  }
  try {
    const d = JSON.parse(m[0]) as { photo?: { image?: number; box?: number[] } | null };
    const p = d.photo;
    if (!p || !Array.isArray(p.box) || p.box.length !== 4) {
      return null;
    }
    const [a, b, c, e] = p.box.map((v) => Math.max(0, Math.min(1000, Number(v))));
    const image = Math.round(Number(p.image ?? 1));
    if (![a, b, c, e].every(Number.isFinite) || c - a < 20 || e - b < 20 || image < 1 || image > imageCount) {
      return null;
    }
    return { image, box: { ymin: a, xmin: b, ymax: c, xmax: e } };
  } catch {
    return null;
  }
}

/** Finds the profile photo in the pictures of an uploaded resume, using the AI's eyes. */
@Injectable({ providedIn: 'root' })
export class PhotoService {
  private ai = inject(AiService);


  /** The user's own picture, cropped around the face when the AI can find it. */
  async fromPicture(url: string): Promise<string> {
    return (await this.findPhoto([url])) ?? (await squarePhotoFromUrl(url));
  }

  async findPhoto(images: string[]): Promise<string | null> {
    const candidates = images.filter(Boolean).slice(0, 3);
    if (!candidates.length) {
      return null;
    }
    const content: ContentPart[] = [
      {
        type: 'text',
        text:
          'These are pictures of a resume or a person. Is there a small picture of a person on it: a profile photo, portrait, headshot, illustration or avatar of a face, ' +
          'usually round or square, near the name at the top or in a side column (not a logo, icon, chart or QR code)? If it could be a profile picture, say yes. If yes, give the number of the picture it is in and a tight box around the face and shoulders. ' +
          'Reply with JSON only: {"photo": null} or {"photo": {"image": 1, "box": [ymin, xmin, ymax, xmax]}} where every box value is a whole number ' +
          'from 0 to 1000, relative to the width and height of that picture.',
      },
    ];
    candidates.forEach((url, i) => {
      content.push({ type: 'text', text: `Picture ${i + 1}:` }, { type: 'image_url', image_url: { url } });
    });
    try {
      const ask = (fast: boolean) => this.ai.chat([{ role: 'user', content }], 1200, { fast, temperature: 0 });
      let r = await ask(true);
      let found = parsePhotoAnswer(r.content, candidates.length);
      if (!found) {
        // the quick model found nothing, or gave a cut-off answer: a missed photo is worse than one more question, so ask the best model
        r = await ask(false);
        found = parsePhotoAnswer(r.content, candidates.length);
      }
      return found ? await cropPhoto(candidates[found.image - 1], found.box) : null;
    } catch {
      return null; // no photo is better than a failed resume
    }
  }
}
