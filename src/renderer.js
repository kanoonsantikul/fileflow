'use strict'

let lastFolderPath = null;

const grid = document.getElementById('grid');
let cols = 0;
let itemWidth = 0;
let itemHeight = 0;

let paths;
const itemMap = new Map();
const selectedItems = new Set();
const thumbURLMap = new Map();

let currentImagePath = null;

let draggedIndex = null;
let lastTargetIndex = null;
let previewElement = null;
let previewOffsetX = 0;
let previewOffsetY = 0;

let latestClientY = 0;
let scrollIntervalId = null;
const SCROLL_MARGIN = 60;
const SCROLL_SPEED = 20;

const MAX_CONCURRENT = 50;
let allowEnqueue = true;
let activeLoads = 0;
const loadQueue = [];

function enqueueImageLoad(task) {
  return new Promise((resolve, reject) => {
    if (!allowEnqueue) {
      // Skip or immediately resolve to prevent queuing during rerender
      return resolve(null);
    }

    const wrappedTask = async () => {
      try {
        activeLoads++;
        const result = await task();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        activeLoads--;
        if (loadQueue.length > 0) {
          const next = loadQueue.shift();
          next();
        }
      }
    };

    if (activeLoads < MAX_CONCURRENT) {
      wrappedTask();
    } else {
      loadQueue.push(wrappedTask);
    }
  });
}

