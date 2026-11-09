require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { loadSecrets } = require('./secretManager');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'naiwa-secret-pet-key-2026';

app.use(cors());
app.use(express.json());

// Static file hosting
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets/nwp', express.static(path.join(__dirname, 'naiwa-assets')));

// Shop catalog configuration (Pure Food & Snacks — Cosmetics/Themes Removed)
const SHOP_CATALOG = {
  skewers: {
    id: 'skewers',
    name: '秘制烤羊肉串',
    type: 'food',
    icon: '🍢',
    price: 25,
    hunger: 22,
    mood: 15,
    weight: 0.8,
    exp: 15,
    desc: '滋滋冒油的烤羊肉串，奶蛙的最爱！肚皮瞬间圆润。'
  },
  drumstick: {
    id: 'drumstick',
    name: '黄金脆皮大鸡腿',
    type: 'food',
    icon: '🍗',
    price: 35,
    hunger: 30,
    mood: 20,
    weight: 1.2,
    exp: 20,
    desc: '外酥里嫩的金黄大鸡腿，一口咬下满嘴肉香！'
  },
  milktea: {
    id: 'milktea',
    name: '珍珠大桶奶茶',
    type: 'food',
    icon: '🧋',
    price: 20,
    hunger: 12,
    mood: 25,
    weight: 0.6,
    exp: 12,
    desc: '超大杯全糖珍珠奶茶，喝完开心到仰头捧腹大笑！'
  },
  salad: {
    id: 'salad',
    name: '轻食减脂蔬菜碗',
    type: 'food',
    icon: '🥗',
    price: 30,
    hunger: 15,
    mood: -2,
    weight: -1.5,
    exp: 18,
    desc: '健康低卡的绿色沙拉，帮圆滚滚的奶蛙控制体重！'
  },
  chili: {
    id: 'chili',
    name: '变态辣魔鬼椒',
    type: 'food',
    icon: '🌶️',
    price: 15,
    hunger: 5,
    mood: 10,
    weight: -0.3,
    exp: 25,
    desc: '超级劲爆的魔鬼椒！吃完会触发奶蛙喷火绝技！'
  },
  watermelon: {
    id: 'watermelon',
    name: '冰镇大西瓜',
    type: 'food',
    icon: '🍉',
    price: 18,
    hunger: 16,
    mood: 18,
    weight: 0.3,
    exp: 14,
    desc: '清甜多汁的冰镇西瓜，一口下去清凉解暑！'
  }
};

// Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: '身份凭证无效' });
    req.user = user;
    next();
  });
}

// Helper: Apply Coins with Daily Cap (300/day)
function addCoinsWithDailyCap(pet, rawCoinGain) {
  const today = db.getTodayStr();
  let dailyCoins = pet.daily_coins_date === today ? (pet.daily_coins || 0) : 0;
  const remainingQuota = Math.max(0, db.DAILY_COIN_CAP - dailyCoins);
  const actualCoinGain = Math.min(rawCoinGain, remainingQuota);

  dailyCoins += actualCoinGain;
  const coins = pet.coins + actualCoinGain;

  return {
    coins,
    daily_coins: dailyCoins,
    daily_coins_date: today,
    actualCoinGain,
    cappedByDailyCoinLimit: rawCoinGain > 0 && actualCoinGain === 0
  };
}

// Helper: Apply EXP with Daily Cap (500/day) and Level Up check
function addExpAndCheckLevelUp(pet, rawExpGain) {
  const today = db.getTodayStr();
  let dailyExp = pet.daily_exp_date === today ? (pet.daily_exp || 0) : 0;
  const remainingQuota = Math.max(0, db.DAILY_EXP_CAP - dailyExp);
  const actualExpGain = Math.min(rawExpGain, remainingQuota);

  dailyExp += actualExpGain;
  let exp = pet.exp + actualExpGain;
  let level = pet.level;
  let coins = pet.coins;
  let leveledUp = false;
  let requiredExp = level * 100;

  while (exp >= requiredExp) {
    exp -= requiredExp;
    level += 1;
    coins += 50; // Level up milestone reward
    leveledUp = true;
    requiredExp = level * 100;
  }

  return {
    level,
    exp,
    coins,
    daily_exp: dailyExp,
    daily_exp_date: today,
    actualExpGain,
    cappedByDailyLimit: rawExpGain > 0 && actualExpGain === 0,
    leveledUp
  };
}

