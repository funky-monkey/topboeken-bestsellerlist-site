export function layout(title, body) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — TopBoeken Admin</title>
  <link rel="stylesheet" href="/admin-style.css">
</head>
<body>
  <nav class="admin-nav">
    <span class="brand">📚 TopBoeken Admin</span>
    <a href="/admin">Dashboard</a>
    <a href="/admin/books">Boeken</a>
    <a href="/admin/sources">Bronnen</a>
    <a href="/admin/affiliates">Affiliates</a>
    <a href="/admin/logs">Logs</a>
    <a href="/admin/scrape">Scrapen</a>
    <span class="nav-end"><a href="/admin/logout">Uitloggen</a></span>
  </nav>
  <div class="admin-wrap">${body}</div>
</body>
</html>`;
}
