'use strict'

const grid = document.getElementById('grid');
let cols = 0;
let itemWidth = 0;
let itemHeight = 0;

let paths;
const itemMap = new Map();
const selectedItems = new Set();

let draggedIndex = null;
let lastTargetIndex = null;
let previewElement = null;
let previewOffsetX = 0;
let previewOffsetY = 0;

let latestClientY = 0;
let scrollIntervalId = null;
const SCROLL_MARGIN = 60;
const SCROLL_SPEED = 20;

function getFileName(path) {
  return path.split('/').pop();
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
  item.className = 'item';

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

  resizeImage(path, 150).then(resizedURL => {
    img.src = resizedURL;
  });

  return item;
}

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
  console.log(event);
  
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

function renderGrid() {
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
        const url = URL.createObjectURL(blob);
        resolve(url);
      }, 'image/jpeg', 0.85);
    };
    img.onerror = reject;
    img.src = filePath;
  });
}

document.getElementById('select-folder-button').addEventListener('click', async () => {
  try {
    const dirHandle = await window.showDirectoryPicker();
    const newPaths = [];

    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === 'file' && /\.(jpe?g|png|webp|gif)$/i.test(name)) {
        const file = await handle.getFile();
        const url = URL.createObjectURL(file);
        newPaths.push({ url, name });
      }
    }

    if (newPaths.length === 0) {
      alert("No image files found in this folder.");
      return;
    }

    // Hide start screen
    document.getElementById('start-screen').style.display = 'none';

    // Replace paths and rerender
    paths = newPaths.map(p => p.url);
    itemMap.clear();
    grid.innerHTML = '';
    renderGrid();
  } catch (err) {
    console.error("Folder selection cancelled or failed", err);
  }
});

document.getElementById('reorder-button').addEventListener('click', async () => {
  //TODO
});