async function flushImageLoadQueue() {
  // Prevent any new enqueues
  allowEnqueue = false;

  // Wait until no active tasks and queue is empty
  while (activeLoads > 0 || loadQueue.length > 0) {
    console.log(`activeLoads:${activeLoads}, loadQueue size:${loadQueue.length}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Clear queue (if anything was added just before allowEnqueue flipped)
  loadQueue.length = 0;

  // Re-enable enqueue
  allowEnqueue = true;
}

function getFileName(filePath) {
  return filePath.split(/[/\\]/).pop();
}

function isVideoFile(filePath) {
  return /\.(mp4|mov|avi|mkv|webm)$/i.test(filePath);
}

function startAutoScroll() {
  if (scrollIntervalId) return;
  const wrapper = document.querySelector('.scroll-wrapper');
  scrollIntervalId = setInterval(() => {
    const rect = wrapper.getBoundingClientRect();
    if (latestClientY < rect.top + SCROLL_MARGIN) {
      wrapper.scrollTop -= SCROLL_SPEED;
    } else if (latestClientY > rect.bottom - SCROLL_MARGIN) {
      wrapper.scrollTop += SCROLL_SPEED;
    }
  }, 16);
}

function stopAutoScroll() {
  clearInterval(scrollIntervalId);
  scrollIntervalId = null;
}

function createItem(path) {
  const filename = getFileName(path);
  const srcImage = itemMap.get(path)?.querySelector('img.thumb')?.src;

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

function openFullMedia(path) {
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-img');
  const modalVideo = document.getElementById('modal-video');
  const sizeDisplay = document.getElementById('file-size');

  currentImagePath = path;

  window.api.getFileSize(path).then(size => {
    if (size) {
      sizeDisplay.textContent = `File Size: ${formatBytes(size)}`;
    } else {
      sizeDisplay.textContent = `File Size: --`;
    }
  });

  if (isVideoFile(path)) {
    modalImg.style.display = 'none';
    modalVideo.style.display = 'block';

    modalVideo.src = `file://${path}`;
    modalVideo.play();
  } else {
    modalImg.style.display = 'block';
    modalVideo.style.display = 'none';

    modalImg.src = `file://${path}`;
  }

  modal.classList.remove('hidden');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function closeFullMedia() {
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-img');
  const modalVideo = document.getElementById('modal-video');

  if (modalVideo.src) {
    modalVideo.pause();
    modalVideo.removeAttribute('src');
    modalVideo.load();
  }
  modalImg.removeAttribute('src');

  currentImagePath = null;

  modal.classList.add('hidden');
}

document.getElementById('image-modal').addEventListener('click', (event) => {
  if (event.target.id === 'image-modal' || event.target.classList.contains('modal-backdrop')) {
    closeFullMedia();
  }
});

function createDragPreview(event, selectedItems) {
  if (selectedItems.size === 1) {
    previewElement = createItem(Array.from(selectedItems)[0]);
    previewElement.classList.add('drag-preview');
  } else {
    previewElement = document.createElement('div');
    previewElement.className = 'item multi-drag-preview';
    previewElement.textContent = `${selectedItems.size} item(s)`;
  }

  document.body.appendChild(previewElement);

  const rect = event.target.getBoundingClientRect();
  previewOffsetX = event.clientX - rect.left;
  previewOffsetY = event.clientY - rect.top;
  movePreview(event);
}

function movePreview(event) {
  if (previewElement) {
    previewElement.style.left = `${event.pageX - previewOffsetX}px`;
    previewElement.style.top = `${event.pageY - previewOffsetY}px`;
  }
}

function getOffset(element) {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX
  };
}

function onMouseMove(event) {
  latestClientY = event.clientY;
  movePreview(event);
  startAutoScroll();

  const { top: gridTop, left: gridLeft } = getOffset(grid);
  const x = event.pageX - gridLeft;
  const y = event.pageY - gridTop;

  const col = Math.floor(x / itemWidth);
  const row = Math.floor(y / itemHeight);
  const targetIndex = row * cols + col;

  if (
    draggedIndex !== null &&
    targetIndex >= 0 &&
    targetIndex < paths.length &&
    targetIndex !== lastTargetIndex
  ) {
    // to get selected items with preserve order
    const draggedItems = paths.filter(i => selectedItems.has(i));
    if (draggedItems.length === 0) return;

    paths = paths.filter(i => !selectedItems.has(i));
    paths.splice(targetIndex, 0, ...draggedItems);

    draggedIndex = targetIndex;
    lastTargetIndex = targetIndex;

    updateItemsPosition(targetIndex);
  }
}

function onMouseUp() {
  if (previewElement) {
    previewElement.remove();
    previewElement = null;
  }

  stopAutoScroll();
  updateItemsPosition();

  const isSingle = selectedItems.size === 1;
  selectedItems.forEach((element, id) => {
    itemMap.get(id).classList.remove(isSingle ? 'placeholder' : 'selected');
  });

  draggedIndex = null;
  lastTargetIndex = null;
  selectedItems.clear();

  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
}

function updateFolderInfo() {
  const folderName = lastFolderPath.split(/[\\/]/).pop();
  const itemCount = paths.length;

  const folderInfo = document.getElementById('folder-info');
  if (folderInfo) {
    folderInfo.textContent = `– ${folderName} (${itemCount} items)`;
  }
}

async function renderGrid(originalPaths) {
  await flushImageLoadQueue();

  grid.innerHTML = '';

  paths = originalPaths;
  selectedItems.clear();
  itemMap.clear();

  // Cleanup all old blob URLs before re-rendering
  for (const url of thumbURLMap.values()) {
    URL.revokeObjectURL(url);
  }
  thumbURLMap.clear();

  const observer = new ResizeObserver(() => {
    updateGridMetrics();
    updateItemsPosition();
  });
  observer.observe(grid);

  updateFolderInfo();
  paths.forEach((path, index) => {
    const item = createItem(path);
    item.setAttribute('data-path', path);
    grid.appendChild(item);
    itemMap.set(path, item);

    item.addEventListener('mousedown', (event) => {
      if (event.button !== 0) { // left click
        return;
      }

      event.preventDefault();

      if (event.shiftKey) {
        if (selectedItems.has(path)) {
          selectedItems.delete(path);
          item.classList.remove('selected');
        } else {
          selectedItems.add(path);
          item.classList.add('selected');
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

          // Select one item
          if (!selectedItems.has(path)) {
            selectedItems.forEach((_, id) => {
              itemMap.get(id).classList.remove('selected');
            });
            selectedItems.clear();
            selectedItems.add(path);
            item.classList.add('placeholder');
          }

          draggedIndex = index;
          createDragPreview(event, selectedItems);

          window.addEventListener('mousemove', onMouseMove);
          window.addEventListener('mouseup', onMouseUp);
        }
      };

      const onMouseUpCheck = () => {
        window.removeEventListener('mousemove', onMouseMoveCheck);
        window.removeEventListener('mouseup', onMouseUpCheck);

        if (!moved) {
          openFullMedia(path); //Only opens if no movement and no shift
        }
      };

      window.addEventListener('mousemove', onMouseMoveCheck);
      window.addEventListener('mouseup', onMouseUpCheck);
    });
  });

  window.addEventListener('contextmenu', (event) => {
    event.preventDefault();

    selectedItems.forEach((_, id) => {
      itemMap.get(id).classList.remove('selected');
    });
    selectedItems.clear();
  });

  updateGridMetrics();
  updateItemsPosition();
}

function updateGridMetrics() {
  const sampleItem = itemMap.values().next().value;
  if (!sampleItem) return;

  const rect = sampleItem.getBoundingClientRect();
  itemWidth = rect.width + 12;
  itemHeight = rect.height + 12;
  cols = Math.floor(grid.clientWidth / itemWidth);

  const rowCount = Math.ceil(paths.length / cols);
  grid.style.height = `${rowCount * itemHeight}px`;
}

function calculatePosition(index) {
  const row = Math.floor(index / cols);
  const col = index % cols;
  const totalWidth = cols * itemWidth;
  const gridWidth = grid.clientWidth;
  const offsetX = (gridWidth - totalWidth) / 2;
  return {
    x: offsetX + col * itemWidth,
    y: row * itemHeight
  };
}

function updateItemsPosition() {
  paths.forEach((item, index) => {
    const el = itemMap.get(item);
    const pos = calculatePosition(index);
    const targetTransform = `translate(${pos.x}px, ${pos.y}px)`;
    if (el.style.transform !== targetTransform) {
      el.style.transform = targetTransform;
    }
  });
}

async function resizeImage(filePath, maxSize = 150) {
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
        if (thumbURLMap.has(filePath)) {
          URL.revokeObjectURL(thumbURLMap.get(filePath));
        }

        const newURL = URL.createObjectURL(blob);
        thumbURLMap.set(filePath, newURL);
        resolve(newURL);
      }, 'image/jpeg', 0.85);
    };
    img.onerror = reject;
    img.src = `file://${filePath}?v=${Date.now()}`;
  });
}

