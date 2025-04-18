const imageList = document.getElementById('image-list');
const renameBtn = document.getElementById('rename-btn');
const selectBtn = document.getElementById('select-btn');
const mainApp = document.getElementById('main-app');
const startScreen = document.getElementById('start-screen');

let items = [];
let dragSrcIndex = null;
let placeholder = null;
let placeholderIndex = null;

function renderImages() {
  imageList.innerHTML = '';
  items.forEach((path, i) => {
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.index = i;

    const ext = path.split('.').pop().toLowerCase();

    if (['mp4', 'webm'].includes(ext)) {
      const video = document.createElement('video');
      video.src = path;
      video.muted = true;
      video.addEventListener('loadeddata', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 140;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = document.createElement('img');
        img.src = canvas.toDataURL();
        img.className = 'thumbnail';
        li.prepend(img);
      });
    } else {
      const img = document.createElement('img');
      img.src = path;
      img.className = 'thumbnail';
      li.appendChild(img);
    }

    const label = document.createElement('div');
    label.textContent = path.split(/[\\/]/).pop();
    li.appendChild(label);

    imageList.appendChild(li);
    addDragListeners(li);
  });
}

function getPrefix(filename) {
  const name = filename.split('.')[0]; // remove extension
  const match = name.match(/^(.*?)(\d+)$/); // match like: name + number
  return match ? match[1] : 'photo';
}

selectBtn.addEventListener('click', async () => {
  const result = await window.api.selectFolder();
  if (!result) return;

  items = result.images;
  startScreen.style.display = 'none';
  mainApp.style.display = 'block';
  renameBtn.style.display = 'block';
  renderOnce();
});

renameBtn.addEventListener('click', async () => {
  if (items.length === 0) return alert('No files to rename.');

  const firstName = items[0].split(/[\\/]/).pop();
  const prefix = getPrefix(firstName);

  await window.api.renameImages(items, prefix);
  alert('Renamed successfully!');
});
