'use strict'

import { state } from './state.js';
import { getFileName, isVideoFile, formatBytes } from './utils.js';
import { renderGrid, updateFolderInfo, updateGridMetrics, updateItemsPosition } from './grid.js';

export function openFullMedia(path) {
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-img');
  const modalVideo = document.getElementById('modal-video');
  const sizeDisplay = document.getElementById('file-size');
  const prevButton = document.getElementById('prev-button');
  const nextButton = document.getElementById('next-button');

  state.currentImagePath = path;

  const fileName = getFileName(path);

  window.api.getFileSize(path).then(size => {
    if (size) {
      sizeDisplay.textContent = `${fileName} — ${formatBytes(size)}`;
    } else {
      sizeDisplay.textContent = `${fileName} — Size: --`;
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

  const currentIndex = state.paths.indexOf(path);
  prevButton.style.display = currentIndex === 0 ? 'none' : 'block';
  nextButton.style.display = currentIndex === state.paths.length - 1 ? 'none' : 'block';

  modal.classList.remove('hidden');
}

export function closeFullMedia() {
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-img');
  const modalVideo = document.getElementById('modal-video');
  const prevButton = document.getElementById('prev-button');
  const nextButton = document.getElementById('next-button');

  if (modalVideo.src) {
    modalVideo.pause();
    modalVideo.removeAttribute('src');
    modalVideo.load();
  }
  modalImg.removeAttribute('src');

  state.currentImagePath = null;

  modal.classList.add('hidden');
  prevButton.style.display = 'none';
  nextButton.style.display = 'none';
}

export function removeDeletedItem(deletePath) {
  state.paths = state.paths.filter(p => p !== deletePath);
  state.itemMap.delete(deletePath);
  state.selectedItems.delete(deletePath);

  const thumbURL = state.thumbURLMap.get(deletePath);
  if (thumbURL) {
    URL.revokeObjectURL(thumbURL);
    state.thumbURLMap.delete(deletePath);
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

export function showLockedFileModal(fileName) {
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

export function setupEventListeners() {
  document.getElementById('minimize-btn').addEventListener('click', () => {
    window.api.minimize();
  });

  document.getElementById('maximize-btn').addEventListener('click', () => {
    window.api.maximize();
  });

  document.getElementById('close-btn').addEventListener('click', () => {
    window.api.close();
  });

  document.getElementById('prev-button').addEventListener('click', () => {
    const currentIndex = state.paths.indexOf(state.currentImagePath);
    openFullMedia(state.paths[currentIndex - 1]);
  });

  document.getElementById('next-button').addEventListener('click', () => {
    const currentIndex = state.paths.indexOf(state.currentImagePath);
    openFullMedia(state.paths[currentIndex + 1]);
  });

  document.getElementById('image-modal').addEventListener('click', (event) => {
    if (event.target.id === 'image-modal' || event.target.classList.contains('modal-backdrop')) {
      closeFullMedia();
    }
  });

  document.addEventListener('keydown', (event) => {
    const imageModal = document.getElementById('image-modal');
    if (!imageModal.classList.contains('hidden')) {
      if (event.key === 'ArrowLeft') {
        document.getElementById('prev-button').click();
      } else if (event.key === 'ArrowRight') {
        document.getElementById('next-button').click();
      }
    }
  });

  window.addEventListener('contextmenu', (event) => {
    event.preventDefault();

    state.selectedItems.forEach((_, id) => {
      state.itemMap.get(id).classList.remove('selected');
    });
    state.selectedItems.clear();
  });

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

      state.lastFolderPath = originalPaths[0].split(/[\\/]/).slice(0, -1).join('/');
      renderGrid(originalPaths);
    } catch (err) {
      console.error("Error selecting folder", err);
    }
  });

  document.getElementById('reorder-button').addEventListener('click', () => {
    if (!state.paths || state.paths.length === 0) {
      return;
    }

    const firstName = getFileName(state.paths[0]);
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

    const result = await window.api.reorderImages(state.paths, prefix, startNumber);

    if (result.success) {
      renderGrid(result.newPaths);
    } else {
      alert("Error reordering files: " + result.error);
    }
  });

  document.getElementById('reload-button').addEventListener('click', async () => {
    if (!state.lastFolderPath) {
      alert("No folder selected yet.");
      return;
    }

    try {
      const sortOption = document.getElementById('sort-options').value;
      const originalPaths = await window.api.readFolder(state.lastFolderPath, sortOption);
      renderGrid(originalPaths);
    } catch (err) {
      console.error("Error reloading folder", err);
      alert("Failed to reload folder.");
    }
  });

  document.getElementById('title-center').addEventListener('click', () => {
    document.getElementById('start-screen').classList.remove('hidden');
  });

  document.getElementById('start-screen').addEventListener('click', (event) => {
    if (event.target.id == 'start-screen' && state.paths?.length > 0) {
      document.getElementById('start-screen').classList.add('hidden');
    }
  })

  document.getElementById('delete-button').addEventListener('click', () => {
    document.getElementById('confirm-delete-modal').classList.remove('hidden');
  });

  document.getElementById('confirm-delete').addEventListener('click', async () => {
    const deletePath = state.currentImagePath;
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

  document.getElementById('cancel-delete').addEventListener('click', () => {
    document.getElementById('confirm-delete-modal').classList.add('hidden');
  });

  window.api.onLockedFileAction(async (fileName) => {
    const userChoice = await showLockedFileModal(fileName);
    return userChoice;
  });
}