// ----------------- Auth Routes -----------------
app.post('/api/auth/register', (req, res) => {
  const { username, password, nickname, petName } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const existing = db.getUserByUsername(username);
  if (existing) {
    return res.status(400).json({ error: '该用户名已被使用，请换一个' });
  }

  try {
    const user = db.createUser(username, password, nickname || username, petName || '小奶蛙');
    const token = jwt.sign({ id: user.id, username: user.username, nickname: user.nickname }, JWT_SECRET, { expiresIn: '30d' });
    const pet = db.getPetByUserId(user.id);
    res.json({ token, user, pet });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '注册失败，请重试' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const user = db.getUserByUsername(username);
  if (!user) {
    return res.status(400).json({ error: '用户名或密码错误' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(400).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, nickname: user.nickname }, JWT_SECRET, { expiresIn: '30d' });
  const pet = db.getPetByUserId(user.id);
  res.json({
    token,
    user: { id: user.id, username: user.username, nickname: user.nickname },
    pet
  });
});

app.post('/api/auth/guest', (req, res) => {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const username = `guest_${randomSuffix}`;
  const password = `guest_${randomSuffix}`;
  const nickname = `新手主人${randomSuffix}`;

  try {
    const user = db.createUser(username, password, nickname, '快乐小奶蛙');
    const token = jwt.sign({ id: user.id, username: user.username, nickname: user.nickname }, JWT_SECRET, { expiresIn: '7d' });
    const pet = db.getPetByUserId(user.id);
    res.json({ token, user, pet });
  } catch (err) {
    console.error('Guest creation error:', err);
    res.status(500).json({ error: '快速体验创建失败' });
  }
});

// ----------------- Pet Routes -----------------
app.get('/api/pet', authenticateToken, (req, res) => {
  const pet = db.getPetByUserId(req.user.id);
  const user = db.getUserById(req.user.id);
  if (!pet) return res.status(404).json({ error: '未找到宠物' });
  res.json({ user, pet, shopCatalog: SHOP_CATALOG });
});

app.post('/api/pet/action', authenticateToken, (req, res) => {
  const { action, itemId, count, poseIndex } = req.body;
  let pet = db.getPetByUserId(req.user.id);
  if (!pet) return res.status(404).json({ error: '未找到宠物' });

  let inventory = JSON.parse(pet.inventory_json || '{}');
  let animation = 'idle';
  let speech = '';
  let updates = {};
  let extraMeta = {};

  switch (action) {
    case 'poke': {
      if (pet.is_sleeping === 1) {
        return res.status(400).json({ error: '奶蛙正在安静睡觉恢复精力呢，请先开灯唤醒它吧！' });
      }
      const rawBonusCoins = Math.floor(2 + Math.random() * 5);
      pet.mood = Math.min(100, pet.mood + 8);
      pet.energy = Math.max(0, pet.energy - 2);

      const coinResult = addCoinsWithDailyCap(pet, rawBonusCoins);
      Object.assign(pet, coinResult);

      const expResult = addExpAndCheckLevelUp(pet, 10);
      Object.assign(pet, expResult);

      animation = 'laugh';
      // Pure Naiwa speech only (no form prefix, no exp status suffix)
      const poseQuotes = [
        '呱哈哈！戳我大白肚好痒呀~ 我的大肚肚真的很酷酷！',
        '哎呀笑得本蛙直不起腰啦！肚皮duang duang弹！',
        '哈哈哈！看本蛙的超级大白肚皮摇摆舞！',
        '救命呀主人！再戳下去本蛙要笑出鹅叫啦！',
        '啪啪啪！这肚皮手感是不是全宇宙第一棒！',
        '不行了笑到摔倒打滚啦！四脚朝天呱哈哈！'
      ];
      const idx = typeof poseIndex === 'number' ? (poseIndex % poseQuotes.length) : Math.floor(Math.random() * poseQuotes.length);
      speech = poseQuotes[idx];

      updates = {
        mood: pet.mood,
        energy: pet.energy,
        exp: pet.exp,
        level: pet.level,
        coins: pet.coins,
        daily_exp: pet.daily_exp,
        daily_exp_date: pet.daily_exp_date,
        daily_coins: pet.daily_coins,
        daily_coins_date: pet.daily_coins_date
      };
      extraMeta = {
        bonusCoins: coinResult.actualCoinGain,
        actualCoinGain: coinResult.actualCoinGain,
        actualExpGain: expResult.actualExpGain,
        leveledUp: expResult.leveledUp
      };
      break;
    }

    case 'feed': {
      if (pet.is_sleeping === 1) {
        return res.status(400).json({ error: '奶蛙正在睡觉呢，先开灯唤醒再喂食吧！' });
      }
      if (!itemId || !SHOP_CATALOG[itemId]) {
        return res.status(400).json({ error: '食物不存在' });
      }
      const feedCount = Math.max(1, Math.min(99, parseInt(count || 1, 10)));
      const owned = inventory[itemId] || 0;
      if (owned < feedCount) {
        return res.status(400).json({ error: `背包中【${SHOP_CATALOG[itemId].name}】数量不足（当前拥有 ${owned} 个）` });
      }

      const food = SHOP_CATALOG[itemId];
      inventory[itemId] -= feedCount;
      if (inventory[itemId] <= 0) delete inventory[itemId];

      const totalHunger = food.hunger * feedCount;
      const totalMood = food.mood * feedCount;
      const totalWeight = Number((food.weight * feedCount).toFixed(1));
      const totalRawExp = food.exp * feedCount;

      pet.hunger = Math.min(100, Math.max(0, pet.hunger + totalHunger));
      pet.mood = Math.min(100, Math.max(0, pet.mood + totalMood));
      pet.weight = Math.max(10.0, Number((pet.weight + totalWeight).toFixed(1)));

      const expResult = addExpAndCheckLevelUp(pet, totalRawExp);
      Object.assign(pet, expResult);

      if (itemId === 'chili') {
        animation = 'fire';
        speech = `哇啊啊！魔鬼椒好辣好过瘾！看本蛙无敌喷火大绝招🔥🔥🔥！`;
      } else if (food.weight < 0) {
        animation = 'waving';
        speech = `咔嚓咔嚓！绿色蔬菜碗虽然清淡，但感觉大肚皮轻盈多啦！`;
      } else {
        animation = 'jumping';
        speech = feedCount > 1
          ? `豪华大餐！一口气炫光了这么多${food.name}，大白肚皮圆滚滚超幸福！`
          : `太香啦！吧唧吧唧吃掉了${food.name}，大白肚肚超满足！`;
      }

      updates = {
        hunger: pet.hunger,
        mood: pet.mood,
        weight: pet.weight,
        exp: pet.exp,
        level: pet.level,
        coins: pet.coins,
        daily_exp: pet.daily_exp,
        daily_exp_date: pet.daily_exp_date,
        inventory_json: JSON.stringify(inventory)
      };
      extraMeta = {
        fedCount: feedCount,
        foodIcon: food.icon,
        foodName: food.name,
        totalHunger,
        totalWeight,
        actualExpGain: expResult.actualExpGain,
        leveledUp: expResult.leveledUp
      };
      break;
    }

    case 'exercise': {
      if (pet.is_sleeping === 1) {
        return res.status(400).json({ error: '奶蛙正在睡觉呢，不能边睡边跳操哦！' });
      }
      if (pet.energy < 15) {
        return res.status(400).json({ error: '精力不足 (<15)，奶蛙累瘫了，快点“关灯睡觉”恢复精力吧！' });
      }

      pet.energy = Math.max(0, pet.energy - 15);
      pet.hunger = Math.max(0, pet.hunger - 10);
      pet.weight = Math.max(12.0, Number((pet.weight - 1.2).toFixed(1)));
      pet.mood = Math.min(100, pet.mood + 5);

      const expResult = addExpAndCheckLevelUp(pet, 25);
      Object.assign(pet, expResult);

      animation = 'running-right';
      speech = '一二一！迈开蛙腿疯狂燃脂跑！肚皮上的肉肉在燃烧啦！';

      updates = {
        energy: pet.energy,
        hunger: pet.hunger,
        weight: pet.weight,
        mood: pet.mood,
        exp: pet.exp,
        level: pet.level,
        coins: pet.coins,
        daily_exp: pet.daily_exp,
        daily_exp_date: pet.daily_exp_date
      };
      extraMeta = { actualExpGain: expResult.actualExpGain, leveledUp: expResult.leveledUp };
      break;
    }

    case 'clean': {
      if (pet.is_sleeping === 1) {
        return res.status(400).json({ error: '奶蛙正在睡觉呢，先唤醒再进浴缸泡澡吧！' });
      }
      pet.cleanliness = 100;
      pet.mood = Math.min(100, pet.mood + 12);

      const expResult = addExpAndCheckLevelUp(pet, 15);
      Object.assign(pet, expResult);

      animation = 'bath';
      speech = '哗啦啦~ 坐进温水大浴缸，小黄鸭陪本蛙一起搓泡泡澡，大白肚皮洗得香喷喷！';

      updates = {
        cleanliness: pet.cleanliness,
        mood: pet.mood,
        exp: pet.exp,
        level: pet.level,
        coins: pet.coins,
        daily_exp: pet.daily_exp,
        daily_exp_date: pet.daily_exp_date
      };
      extraMeta = { actualExpGain: expResult.actualExpGain, leveledUp: expResult.leveledUp };
      break;
    }

    case 'toggle_sleep': {
      pet.is_sleeping = pet.is_sleeping === 1 ? 0 : 1;
      const now = Date.now();
      if (pet.is_sleeping === 1) {
        animation = 'sleep';
        speech = '呼……关灯睡觉啦，本蛙要乖乖闭眼安睡喽 Zzz……';
      } else {
        animation = 'waving';
        speech = '早安主人！睡饱起床啦，又是元气满满想吃烤串的一天！';
      }
      updates = { is_sleeping: pet.is_sleeping, last_updated: now };
      break;
    }

    case 'rename': {
      const { newName } = req.body;
      if (!newName || newName.trim().length === 0) {
        return res.status(400).json({ error: '名字不能为空' });
      }
      pet.pet_name = newName.trim().slice(0, 16);
      speech = `呱哈哈！从今天起，本蛙的响亮大名就是【${pet.pet_name}】啦！`;
      updates = { pet_name: pet.pet_name };
      break;
    }

    default:
      return res.status(400).json({ error: '未知操作类型' });
  }

  const updatedPet = db.updatePet(req.user.id, updates);
  res.json({ pet: updatedPet, animation, speech, ...extraMeta });
});

// ----------------- Shop Routes -----------------
app.post('/api/shop/buy', authenticateToken, (req, res) => {
  const { itemId, count } = req.body;
  if (!itemId || !SHOP_CATALOG[itemId]) {
    return res.status(400).json({ error: '商品不存在' });
  }

  const item = SHOP_CATALOG[itemId];
  const buyCount = Math.max(1, Math.min(99, parseInt(count || 1, 10)));
  const totalCost = item.price * buyCount;

  const pet = db.getPetByUserId(req.user.id);
  if (!pet) return res.status(404).json({ error: '未找到宠物' });

  if (pet.coins < totalCost) {
    return res.status(400).json({ error: `奶蛙币不足！需要 ${totalCost} 币，当前拥有 ${pet.coins} 币` });
  }

  const inventory = JSON.parse(pet.inventory_json || '{}');
  inventory[itemId] = (inventory[itemId] || 0) + buyCount;

  const newCoins = pet.coins - totalCost;
  const updatedPet = db.updatePet(req.user.id, {
    coins: newCoins,
    inventory_json: JSON.stringify(inventory)
  });

  res.json({
    success: true,
    message: buyCount > 1 ? `成功购买 ${buyCount} 份【${item.name}】！` : `成功购买【${item.name}】！`,
    pet: updatedPet
  });
});

// ----------------- Minigames Reward Route -----------------
app.post('/api/minigame/reward', authenticateToken, (req, res) => {
  const { gameType, score } = req.body;
  const pet = db.getPetByUserId(req.user.id);
  if (!pet) return res.status(404).json({ error: '未找到宠物' });

  let rawCoins = 0;
  let rawExp = 0;

  if (gameType === 'catch_food') {
    rawCoins = Math.min(120, Math.max(10, Math.floor(score * 0.6)));
    rawExp = Math.min(80, Math.max(10, Math.floor(score * 0.4)));
  } else if (gameType === 'poke_belly') {
    rawCoins = Math.min(100, Math.max(10, Math.floor(score * 0.8)));
    rawExp = Math.min(60, Math.max(10, Math.floor(score * 0.5)));
  }

  const coinResult = addCoinsWithDailyCap(pet, rawCoins);
  Object.assign(pet, coinResult);

  pet.energy = Math.max(0, pet.energy - 5);

  const expResult = addExpAndCheckLevelUp(pet, rawExp);
  Object.assign(pet, expResult);

  const updatedPet = db.updatePet(req.user.id, {
    coins: pet.coins,
    exp: pet.exp,
    level: pet.level,
    energy: pet.energy,
    daily_exp: pet.daily_exp,
    daily_exp_date: pet.daily_exp_date,
    daily_coins: pet.daily_coins,
    daily_coins_date: pet.daily_coins_date
  });

  let rewardMsg = `游戏结束！`;
  if (coinResult.actualCoinGain > 0 && expResult.actualExpGain > 0) {
    rewardMsg = `游戏大丰收！获得 +${coinResult.actualCoinGain} 奶蛙币 与 +${expResult.actualExpGain} 经验值！`;
  } else if (coinResult.actualCoinGain > 0) {
    rewardMsg = `游戏大丰收！获得 +${coinResult.actualCoinGain} 奶蛙币！`;
  } else if (expResult.actualExpGain > 0) {
    rewardMsg = `游戏大丰收！获得 +${expResult.actualExpGain} 经验值！`;
  } else {
    rewardMsg = `游戏完成！今日获取金币与经验均已达到上限~`;
  }

  res.json({
    earnedCoins: coinResult.actualCoinGain,
    earnedExp: expResult.actualExpGain,
    pet: updatedPet,
    message: rewardMsg
  });
});

// ----------------- Server-Side Only AI Chat Gateway -----------------
// Keys are loaded from OS/Azure env or AES-256-GCM encrypted vault (data/secrets.enc)
const FALLBACK_RESPONSES = [
  { match: /饿|吃|烤串|鸡腿|奶茶|饭|肚/, replies: [
    '呱哈哈！说到吃本蛙就不困了！我的大白肚时刻准备着迎接羊肉串和脆皮鸡腿~',
    '吸溜……烤串！冰镇奶茶！快去商城给本蛙来个批量投喂十连炫吧！'
  ]},
  { match: /胖|减|重|身材|圆/, replies: [
    '哼！本蛙这叫富态！我的大肚肚真的很酷酷！不信你多戳几下，有6种爆笑姿势呢~',
    '明天开始减肥，今天先吃饱！做一只开开心心、圆滚滚的无忧无虑奶蛙不好吗？'
  ]},
  { match: /累|难过|伤心|不开心|烦|压力/, replies: [
    '主人摸摸头~ 难过的时候就用力戳戳本蛙的大肚皮，看本蛙笑到躺地打滚，烦恼全飞走！',
    '别叹气啦主人！生活没有一顿烤串解决不了的，如果有，那就再加两个鸡腿！本蛙永远陪着你！'
  ]},
  { match: /澡|洗|干净|泡澡/, replies: [
    '本蛙最喜欢坐进白色大浴缸里和小黄鸭一起泡温水澡啦！满屋子都是彩色肥皂泡~'
  ]},
  { match: /睡|困|晚安/, replies: [
    '哈欠~ 关灯睡觉时本蛙会乖乖一动不动闭眼安睡，等睡饱了再陪主人玩哦！'
  ]},
  { match: /谁|介绍|名字/, replies: [
    '我是你的本命萌宠小奶蛙！明黄连体、奶油白大肚皮、棕褐色手脚，最爱仰头拍肚皮狂笑！'
  ]}
];

app.post('/api/chat', authenticateToken, async (req, res) => {
  const { message } = req.body;
  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: '聊天内容不能为空' });
  }

  const userId = req.user.id;
  const pet = db.getPetByUserId(userId);
  db.saveChatLog(userId, 'user', message);

  const systemPrompt = `你是主人的电子宠物“${pet.pet_name}（奶蛙 Naiwa）”——一只圆滚滚、明黄色皮肤、有着超大奶油白肚皮和棕褐色手脚的可爱小蛙/幼龙。
你当前的真实状态是：饱腹度 ${pet.hunger}/100，心情 ${pet.mood}/100，体重 ${pet.weight}kg，等级 Lv.${pet.level}。
性格特征：极度乐观、资深吃货（最爱烤羊肉串、脆皮鸡腿、奶茶）、嘴上喊减肥但管不住嘴、最喜欢双手捧着大白肚皮仰天捧腹狂笑。
回复规范：简短生动俏皮（控制在60字以内），直接说话，不要带任何状态前缀或经验提示，多用“呱哈哈~”、“duang duang~”等语气词，充满治愈感。`;

  let replyText = '';
  const secrets = loadSecrets();

  // 1. Server-side Azure OpenAI / Azure AI Foundry (DeepSeek / GPT via Azure credits)
  const azureEndpoint = secrets.AZURE_AI_ENDPOINT || secrets.AZURE_OPENAI_ENDPOINT;
  const azureKey = secrets.AZURE_AI_KEY || secrets.AZURE_OPENAI_API_KEY;
  const azureDeployment = secrets.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';

  if (azureEndpoint && azureKey) {
    try {
      let url = azureEndpoint.trim().replace(/\/$/, '');
      const isFoundryMaaS = url.includes('.models.ai.azure.com') || url.includes('.inference.ai.azure.com') || url.includes('/chat/completions');

      if (!isFoundryMaaS) {
        url = `${url}/openai/deployments/${azureDeployment}/chat/completions?api-version=2024-02-15-preview`;
      } else if (!url.endsWith('/chat/completions')) {
        url = url.endsWith('/v1') ? `${url}/chat/completions` : `${url}/v1/chat/completions`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': azureKey,
          'Authorization': `Bearer ${azureKey}`
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          max_tokens: 150,
          temperature: 0.8
        })
      });
      const data = await response.json();
      if (data.choices && data.choices[0]?.message?.content) {
        replyText = data.choices[0].message.content.trim();
      }
    } catch (e) {
      console.warn('Azure AI / OpenAI call failed, falling back:', e.message);
    }
  }

  // 2. Server-side DeepSeek API
  const deepseekKey = secrets.DEEPSEEK_API_KEY;
  if (!replyText && deepseekKey) {
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          max_tokens: 150,
          temperature: 0.8
        })
      });
      const data = await response.json();
      if (data.choices && data.choices[0]?.message?.content) {
        replyText = data.choices[0].message.content.trim();
      }
    } catch (e) {
      console.warn('DeepSeek call failed, falling back.');
    }
  }

  // 3. Server-side Google Gemini API
  const geminiKey = secrets.GEMINI_API_KEY;
  if (!replyText && geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n主人对你说：${message}` }]
            }
          ]
        })
      });
      const data = await response.json();
      const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (candidate) {
        replyText = candidate.trim();
      }
    } catch (e) {
      console.warn('Gemini call failed, falling back.');
    }
  }

  // 4. Intelligent Built-in Naiwa Dialogue Engine
  if (!replyText) {
    for (const rule of FALLBACK_RESPONSES) {
      if (rule.match.test(message)) {
        replyText = rule.replies[Math.floor(Math.random() * rule.replies.length)];
        break;
      }
    }
    if (!replyText) {
      const generalQuotes = [
        `呱哈哈！主人你说得太对啦！${pet.pet_name}赞成得直拍大白肚皮~`,
        `duang duang~ 收到主人的话啦！本蛙现在体重 ${pet.weight}kg，今天也超级喜欢主人哦！`,
        '哈哈！本蛙眨了眨翠绿的大蛙眼，摸了摸圆滚滚的白肚肚：咱们待会儿去吃烤羊肉串好不好？',
        '本蛙虽然只是一只小奶蛙，但我对主人的喜欢比我的大肚皮还要大十倍！'
      ];
      replyText = generalQuotes[Math.floor(Math.random() * generalQuotes.length)];
    }
  }

  db.saveChatLog(userId, 'assistant', replyText);
  res.json({ reply: replyText });
});

// ----------------- Social & Leaderboard Routes -----------------
app.get('/api/social/leaderboard', (req, res) => {
  const leaderboards = db.getLeaderboards();
  res.json(leaderboards);
});

app.get('/api/social/visit/:userId', (req, res) => {
  const targetId = parseInt(req.params.userId, 10);
  const targetUser = db.getUserById(targetId);
  const targetPet = db.getPetByUserId(targetId);
  const guestbook = db.getGuestbook(targetId);

  if (!targetUser || !targetPet) {
    return res.status(404).json({ error: '玩家不存在' });
  }

  res.json({
    user: targetUser,
    pet: targetPet,
    guestbook
  });
});

app.post('/api/social/interact', authenticateToken, (req, res) => {
  const { targetUserId, type, content } = req.body;
  const targetId = parseInt(targetUserId, 10);
  const authorId = req.user.id;
  const authorNickname = req.user.nickname;

  if (targetId === authorId && type !== 'message') {
    return res.status(400).json({ error: '不能在自己的房间给自己点赞投喂哦' });
  }

  const targetPet = db.getPetByUserId(targetId);
  if (!targetPet) return res.status(404).json({ error: '目标宠物不存在' });

  let authorPet = db.getPetByUserId(authorId);
  let feedback = '';

  if (type === 'poke') {
    db.updatePet(targetId, {
      likes_count: targetPet.likes_count + 1,
      mood: Math.min(100, targetPet.mood + 5)
    });
    const coinResult = addCoinsWithDailyCap(authorPet, 5);
    db.updatePet(authorId, {
      coins: coinResult.coins,
      daily_coins: coinResult.daily_coins,
      daily_coins_date: coinResult.daily_coins_date
    });
    db.addGuestbook(targetId, authorId, authorNickname, `${authorNickname} 戳了戳你家奶蛙的大肚皮，并留下了热情的点赞！`, 'poke');
    feedback = coinResult.actualCoinGain > 0
      ? `成功戳了戳好友奶蛙的大肚皮！获得友情奖励 +${coinResult.actualCoinGain} 奶蛙币！`
      : '成功戳了戳好友奶蛙的大肚皮！';
  } else if (type === 'gift_food') {
    if (authorPet.coins < 15) {
      return res.status(400).json({ error: '金币不足，赠送羊肉串需要 15 奶蛙币' });
    }
    db.updatePet(authorId, { coins: authorPet.coins - 15 });
    db.updatePet(targetId, {
      hunger: Math.min(100, targetPet.hunger + 15),
      weight: Number((targetPet.weight + 0.5).toFixed(1))
    });
    db.addGuestbook(targetId, authorId, authorNickname, `${authorNickname} 赠送了一串香喷喷的秘制烤羊肉串！奶蛙吃得好开心！`, 'gift_food');
    feedback = '成功给好友奶蛙投喂了一串秘制羊肉串！好友奶蛙的大肚子更圆啦！';
  } else if (type === 'message') {
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: '留言内容不能为空' });
    }
    db.addGuestbook(targetId, authorId, authorNickname, content.trim().slice(0, 120), 'message');
    feedback = '留言发布成功！';
  } else {
    return res.status(400).json({ error: '未知互动类型' });
  }

  const updatedGuestbook = db.getGuestbook(targetId);
  const updatedTargetPet = db.getPetByUserId(targetId);
  const updatedAuthorPet = db.getPetByUserId(authorId);

  res.json({
    success: true,
    feedback,
    pet: updatedTargetPet,
    myPet: updatedAuthorPet,
    guestbook: updatedGuestbook
  });
});

app.listen(PORT, () => {
  console.log(`🐸 奶蛙云端养成网站已启动：http://localhost:${PORT}`);
  console.log(`📦 静态资源路径：${path.join(__dirname, 'public')}`);
});
