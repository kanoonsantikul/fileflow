'use strict'

import { state } from './state.js';
import { createItem, updateItemsPosition } from './grid.js';

const SCROLL_MARGIN = 60;
const SCROLL_SPEED = 20;

function startAutoScroll() {
  if (state.scrollIntervalId) return;
  const wrapper = document.querySelector('.scroll-wrapper');
  state.scrollIntervalId = setInterval(() => {
    const rect = wrapper.getBoundingClientRect();
    if (state.latestClientY < rect.top + SCROLL_MARGIN) {
      wrapper.scrollTop -= SCROLL_SPEED;
    } else if (state.latestClientY > rect.bottom - SCROLL_MARGIN) {
      wrapper.scrollTop += SCROLL_SPEED;
    }
  }, 16);
}

function stopAutoScroll() {
  clearInterval(state.scrollIntervalId);
  state.scrollIntervalId = null;
}

export function createDragPreview(event, selectedItems) {
  if (selectedItems.size === 1) {
    state.previewElement = createItem(Array.from(selectedItems)[0]);
    state.previewElement.classList.add('drag-preview');
  } else {
    state.previewElement = document.createElement('div');
    state.previewElement.className = 'item multi-drag-preview';
    state.previewElement.textContent = `${selectedItems.size} item(s)`;
  }

  document.body.appendChild(state.previewElement);

  const rect = event.target.getBoundingClientRect();
  state.previewOffsetX = event.clientX - rect.left;
  state.previewOffsetY = event.clientY - rect.top;
  movePreview(event);
}

function movePreview(event) {
  if (state.previewElement) {
    state.previewElement.style.left = `${event.pageX - state.previewOffsetX}px`;
    state.previewElement.style.top = `${event.pageY - state.previewOffsetY}px`;
  }
}

function getOffset(element) {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX
  };
}

export function onMouseMove(event) {
  state.latestClientY = event.clientY;
  movePreview(event);
  startAutoScroll();

  const grid = document.getElementById('grid');
  const { top: gridTop, left: gridLeft } = getOffset(grid);
  const x = event.pageX - gridLeft;
  const y = event.pageY - gridTop;

  const col = Math.floor(x / state.itemWidth);
  const row = Math.floor(y / state.itemHeight);
  const targetIndex = row * state.cols + col;

  if (
    targetIndex >= 0 &&
    targetIndex < state.paths.length &&
    targetIndex !== state.lastTargetIndex
  ) {
    const draggedItems = state.paths.filter(i => state.selectedItems.has(i));
    if (draggedItems.length === 0) return;

    state.paths = state.paths.filter(i => !state.selectedItems.has(i));
    state.paths.splice(targetIndex, 0, ...draggedItems);

    state.lastTargetIndex = targetIndex;

    updateItemsPosition(targetIndex);
  }
}

export function onMouseUp() {
  if (state.previewElement) {
    state.previewElement.remove();
    state.previewElement = null;
  }

  stopAutoScroll();
  updateItemsPosition();

  const isSingle = state.selectedItems.size === 1;
  state.selectedItems.forEach((element, path) => {
    state.itemMap.get(path).classList.remove(isSingle ? 'placeholder' : 'selected');
  });

  state.lastTargetIndex = null;
  state.selectedItems.clear();
  state.lastSelectedIndex = null;

  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
}
