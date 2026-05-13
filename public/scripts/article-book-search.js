(function () {
  const input     = document.getElementById('book-search-input');
  const results   = document.getElementById('book-search-results');
  const articleId = input?.dataset.articleId;
  if (!input || !articleId) return;

  let timer;

  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(search, 280);
  });

  function currentBookIds() {
    return Array.from(document.querySelectorAll('[data-book-id]'))
      .map(el => el.dataset.bookId)
      .filter(Boolean);
  }

  async function addBook(bookId, btn) {
    btn.disabled = true;
    btn.textContent = '…';
    await fetch('/admin/articles/' + articleId + '/books/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'book_id=' + bookId,
    });
    window.location.reload();
  }

  async function search() {
    const q = input.value.trim();
    if (q.length < 2) { results.innerHTML = ''; return; }

    const params = new URLSearchParams({ q, exclude: currentBookIds().join(',') });
    let books;
    try {
      books = await fetch('/admin/articles/books/search?' + params).then(r => r.json());
    } catch { return; }

    if (!books.length) {
      results.innerHTML = '<p style="color:#aaa;font-size:13px;padding:6px 0">Geen resultaten.</p>';
      return;
    }

    results.innerHTML = books.map(b => `
      <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #f0f0ee">
        <div style="flex-shrink:0;width:32px;text-align:center">
          ${b.cover_path
            ? `<img src="/${b.cover_path}" width="32" style="object-fit:contain;vertical-align:middle;display:inline-block">`
            : '<div style="width:32px;height:44px;background:#eee;display:inline-block"></div>'}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.title}</div>
          <div style="font-size:12px;color:#888">${b.author}${b.goodreads_rating ? ' · ★ ' + Number(b.goodreads_rating).toFixed(1) : ''}</div>
        </div>
        <button class="btn btn-primary" data-add-id="${b.id}"
          style="flex-shrink:0;padding:5px 14px;font-size:12px;white-space:nowrap">
          + Toevoegen
        </button>
      </div>
    `).join('');

    results.querySelectorAll('[data-add-id]').forEach(btn => {
      btn.addEventListener('click', () => addBook(btn.dataset.addId, btn));
    });
  }
})();
