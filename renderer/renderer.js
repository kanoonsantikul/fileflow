const imageList = document.getElementById('image-list');
const renameBtn = document.getElementById('rename-btn');
const prefixInput = document.getElementById('prefix');
const selectBtn = document.getElementById('select-btn');

let filePaths = [];

selectBtn.addEventListener('click', async () => {
  const result = await window.api.selectFolder();
  if (!result) return;

  filePaths = result.images;
  renderImages();
});

function renderImages() {
  imageList.innerHTML = '';
  filePaths.forEach((path, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${path.split(/[\\/]/).pop()}`;
    li.draggable = true;
    li.dataset.index = i;
    imageList.appendChild(li);
    addDragListeners(li);
  });
}

function addDragListeners(el) {
  el.addEventListener('dragstart', e => {
    el.classList.add('dragging');
    e.dataTransfer.setData('text/plain', el.dataset.index);
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  el.addEventListener('dragover', e => e.preventDefault());
  el.addEventListener('drop', e => {
    e.preventDefault();
    const from = +e.dataTransfer.getData('text/plain');
    const to = +el.dataset.index;
    const moved = filePaths.splice(from, 1)[0];
    filePaths.splice(to, 0, moved);
    renderImages();
  });
}

renameBtn.addEventListener('click', async () => {
  const prefix = prefixInput.value.trim();
  if (!prefix || filePaths.length === 0) return alert('Enter prefix and select a folder!');
  await window.api.renameImages(filePaths, prefix);
  alert('Images renamed successfully!');
  filePaths = [];
  imageList.innerHTML = '';
});
