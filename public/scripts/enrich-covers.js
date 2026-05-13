function startEnrich() {
  const btn = document.getElementById('start-btn');
  const out = document.getElementById('output');

  btn.disabled = true;
  btn.textContent = '⏳ Bezig...';
  out.textContent = '';

  const es = new EventSource('/admin/enrich-covers/stream');

  es.onmessage = (e) => {
    out.textContent += e.data + '\n';
    out.scrollTop = out.scrollHeight;

    if (e.data.startsWith('[klaar]')) {
      es.close();
      btn.textContent = '✓ Klaar';
    }
  };

  es.onerror = () => {
    out.textContent += '\n[verbinding verbroken]\n';
    es.close();
    btn.disabled = false;
    btn.textContent = '▶ Opnieuw starten';
  };
}