async function resizeVideoFirstFrame(filePath, maxSize = 150) {
  const MAX_SEEK_ATTEMPTS = 50;     // safety cap (e.g., 5 s if we step 0.1 s)
  const SEEK_STEP = 0.1;            // seconds to jump each time
  const BLACK_THRESHOLD = 0.8;     // 95 % pixels dark → treat as black
  const LUMA_CUTOFF = 15;           // 0-255 luma considered “dark”

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = `file://${filePath}?v=${Date.now()}`;

    let attempts = 0;

    video.addEventListener('loadedmetadata', () => {
      // Start at first frame
      video.currentTime = 0;
    });

    video.addEventListener('seeked', () => {
      // Draw current frame to canvas
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

      // Quick black-frame test
      const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let darkPixels = 0;
      for (let i = 0; i < frameData.length; i += 4) {
        const r = frameData[i];
        const g = frameData[i + 1];
        const b = frameData[i + 2];
        // simple luma approximation
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        if (y < LUMA_CUTOFF) darkPixels++;
      }
      const darkRatio = darkPixels / (frameData.length / 4);

      // If not mostly black OR out of attempts → accept this frame
      if (darkRatio < BLACK_THRESHOLD || attempts >= MAX_SEEK_ATTEMPTS) {
        canvas.toBlob(blob => {
          if (thumbURLMap.has(filePath)) {
            URL.revokeObjectURL(thumbURLMap.get(filePath));
          }
          const newURL = URL.createObjectURL(blob);
          thumbURLMap.set(filePath, newURL);
          resolve(newURL);

          // Clean up
          video.pause();
          video.removeAttribute('src');
          video.load();
        }, 'image/jpeg', 0.85);
      } else {
        // Seek to next step and test again
        attempts++;
        const nextTime = video.currentTime + SEEK_STEP;
        if (nextTime < video.duration) {
          video.currentTime = nextTime;
        } else {
          // End reached, accept last (still black) frame
          attempts = MAX_SEEK_ATTEMPTS; // force accept next iteration
          video.currentTime = video.duration; // triggers seeked again
        }
      }
    });

    video.addEventListener('error', (e) => {
      reject(new Error('Failed to load video: ' + e.message));
    });
  });
}

document.getElementById('select-folder-button').addEventListener('click', async () => {
  try {
    const sortOption = document.getElementById('sort-options').value;
    const originalPaths = await window.api.selectFolder(sortOption);

    if (!originalPaths || originalPaths.length === 0) {
      alert("No image or video files found.");
      return;
    }

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('scroll-wrapper').classList.remove('hidden');
    document.getElementById('control-buttons').classList.remove('hidden');

    lastFolderPath = originalPaths[0].split(/[\\/]/).slice(0, -1).join('/');
    renderGrid(originalPaths);
  } catch (err) {
    console.error("Error selecting folder", err);
  }
});

document.getElementById('reorder-button').addEventListener('click', () => {
  if (!paths || paths.length === 0) {
    return;
  }

  const firstName = getFileName(paths[0]);
  const match = firstName.match(/^[^\d]+/);
  const suggestedPrefix = match ? match[0] : 'img_';

  const modal = document.getElementById('rename-modal');
  const input = document.getElementById('prefix-input');
  input.value = suggestedPrefix;

  modal.classList.remove('hidden');
});

document.getElementById('cancel-rename').addEventListener('click', () => {
  document.getElementById('rename-modal').classList.add('hidden');
});

