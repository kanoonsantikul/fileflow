'use strict'

import { state } from './state.js';
import { getFileName, isVideoFile } from './utils.js';
import { enqueueImageLoad, resizeImage, resizeVideoFirstFrame, flushImageLoadQueue } from './image.js';
import { openFullMedia } from './dom.js';
import { createDragPreview, onMouseMove, onMouseUp } from './drag.js';

export function createItem(path) {
  const filename = getFileName(path);
  const srcImage = state.itemMap.get(path)?.querySelector('img.thumb')?.src;

  const item = document.createElement('div');
  item.className = srcImage ? 'item' : 'item loading';

  const thumbWrapper = document.createElement('div');
  thumbWrapper.className = 'thumb-wrapper';
  thumbWrapper.style.position = 'relative';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = `Image ${filename}`;
  img.className = 'thumb';
  img.draggable = false;

  thumbWrapper.appendChild(img);

  if (isVideoFile(path)) {
    const indicator = document.createElement('div');
    indicator.className = 'video-indicator';
    indicator.innerHTML = `
      <svg viewBox="0 0 24 24" fill="white" width="16" height="16">
        <path d="M8 5v14l11-7z"/>
      </svg>
    `;
    thumbWrapper.appendChild(indicator);
    item.classList.add('video');
  }

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = filename;

  item.appendChild(thumbWrapper);
  item.appendChild(label);

  if (!srcImage) {
    enqueueImageLoad(() => {
      if (isVideoFile(path)) {
        return resizeVideoFirstFrame(path, 150);
      } else {
        return resizeImage(path, 150);
      }
    })
    .then(resizedURL => {
      img.src = resizedURL;
      item.classList.remove('loading');
    })
    .catch(err => {
      console.error('Thumbnail load failed for:', path, err);
    });
  } else {
    img.src = srcImage;
  }

  return item;
}

export function updateFolderInfo() {
  const folderName = state.lastFolderPath.split(/[\\/]/).pop();
  const itemCount = state.paths.length;

  const folderInfo = document.getElementById('folder-info');
  if (folderInfo) {
    folderInfo.textContent = `– ${folderName} (${itemCount} items)`;
  }
}

export async function renderGrid(originalPaths) {
  await flushImageLoadQueue();

  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  state.paths = originalPaths;
  state.selectedItems.clear();
  state.lastSelectedIndex = null;
  state.itemMap.clear();

  for (const url of state.thumbURLMap.values()) {
    URL.revokeObjectURL(url);
  }
  state.thumbURLMap.clear();

  const observer = new ResizeObserver(() => {
    updateGridMetrics();
    updateItemsPosition();
  });
  observer.observe(grid);

  updateFolderInfo();
  state.paths.forEach((path, _) => {
    const item = createItem(path);
    item.setAttribute('data-path', path);
    grid.appendChild(item);
    state.itemMap.set(path, item);

    item.addEventListener('mousedown', (event) => {
      if (event.button !== 0) { // left click
        return;
      }

      event.preventDefault();
      const currentIndex = state.paths.indexOf(path);

      // Ctrl key → toggle selection
      if (event.ctrlKey || (event.shiftKey && state.lastSelectedIndex == null)) {
        if (state.selectedItems.has(path)) {
          state.selectedItems.delete(path);
          if (state.selectedItems.size == 0) {
            state.lastSelectedIndex = null;
          }
          item.classList.remove('selected');
        } else {
          state.selectedItems.add(path);
          item.classList.add('selected');
          state.lastSelectedIndex = currentIndex;
        }
        return;
      }

      // Shift key → select range
      if (event.shiftKey) {
        const [start, end] = [
          Math.min(state.lastSelectedIndex, currentIndex),
          Math.max(state.lastSelectedIndex, currentIndex),
        ];

        // Add range selection
        for (let i = start; i <= end; i++) {
          const p = state.paths[i];
          state.selectedItems.add(p);
          state.itemMap.get(p).classList.add('selected');
        }
        return;
      }

      const startX = event.clientX;
      const startY = event.clientY;
      let moved = false;

      const onMouseMoveCheck = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          moved = true;
          window.removeEventListener('mousemove', onMouseMoveCheck);

          if (!state.selectedItems.has(path)) {
            state.selectedItems.forEach((_, p) => {
              state.itemMap.get(p).classList.remove('selected');
            });
            state.selectedItems.clear();
            state.selectedItems.add(path);
            item.classList.add('placeholder');
          }

          createDragPreview(event, state.selectedItems);

          window.addEventListener('mousemove', onMouseMove);
          window.addEventListener('mouseup', onMouseUp);
        }
      };

      const onMouseUpCheck = () => {
        window.removeEventListener('mousemove', onMouseMoveCheck);
        window.removeEventListener('mouseup', onMouseUpCheck);

        if (!moved) {
          openFullMedia(path);
        }
      };

      window.addEventListener('mousemove', onMouseMoveCheck);
      window.addEventListener('mouseup', onMouseUpCheck);
    });
  });

  updateGridMetrics();
  updateItemsPosition();
}

export function updateGridMetrics() {
  const sampleItem = state.itemMap.values().next().value;
  if (!sampleItem) return;

  const rect = sampleItem.getBoundingClientRect();
  state.itemWidth = rect.width + 12;
  state.itemHeight = rect.height + 12;
  state.cols = Math.floor(document.getElementById('grid').clientWidth / state.itemWidth);

  const rowCount = Math.ceil(state.paths.length / state.cols);
  document.getElementById('grid').style.height = `${rowCount * state.itemHeight}px`;
}

function calculatePosition(index) {
  const row = Math.floor(index / state.cols);
  const col = index % state.cols;
  const totalWidth = state.cols * state.itemWidth;
  const gridWidth = document.getElementById('grid').clientWidth;
  const offsetX = (gridWidth - totalWidth) / 2;
  return {
    x: offsetX + col * state.itemWidth,
    y: row * state.itemHeight
  };
}

export function updateItemsPosition() {
  state.paths.forEach((path, index) => {
    const el = state.itemMap.get(path);
    const pos = calculatePosition(index);
    const targetTransform = `translate(${pos.x}px, ${pos.y}px)`;
    if (el.style.transform !== targetTransform) {
      el.style.transform = targetTransform;
    }
  });
}
