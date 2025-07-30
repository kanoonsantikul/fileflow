'use strict'

import { state } from './state.js';

const MAX_CONCURRENT = 50;

export function enqueueImageLoad(task) {
  return new Promise((resolve, reject) => {
    if (!state.allowEnqueue) {
      return resolve(null);
    }

    const wrappedTask = async () => {
      try {
        state.activeLoads++;
        const result = await task();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        state.activeLoads--;
        if (state.loadQueue.length > 0) {
          const next = state.loadQueue.shift();
          next();
        }
      }
    };

    if (state.activeLoads < MAX_CONCURRENT) {
      wrappedTask();
    } else {
      state.loadQueue.push(wrappedTask);
    }
  });
}

export async function flushImageLoadQueue() {
  state.allowEnqueue = false;

  while (state.activeLoads > 0 || state.loadQueue.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  state.loadQueue.length = 0;
  state.allowEnqueue = true;
}

export async function resizeImage(filePath, maxSize = 150) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (state.thumbURLMap.has(filePath)) {
          URL.revokeObjectURL(state.thumbURLMap.get(filePath));
        }

        const newURL = URL.createObjectURL(blob);
        state.thumbURLMap.set(filePath, newURL);
        resolve(newURL);
      }, 'image/jpeg', 0.85);
    };
    img.onerror = reject;
    img.src = `file://${filePath}?v=${Date.now()}`;
  });
}

export async function resizeVideoFirstFrame(filePath, maxSize = 150) {
  const MAX_SEEK_ATTEMPTS = 50;
  const SEEK_STEP = 0.1;
  const BLACK_THRESHOLD = 0.8;
  const LUMA_CUTOFF = 15;

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = `file://${filePath}?v=${Date.now()}`;

    let attempts = 0;

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = 0;
    });

    video.addEventListener('seeked', () => {
      const scale = Math.min(
        maxSize / video.videoWidth,
        maxSize / video.videoHeight,
        1
      );
      const canvas = document.createElement('canvas');
      canvas.width  = video.videoWidth  * scale;
      canvas.height = video.videoHeight * scale;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let darkPixels = 0;
      for (let i = 0; i < frameData.length; i += 4) {
        const r = frameData[i];
        const g = frameData[i + 1];
        const b = frameData[i + 2];
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        if (y < LUMA_CUTOFF) darkPixels++;
      }
      const darkRatio = darkPixels / (frameData.length / 4);

      if (darkRatio < BLACK_THRESHOLD || attempts >= MAX_SEEK_ATTEMPTS) {
        canvas.toBlob(blob => {
          if (state.thumbURLMap.has(filePath)) {
            URL.revokeObjectURL(state.thumbURLMap.get(filePath));
          }
          const newURL = URL.createObjectURL(blob);
          state.thumbURLMap.set(filePath, newURL);
          resolve(newURL);

          video.pause();
          video.removeAttribute('src');
          video.load();
        }, 'image/jpeg', 0.85);
      } else {
        attempts++;
        const nextTime = video.currentTime + SEEK_STEP;
        if (nextTime < video.duration) {
          video.currentTime = nextTime;
        } else {
          attempts = MAX_SEEK_ATTEMPTS;
          video.currentTime = video.duration;
        }
      }
    });

    video.addEventListener('error', (e) => {
      reject(new Error('Failed to load video: ' + e.message));
    });
  });
}