document.getElementById('confirm-rename').addEventListener('click', async () => {
  const prefix = document.getElementById('prefix-input').value.trim();
  const startNumber = parseInt(document.getElementById('start-number-input').value, 10) || 0;

  if (!prefix) {
    alert("Please enter a valid prefix.");
    return;
  }

  document.getElementById('rename-modal').classList.add('hidden');

  const result = await window.api.reorderImages(paths, prefix, startNumber);

  if (result.success) {
    renderGrid(result.newPaths);
  } else {
    alert("Error reordering files: " + result.error);
  }
});

document.getElementById('reload-button').addEventListener('click', async () => {
  if (!lastFolderPath) {
    alert("No folder selected yet.");
    return;
  }

  try {
    const sortOption = document.getElementById('sort-options').value;
    const originalPaths = await window.api.readFolder(lastFolderPath, sortOption);
    renderGrid(originalPaths);
  } catch (err) {
    console.error("Error reloading folder", err);
    alert("Failed to reload folder.");
  }
});

window.api.onLockedFileAction(async (fileName) => {
  const userChoice = await showLockedFileModal(fileName);
  return userChoice;
});

function showLockedFileModal(fileName) {
  return new Promise((resolve) => {
    const modal = document.getElementById('locked-file-modal');
    const message = document.getElementById('locked-file-message');
    message.textContent = `"${fileName}" is currently open and cannot be renamed.`;

    modal.classList.remove('hidden');

    const skipBtn = document.getElementById('skip-file');
    const retryBtn = document.getElementById('retry-file');
    const cancelBtn = document.getElementById('cancel-rename-op');

    function cleanUp(choice) {
      modal.classList.add('hidden');
      skipBtn.removeEventListener('click', onSkip);
      retryBtn.removeEventListener('click', onRetry);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(choice);
    }

    function onSkip() { cleanUp('skip'); }
    function onRetry() { cleanUp('retry'); }
    function onCancel() { cleanUp('cancel'); }

    skipBtn.addEventListener('click', onSkip);
    retryBtn.addEventListener('click', onRetry);
    cancelBtn.addEventListener('click', onCancel);
  });
}

document.getElementById('title-center').addEventListener('click', () => {
  document.getElementById('start-screen').classList.remove('hidden');
});

document.getElementById('start-screen').addEventListener('click', (event) => {
  if (event.target.id == 'start-screen' && paths?.length > 0) {
    document.getElementById('start-screen').classList.add('hidden');
  }
})

document.getElementById('delete-button').addEventListener('click', () => {
  document.getElementById('confirm-delete-modal').classList.remove('hidden');
});

document.getElementById('confirm-delete').addEventListener('click', async () => {
  const deletePath = currentImagePath;
  console.log(`Deleting file: ${deletePath}`);

  if (!deletePath) {
    console.error("Error deleting file: current image path null");
    return;
  }

  document.getElementById('confirm-delete-modal').classList.add('hidden');
  closeFullMedia();

  try {
    await window.api.deleteFile(deletePath);
    removeDeletedItem(deletePath);
  } catch (err) {
    console.error("Error deleting file", err);
    alert("Failed to delete file.");
  }

  document.getElementById('confirm-delete-modal').classList.add('hidden');
});

function removeDeletedItem(deletePath) {
  paths = paths.filter(p => p !== deletePath);
  itemMap.delete(deletePath);
  selectedItems.delete(deletePath);

  const thumbURL = thumbURLMap.get(deletePath);
  if (thumbURL) {
    URL.revokeObjectURL(thumbURL);
    thumbURLMap.delete(deletePath);
  }

  const itemElement = document.querySelector(`.item[data-path="${CSS.escape(deletePath)}"]`);
  if (itemElement) {
    itemElement.remove();
  } else {
    console.error(`Not found item: ${deletePath}`);
  }

  updateFolderInfo();
  updateGridMetrics();
  updateItemsPosition();
}

document.getElementById('cancel-delete').addEventListener('click', () => {
  document.getElementById('confirm-delete-modal').classList.add('hidden');
});

document.addEventListener('DOMContentLoaded', function() {
  const minimizeButton = document.getElementById('minimize-btn');
  const maximizeButton = document.getElementById('maximize-btn');
  const closeButton = document.getElementById('close-btn');

  // Minimize button
  minimizeButton.addEventListener('click', () => {
    window.api.minimize();
  });

  // Maximize/Restore button
  maximizeButton.addEventListener('click', () => {
    window.api.maximize();
  });

  // Close button
  closeButton.addEventListener('click', () => {
    window.api.close();
  });
});