'use strict'

export const state = {
  lastFolderPath: null,
  paths: [],
  itemMap: new Map(),
  selectedItems: new Set(),
  thumbURLMap: new Map(),
  currentImagePath: null,
  draggedIndex: null,
  lastTargetIndex: null,
  previewElement: null,
  previewOffsetX: 0,
  previewOffsetY: 0,
  latestClientY: 0,
  scrollIntervalId: null,
  allowEnqueue: true,
  activeLoads: 0,
  loadQueue: [],
};
