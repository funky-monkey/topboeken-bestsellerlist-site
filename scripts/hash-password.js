// Usage: node scripts/hash-password.js <password>
import bcrypt from 'bcrypt';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.js <password>');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log('ADMIN_PASSWORD_HASH=' + hash);
