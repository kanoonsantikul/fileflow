'use strict'

const grid = document.getElementById('grid');
let cols = 0;
let itemWidth = 0;
let itemHeight = 0;

let paths;
let pathsBackup;
const itemMap = new Map();
const selectedItems = new Set();
const thumbURLMap = new Map();

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
let activeLoads = 0;
const loadQueue = [];

function enqueueImageLoad(task) {
  return new Promise((resolve, reject) => {
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

  const item = document.createElement('div');
  item.className = 'item loading';

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = `Image ${filename}`;
  img.className = 'thumb';
  img.draggable = false;

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = filename;

  item.appendChild(img);
  item.appendChild(label);

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
  return item;
}

function openFullMedia(path) {
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-img');
  const modalVideo = document.getElementById('modal-video');
  
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

document.getElementById('image-modal').addEventListener('click', (e) => {
  if (e.target.id === 'image-modal' || e.target.classList.contains('modal-backdrop')) {
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-img');
    const modalVideo = document.getElementById('modal-video');
    
    if (modalVideo.src) {
      modalVideo.pause();
      modalVideo.src = '';
    }
    modalImg.src = '';
    
    modal.classList.add('hidden');
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

function renderGrid(originalPaths) {
  paths = originalPaths;
  pathsBackup = [...paths];
  itemMap.clear();
  grid.innerHTML = '';

  // 🔥 Cleanup all old blob URLs before re-rendering
  for (const url of thumbURLMap.values()) {
    URL.revokeObjectURL(url);
  }
  thumbURLMap.clear();

  const observer = new ResizeObserver(() => {
    updateGridMetrics();
    updateItemsPosition();
  });
  observer.observe(grid);

  paths.forEach((path, index) => {
    const item = createItem(path);
    grid.appendChild(item);
    itemMap.set(path, item);

    item.addEventListener('mousedown', (event) => {
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
            selectedItems.forEach((element, id) => {
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
          openFullMedia(path); // ✅ Only opens if no movement and no shift
        }
      };

      window.addEventListener('mousemove', onMouseMoveCheck);
      window.addEventListener('mouseup', onMouseUpCheck);
    });
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
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = `file://${filePath}?v=${Date.now()}`;

    // Ensure video metadata is loaded
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = 0;  // Move to the first frame

      // Wait until the first frame is available
      video.addEventListener('seeked', () => {
        // Scale the video frame to fit maxSize
        const scale = Math.min(maxSize / video.videoWidth, maxSize / video.videoHeight, 1);
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert canvas to blob and create object URL
        canvas.toBlob(blob => {
          if (thumbURLMap.has(filePath)) {
            URL.revokeObjectURL(thumbURLMap.get(filePath));
          }

          const newURL = URL.createObjectURL(blob);
          thumbURLMap.set(filePath, newURL);
          resolve(newURL);
        }, 'image/jpeg', 0.85);
      });
    });

    video.addEventListener('error', (e) => {
      reject(new Error('Failed to load video: ' + e.message));
    });
  });
}

document.getElementById('select-folder-button').addEventListener('click', async () => {
  try {
    const originalPaths = await window.fileAPI.selectFolder();
    if (!originalPaths || originalPaths.length === 0) {
      alert("No image files found.");
      return;
    }

    document.getElementById('start-screen').style.display = 'none';

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
  if (!prefix) {
    alert("Please enter a valid prefix.");
    return;
  }

  document.getElementById('rename-modal').classList.add('hidden');

  const result = await window.fileAPI.reorderImages(paths, prefix);

  if (result.success) {
    renderGrid(result.newPaths);
  } else {
    alert("Error reordering files: " + result.error);
  }
});

document.getElementById('reset-button').addEventListener('click', () => {
  renderGrid([...pathsBackup]);
});