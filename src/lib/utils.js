'use strict'

export function getFileName(filePath) {
  return filePath.split(/[/\\]/).pop();
}

export function isVideoFile(filePath) {
  return /\.(mp4|mov|avi|mkv|webm)$/i.test(filePath);
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
