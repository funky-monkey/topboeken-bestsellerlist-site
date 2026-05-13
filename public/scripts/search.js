const input   = document.getElementById('search-input');
const results = document.getElementById('search-results');
const books   = JSON.parse(document.getElementById('book-data').textContent);

const SMALL = new Set(['a','an','the','and','but','or','for','nor','on','at','to','by','in','of','up','as','via','with','from','into','than','yet','so']);
function titleCase(str) {
  if (!str) return str;
  return str.toLowerCase().split(' ').map((w, i) =>
    !w ? w : (i > 0 && SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1))
  ).join(' ');
}

function render(query) {
  if (query.length < 2) { results.innerHTML = ''; return; }

  const q = query.toLowerCase();
  const filtered = books
    .filter(b => b.title?.toLowerCase().includes(q) || b.author?.toLowerCase().includes(q))
    .slice(0, 48);

  results.innerHTML = filtered.map(b => `
    <a href="/boeken/${b.slug}" class="book-card">
      ${b.cover_path
        ? `<img src="/${b.cover_path}" alt="${titleCase(b.title)}" loading="lazy">`
        : '<div class="book-card-placeholder"></div>'
      }
    </a>
  `).join('');
}

const q = new URLSearchParams(window.location.search).get('q') ?? '';
if (q) { input.value = q; render(q); }

input.addEventListener('input', e => render(e.target.value));
