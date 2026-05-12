const el = document.getElementById('book-summary');
if (el) {
  const isNl = navigator.language.toLowerCase().startsWith('nl');
  const text = isNl
    ? (el.dataset.nl || el.dataset.en)
    : (el.dataset.en || el.dataset.nl);
  if (text) el.textContent = text;
}
