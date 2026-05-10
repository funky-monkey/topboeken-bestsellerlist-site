export function loginView(error = null) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <title>Inloggen — TopBoeken Admin</title>
  <link rel="stylesheet" href="/admin-style.css">
  <style>
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .login-box { background: #fff; padding: 40px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); width: 320px; }
    .login-box h1 { font-size: 20px; margin-bottom: 24px; }
    .login-box button { width: 100%; padding: 12px; background: #232323; color: #fff; border: none; border-radius: 4px; font-size: 14px; font-weight: 700; cursor: pointer; }
    .error { color: #dc2626; font-size: 13px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>📚 TopBoeken Admin</h1>
    ${error ? `<p class="error">${error}</p>` : ''}
    <form method="post" action="/admin/login">
      <label>Wachtwoord</label>
      <input type="password" name="password" autofocus required />
      <button type="submit">Inloggen</button>
    </form>
  </div>
</body>
</html>`;
}
