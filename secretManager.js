const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SECRET_FILE = path.join(__dirname, 'data', 'secrets.enc');

// Derive a 256-bit key tied to the local machine environment (never stored in plaintext)
function getMachineCipherKey() {
  const machineSeed = `${os.hostname()}::${os.userInfo().username}::${os.platform()}::${os.arch()}::naiwa-aes256-vault`;
  return crypto.scryptSync(machineSeed, 'naiwa-vault-salt-2026', 32);
}

function encryptSecrets(secretsObj) {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const key = getMachineCipherKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const plaintext = JSON.stringify(secretsObj);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const payload = {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag: authTag.toString('hex'),
    data: encrypted.toString('hex')
  };

  fs.writeFileSync(SECRET_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

function loadSecrets() {
  const result = {
    AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT || '',
    AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY || '',
    AZURE_OPENAI_DEPLOYMENT: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || ''
  };

  if (fs.existsSync(SECRET_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8'));
      const key = getMachineCipherKey();
      const iv = Buffer.from(raw.iv, 'hex');
      const authTag = Buffer.from(raw.tag, 'hex');
      const encrypted = Buffer.from(raw.data, 'hex');

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
      const parsed = JSON.parse(decrypted);

      for (const k of Object.keys(result)) {
        if (!result[k] && parsed[k]) {
          result[k] = parsed[k];
        }
      }
    } catch (e) {
      console.warn('⚠️ Encrypted secret vault could not be decrypted on this machine, using env vars only.');
    }
  }

  return result;
}

module.exports = {
  encryptSecrets,
  loadSecrets,
  SECRET_FILE
};
