const input   = document.getElementById('search-input');
const results = document.getElementById('search-results');
const books   = JSON.parse(document.getElementById('book-data').textContent);

function render(query) {
  if (query.length < 2) { results.innerHTML = ''; return; }

  const q = query.toLowerCase();
  const filtered = books
    .filter(b => b.title?.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q))
    .slice(0, 48);

  results.innerHTML = filtered.map(b => `
    <a href="/boeken/${b.slug}" class="book-card">
      ${b.cover_path
        ? `<img src="/${b.cover_path}" alt="${b.title}" loading="lazy">`
        : '<div class="book-card-placeholder"></div>'
      }
    </a>
  `).join('');
}

const q = new URLSearchParams(window.location.search).get('q') ?? '';
if (q) { input.value = q; render(q); }

input.addEventListener('input', e => render(e.target.value));
