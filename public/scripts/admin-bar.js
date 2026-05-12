fetch('/api/auth-status')
  .then(r => r.json())
  .then(({ authenticated }) => {
    if (!authenticated) return;

    const editUrl  = document.body.dataset.editUrl;
    const bookTitle = document.body.dataset.bookTitle;
    if (!editUrl) return;

    const bar = document.createElement('div');
    bar.id = 'admin-bar';
    bar.innerHTML = `
      <span class="admin-bar-label">📚 Admin</span>
      <a href="${editUrl}" class="admin-bar-btn">✏️ Bewerk dit boek</a>
      <a href="/admin/" class="admin-bar-link">Dashboard</a>
      <a href="/admin/books" class="admin-bar-link">Alle boeken</a>
    `;
    document.body.prepend(bar);

    // Push page content down to make room for the bar
    document.body.style.paddingTop = bar.offsetHeight + 'px';
  })
  .catch(() => {}); // silently ignore if API unreachable
