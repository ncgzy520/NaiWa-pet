const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'naiwa.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');

const DAILY_EXP_CAP = 500;
const DAILY_COIN_CAP = 300;
// Sleep recovery rate: +10 energy per minute (1 point every 6 seconds -> full 0 to 100 in 10 minutes)
const SLEEP_ENERGY_PER_MINUTE = 10;

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pets (
    user_id INTEGER PRIMARY KEY,
    pet_name TEXT DEFAULT '小奶蛙',
    level INTEGER DEFAULT 1,
    exp INTEGER DEFAULT 0,
    daily_exp INTEGER DEFAULT 0,
    daily_exp_date TEXT DEFAULT '',
    coins INTEGER DEFAULT 200,
    daily_coins INTEGER DEFAULT 0,
    daily_coins_date TEXT DEFAULT '',
    hunger INTEGER DEFAULT 80,
    mood INTEGER DEFAULT 85,
    cleanliness INTEGER DEFAULT 90,
    energy INTEGER DEFAULT 90,
    weight REAL DEFAULT 20.0,
    is_sleeping INTEGER DEFAULT 0,
    inventory_json TEXT DEFAULT '{"skewers":5,"drumstick":3,"milktea":3,"salad":2}',
    work_status_json TEXT DEFAULT '{"isWorking":false,"endTime":0,"reward":0}',
    likes_count INTEGER DEFAULT 0,
    last_updated INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS guestbook (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_user_id INTEGER NOT NULL,
    author_user_id INTEGER NOT NULL,
    author_nickname TEXT NOT NULL,
    content TEXT NOT NULL,
    action_type TEXT DEFAULT 'message',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe migration if database was created before daily_exp / daily_coins columns were added
const columns = db.prepare("PRAGMA table_info(pets)").all().map(c => c.name);
if (!columns.includes('daily_exp')) {
  db.exec("ALTER TABLE pets ADD COLUMN daily_exp INTEGER DEFAULT 0");
}
if (!columns.includes('daily_exp_date')) {
  db.exec("ALTER TABLE pets ADD COLUMN daily_exp_date TEXT DEFAULT ''");
}
if (!columns.includes('daily_coins')) {
  db.exec("ALTER TABLE pets ADD COLUMN daily_coins INTEGER DEFAULT 0");
}
if (!columns.includes('daily_coins_date')) {
  db.exec("ALTER TABLE pets ADD COLUMN daily_coins_date TEXT DEFAULT ''");
}

// Attach daily caps & sleep timing metadata for frontend display
function attachPetMeta(pet) {
  if (!pet) return null;
  const today = getTodayStr();
  const dailyExp = pet.daily_exp_date === today ? (pet.daily_exp || 0) : 0;
  const dailyCoins = pet.daily_coins_date === today ? (pet.daily_coins || 0) : 0;
  const requiredExp = pet.level * 100;

  // Calculate remaining sleep seconds needed to reach 100 energy
  const missingEnergy = Math.max(0, 100 - pet.energy);
  // 10 energy per minute = 1 energy per 6 seconds
  const sleepRemainingSeconds = Math.ceil(missingEnergy * 6);
  const wakeUpTimestamp = pet.is_sleeping === 1 && missingEnergy > 0
    ? Date.now() + sleepRemainingSeconds * 1000
    : null;

  return {
    ...pet,
    daily_exp: dailyExp,
    daily_exp_date: today,
    daily_exp_cap: DAILY_EXP_CAP,
    daily_coins: dailyCoins,
    daily_coins_date: today,
    daily_coins_cap: DAILY_COIN_CAP,
    required_exp: requiredExp,
    sleep_remaining_seconds: sleepRemainingSeconds,
    sleep_full_at: wakeUpTimestamp,
    sleep_rate_per_min: SLEEP_ENERGY_PER_MINUTE
  };
}

// Calculate decay / recovery over elapsed time
function applyDecay(pet) {
  const now = Date.now();
  const today = getTodayStr();

  if (pet.daily_exp_date !== today) {
    db.prepare('UPDATE pets SET daily_exp = 0, daily_exp_date = ? WHERE user_id = ?').run(today, pet.user_id);
    pet.daily_exp = 0;
    pet.daily_exp_date = today;
  }

  if (pet.daily_coins_date !== today) {
    db.prepare('UPDATE pets SET daily_coins = 0, daily_coins_date = ? WHERE user_id = ?').run(today, pet.user_id);
    pet.daily_coins = 0;
    pet.daily_coins_date = today;
  }

  const elapsedSeconds = Math.max(0, (now - (pet.last_updated || now)) / 1000);
  if (elapsedSeconds < 6) return attachPetMeta(pet);

  let hunger = pet.hunger;
  let mood = pet.mood;
  let cleanliness = pet.cleanliness;
  let energy = pet.energy;

  if (pet.is_sleeping === 1) {
    // Sleeping mode: +1 energy every 6 seconds (+10 per minute)
    const gainedEnergy = Math.floor(elapsedSeconds / 6);
    if (gainedEnergy > 0) {
      energy = Math.min(100, energy + gainedEnergy);
      const elapsedMinutes = elapsedSeconds / 60;
      hunger = Math.max(10, hunger - Math.floor(elapsedMinutes / 15));
    } else {
      return attachPetMeta(pet);
    }
  } else {
    const elapsedMinutes = elapsedSeconds / 60;
    if (elapsedMinutes < 1) return attachPetMeta(pet);
    // Awake mode: natural decay
    hunger = Math.max(0, hunger - Math.floor(elapsedMinutes / 10) * 2);
    mood = Math.max(0, mood - Math.floor(elapsedMinutes / 12) * 2);
    cleanliness = Math.max(0, cleanliness - Math.floor(elapsedMinutes / 20));
    energy = Math.max(0, energy - Math.floor(elapsedMinutes / 15));
  }

  const updatedPet = {
    ...pet,
    hunger,
    mood,
    cleanliness,
    energy,
    last_updated: now
  };

  db.prepare(`
    UPDATE pets 
    SET hunger = ?, mood = ?, cleanliness = ?, energy = ?, last_updated = ?
    WHERE user_id = ?
  `).run(hunger, mood, cleanliness, energy, now, pet.user_id);

  return attachPetMeta(updatedPet);
}

// Clean up any legacy preset NPC accounts if they exist in local database
db.exec(`
  DELETE FROM guestbook WHERE author_user_id IN (SELECT id FROM users WHERE username IN ('xiaoqi', 'baobaolong', 'bbq_master'))
     OR target_user_id IN (SELECT id FROM users WHERE username IN ('xiaoqi', 'baobaolong', 'bbq_master'));
  DELETE FROM pets WHERE user_id IN (SELECT id FROM users WHERE username IN ('xiaoqi', 'baobaolong', 'bbq_master'));
  DELETE FROM users WHERE username IN ('xiaoqi', 'baobaolong', 'bbq_master');
`);

module.exports = {
  db,
  DAILY_EXP_CAP,
  DAILY_COIN_CAP,
  SLEEP_ENERGY_PER_MINUTE,
  getTodayStr,
  applyDecay,
  attachPetMeta,

  // Users
  getUserByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  },
  getUserById(id) {
    return db.prepare('SELECT id, username, nickname, created_at FROM users WHERE id = ?').get(id);
  },
  createUser(username, password, nickname, petName = '小奶蛙') {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    const now = Date.now();
    const today = getTodayStr();

    const insertUser = db.prepare('INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)');
    const res = insertUser.run(username, hash, nickname || username);
    const userId = res.lastInsertRowid;

    const insertPet = db.prepare(`
      INSERT INTO pets (
        user_id, pet_name, level, exp, daily_exp, daily_exp_date, coins, daily_coins, daily_coins_date,
        hunger, mood, cleanliness, energy, weight, inventory_json, last_updated
      ) VALUES (?, ?, 1, 0, 0, ?, 300, 0, ?, 80, 85, 90, 85, 20.0, '{"skewers":5,"drumstick":3,"milktea":3,"salad":2}', ?)
    `);
    insertPet.run(userId, petName, today, today, now);

    return { id: userId, username, nickname };
  },

  // Pets
  getPetByUserId(userId) {
    const pet = db.prepare('SELECT * FROM pets WHERE user_id = ?').get(userId);
    if (!pet) return null;
    return applyDecay(pet);
  },
  updatePet(userId, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return this.getPetByUserId(userId);

    const setClauses = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(userId);

    db.prepare(`UPDATE pets SET ${setClauses} WHERE user_id = ?`).run(...values);
    return this.getPetByUserId(userId);
  },

  // Leaderboard
  getLeaderboards() {
    const weightList = db.prepare(`
      SELECT p.user_id, p.pet_name, p.weight, p.level, p.likes_count, u.nickname
      FROM pets p JOIN users u ON p.user_id = u.id
      ORDER BY p.weight DESC LIMIT 10
    `).all();

    const levelList = db.prepare(`
      SELECT p.user_id, p.pet_name, p.level, p.exp, p.weight, p.likes_count, u.nickname
      FROM pets p JOIN users u ON p.user_id = u.id
      ORDER BY p.level DESC, p.exp DESC LIMIT 10
    `).all();

    const likesList = db.prepare(`
      SELECT p.user_id, p.pet_name, p.likes_count, p.level, p.weight, u.nickname
      FROM pets p JOIN users u ON p.user_id = u.id
      ORDER BY p.likes_count DESC LIMIT 10
    `).all();

    return { weightList, levelList, likesList };
  },

  // Social & Guestbook
  getGuestbook(targetUserId) {
    return db.prepare(`
      SELECT g.*, u.nickname as author_name
      FROM guestbook g JOIN users u ON g.author_user_id = u.id
      WHERE g.target_user_id = ?
      ORDER BY g.id DESC LIMIT 30
    `).all(targetUserId);
  },
  addGuestbook(targetUserId, authorUserId, authorNickname, content, actionType = 'message') {
    return db.prepare(`
      INSERT INTO guestbook (target_user_id, author_user_id, author_nickname, content, action_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(targetUserId, authorUserId, authorNickname, content, actionType);
  },

  // Chat logs
  saveChatLog(userId, role, content) {
    return db.prepare('INSERT INTO chat_logs (user_id, role, content) VALUES (?, ?, ?)').run(userId, role, content);
  },
  getRecentChatLogs(userId, limit = 10) {
    return db.prepare(`
      SELECT role, content FROM chat_logs
      WHERE user_id = ?
      ORDER BY id DESC LIMIT ?
    `).all(userId, limit).reverse();
  }
};
