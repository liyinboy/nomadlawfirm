// db.js — MySQL data layer.
//
// This module replaces the old lowdb (JSON file) storage with a real MySQL
// database, so all content survives redeploys on platforms with ephemeral
// disks (Railway, Hostinger Web Apps, Render, etc.) without needing a
// persistent volume — only a MySQL database connection is required.
//
// Field names exposed to the rest of the app (server.js, EJS views) are kept
// IDENTICAL to the old lowdb structure (e.g. `order`, `desc`, `date`, `read`)
// even though a few of those are reserved words in SQL — the actual columns
// use safe names internally (sortOrder, descText, itemDate, isRead, ...) and
// are aliased back in every SELECT so nothing else in the app has to change.

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

let pool;

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Self-healing migration: if a table already existed before new columns were
// added to the code (e.g. gallery gaining video support), CREATE TABLE IF NOT
// EXISTS won't add them. This checks each table's real columns and ALTERs in
// whatever is missing, so old deployments auto-repair on restart.
async function ensureColumns(table, columns) {
  const dbNameRows = await query('SELECT DATABASE() AS db');
  const dbName = dbNameRows[0].db;
  const existing = await query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [dbName, table]
  );
  const existingNames = new Set(existing.map(r => r.COLUMN_NAME));
  for (const [col, def] of Object.entries(columns)) {
    if (!existingNames.has(col)) {
      console.log(`[migration] Menambahkan kolom hilang: ${table}.${col}`);
      await query(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    }
  }
}

// ---------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------
async function createSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INT PRIMARY KEY DEFAULT 1,
      officeName VARCHAR(255), shortName VARCHAR(255), tagline VARCHAR(255),
      heroTitle VARCHAR(255), heroSubtitle TEXT,
      aboutText TEXT, visionText TEXT, missionText TEXT,
      phone VARCHAR(50), phoneDisplay VARCHAR(50), whatsapp VARCHAR(50), email VARCHAR(255),
      address VARCHAR(500), operationalHours VARCHAR(255),
      instagram VARCHAR(255), tiktok VARCHAR(255), facebook VARCHAR(255),
      mapEmbedUrl VARCHAR(1000), mapUrl VARCHAR(1000),
      totalCasesHandled INT DEFAULT 0, statsYear INT, ongoingCases INT DEFAULT 0,
      heroImage VARCHAR(500), aboutImage VARCHAR(500)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS admin_user (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(255) UNIQUE NOT NULL,
      passwordHash VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS team (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255), title VARCHAR(255), role VARCHAR(50),
      photo VARCHAR(500), bio TEXT, sortOrder INT DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS services (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255), icon VARCHAR(50), descText TEXT, sortOrder INT DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS articles (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(500), slug VARCHAR(500) UNIQUE, excerpt TEXT, content LONGTEXT,
      author VARCHAR(255), image VARCHAR(500), articleDate DATETIME, published TINYINT(1) DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS gallery (
      id VARCHAR(64) PRIMARY KEY,
      caption VARCHAR(500), type VARCHAR(20), image VARCHAR(500),
      videoSource VARCHAR(20), videoId VARCHAR(100), videoUrl VARCHAR(500),
      itemDate DATETIME
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS partners (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255), description TEXT, url VARCHAR(500), logo VARCHAR(500)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255), email VARCHAR(255), phone VARCHAR(50),
      subject VARCHAR(500), message TEXT, msgDate DATETIME, isRead TINYINT(1) DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS consult_threads (
      id VARCHAR(64) PRIMARY KEY,
      clientToken VARCHAR(64), name VARCHAR(255), phone VARCHAR(50), email VARCHAR(255),
      topic VARCHAR(255), status VARCHAR(20) DEFAULT 'open',
      createdAt DATETIME, lastMessageAt DATETIME,
      adminUnread TINYINT(1) DEFAULT 1, clientUnread TINYINT(1) DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS consult_messages (
      id VARCHAR(64) PRIMARY KEY,
      threadId VARCHAR(64), sender VARCHAR(20), body TEXT, sentAt DATETIME,
      INDEX (threadId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS case_submissions (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255), phone VARCHAR(50), email VARCHAR(255),
      category VARCHAR(255), description TEXT,
      status VARCHAR(20) DEFAULT 'baru', adminNote TEXT,
      createdAt DATETIME
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Auto-repair tables that existed before newer columns were added to the schema.
  await ensureColumns('gallery', {
    caption: 'VARCHAR(500)', type: 'VARCHAR(20)', image: 'VARCHAR(500)',
    videoSource: 'VARCHAR(20)', videoId: 'VARCHAR(100)', videoUrl: 'VARCHAR(500)',
    itemDate: 'DATETIME'
  });
  await ensureColumns('settings', {
    heroImage: 'VARCHAR(500)', aboutImage: 'VARCHAR(500)', mapEmbedUrl: 'VARCHAR(1000)', mapUrl: 'VARCHAR(1000)'
  });
}

// ---------------------------------------------------------------------
// First-run seeding (only runs if tables are empty)
// ---------------------------------------------------------------------
async function seedIfEmpty() {
  const [{ c: settingsCount }] = await query('SELECT COUNT(*) AS c FROM settings');
  if (settingsCount === 0) {
    const seedPath = path.join(__dirname, 'data', 'db.seed.json');
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    const s = seed.settings;
    await query(
      `INSERT INTO settings (id, officeName, shortName, tagline, heroTitle, heroSubtitle,
        aboutText, visionText, missionText, phone, phoneDisplay, whatsapp, email, address,
        operationalHours, instagram, tiktok, facebook, mapEmbedUrl, mapUrl,
        totalCasesHandled, statsYear, ongoingCases, heroImage, aboutImage)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.officeName, s.shortName, s.tagline, s.heroTitle, s.heroSubtitle, s.aboutText,
       s.visionText, s.missionText, s.phone, s.phoneDisplay, s.whatsapp, s.email, s.address,
       s.operationalHours, s.instagram, s.tiktok, s.facebook, s.mapEmbedUrl || '', s.mapUrl || '',
       s.totalCasesHandled || 0, s.statsYear || new Date().getFullYear(), s.ongoingCases || 0,
       s.heroImage || '', s.aboutImage || '']
    );

    const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'nomad@admin123';
    const defaultUsername = process.env.ADMIN_DEFAULT_USERNAME || 'admin';
    await query('INSERT INTO admin_user (username, passwordHash) VALUES (?, ?)', [
      defaultUsername, bcrypt.hashSync(defaultPassword, 10)
    ]);

    for (const m of seed.team) {
      await query(
        'INSERT INTO team (id, name, title, role, photo, bio, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [m.id, m.name, m.title, m.role, m.photo || '', m.bio || '', m.order || 1]
      );
    }
    for (const sv of seed.services) {
      await query(
        'INSERT INTO services (id, title, icon, descText, sortOrder) VALUES (?, ?, ?, ?, ?)',
        [sv.id, sv.title, sv.icon, sv.desc, sv.order || 1]
      );
    }

    console.log('==================================================');
    console.log(' Database MySQL baru diisi data awal.');
    console.log(' Login admin default:');
    console.log('   Username : ' + defaultUsername);
    console.log('   Password : ' + defaultPassword);
    console.log(' -> Segera login ke /admin dan ganti password di menu Pengaturan.');
    console.log('==================================================');
  }
}

// ---------------------------------------------------------------------
// One-time migration helper: import an existing storage/db.json (from the
// previous file-based version of this app) into MySQL, but only if MySQL
// is still empty. Safe to leave in place permanently — it no-ops once data
// already exists.
// ---------------------------------------------------------------------
async function migrateFromJsonIfPresent() {
  const [{ c: settingsCount }] = await query('SELECT COUNT(*) AS c FROM settings');
  if (settingsCount > 0) return; // already has data, nothing to migrate

  const oldDbPath = path.join(__dirname, 'data', 'db.json');
  if (!fs.existsSync(oldDbPath)) return;

  const old = JSON.parse(fs.readFileSync(oldDbPath, 'utf-8'));
  const s = old.settings || {};
  await query(
    `INSERT INTO settings (id, officeName, shortName, tagline, heroTitle, heroSubtitle,
      aboutText, visionText, missionText, phone, phoneDisplay, whatsapp, email, address,
      operationalHours, instagram, tiktok, facebook, mapEmbedUrl, mapUrl,
      totalCasesHandled, statsYear, ongoingCases, heroImage, aboutImage)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.officeName, s.shortName, s.tagline, s.heroTitle, s.heroSubtitle, s.aboutText,
     s.visionText, s.missionText, s.phone, s.phoneDisplay, s.whatsapp, s.email, s.address,
     s.operationalHours, s.instagram, s.tiktok, s.facebook, s.mapEmbedUrl || '', s.mapUrl || '',
     s.totalCasesHandled || 0, s.statsYear || new Date().getFullYear(), s.ongoingCases || 0,
     s.heroImage || '', s.aboutImage || '']
  );
  if (old.admin) {
    await query('INSERT INTO admin_user (username, passwordHash) VALUES (?, ?)', [
      old.admin.username, old.admin.passwordHash
    ]);
  }
  for (const m of old.team || []) {
    await query('INSERT INTO team (id, name, title, role, photo, bio, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [m.id, m.name, m.title, m.role, m.photo || '', m.bio || '', m.order || 1]);
  }
  for (const sv of old.services || []) {
    await query('INSERT INTO services (id, title, icon, descText, sortOrder) VALUES (?, ?, ?, ?, ?)',
      [sv.id, sv.title, sv.icon, sv.desc, sv.order || 1]);
  }
  for (const a of old.articles || []) {
    await query(
      'INSERT INTO articles (id, title, slug, excerpt, content, author, image, articleDate, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [a.id, a.title, a.slug, a.excerpt || '', a.content || '', a.author || '', a.image || '', new Date(a.date), a.published ? 1 : 0]
    );
  }
  for (const g of old.gallery || []) {
    await query(
      'INSERT INTO gallery (id, caption, type, image, videoSource, videoId, videoUrl, itemDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [g.id, g.caption || '', g.type || 'photo', g.image || '', g.videoSource || null, g.videoId || null, g.videoUrl || null, new Date(g.date)]
    );
  }
  for (const p of old.partners || []) {
    await query('INSERT INTO partners (id, name, description, url, logo) VALUES (?, ?, ?, ?, ?)',
      [p.id, p.name, p.description || '', p.url || '', p.logo || '']);
  }
  for (const msg of old.messages || []) {
    await query(
      'INSERT INTO messages (id, name, email, phone, subject, message, msgDate, isRead) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [msg.id, msg.name, msg.email || '', msg.phone || '', msg.subject || '', msg.message, new Date(msg.date), msg.read ? 1 : 0]
    );
  }
  console.log('Migrasi: data lama dari data/db.json berhasil dipindahkan ke MySQL.');
}

// One-time addition: 3 new practice areas requested after the site was already
// live (Kepailitan/PKPU, Hak Kekayaan Intelektual, Legal Due Diligence). Runs on
// every startup but only inserts rows whose id isn't already in the table, so it
// is safe to leave in place permanently and never duplicates or overwrites
// anything an admin has since edited or deleted.
async function ensureNewServices() {
  const additions = [
    { id: 'kepailitan-pkpu', title: 'Kepailitan / PKPU', icon: 'document',
      desc: 'Penanganan permohonan kepailitan dan Penundaan Kewajiban Pembayaran Utang (PKPU), baik mewakili debitor maupun kreditor.', order: 9 },
    { id: 'hki', title: 'Hak Kekayaan Intelektual', icon: 'book',
      desc: 'Pendaftaran, perlindungan, dan penyelesaian sengketa merek, hak cipta, paten, serta kekayaan intelektual lainnya.', order: 10 },
    { id: 'legal-due-diligence', title: 'Legal Due Diligence', icon: 'building',
      desc: 'Uji tuntas aspek hukum untuk kebutuhan akuisisi, investasi, dan kerja sama bisnis.', order: 11 }
  ];
  const existing = await query('SELECT id FROM services');
  const existingIds = new Set(existing.map(r => r.id));
  for (const sv of additions) {
    if (!existingIds.has(sv.id)) {
      console.log(`[migration] Menambahkan layanan baru: ${sv.title}`);
      await query('INSERT INTO services (id, title, icon, descText, sortOrder) VALUES (?, ?, ?, ?, ?)',
        [sv.id, sv.title, sv.icon, sv.desc, sv.order]);
    }
  }
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
async function init() {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nomad_lawfirm',
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: false
  });
  // Fail fast with a clear message if credentials/DB are wrong
  await pool.query('SELECT 1');
  await createSchema();
  await migrateFromJsonIfPresent();
  await seedIfEmpty();
  await ensureNewServices();
}

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------
const Settings = {
  async get() {
    const rows = await query('SELECT * FROM settings WHERE id = 1');
    return rows[0];
  },
  async update(fields) {
    const cols = Object.keys(fields);
    if (!cols.length) return;
    const setSql = cols.map(c => `${c} = ?`).join(', ');
    await query(`UPDATE settings SET ${setSql} WHERE id = 1`, cols.map(c => fields[c]));
  }
};

// ---------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------
const Admin = {
  async get() {
    const rows = await query('SELECT * FROM admin_user LIMIT 1');
    return rows[0];
  },
  async updatePassword(passwordHash) {
    await query('UPDATE admin_user SET passwordHash = ? ORDER BY id LIMIT 1', [passwordHash]);
  }
};

// ---------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------
const Team = {
  async all() {
    return query('SELECT id, name, title, role, photo, bio, sortOrder AS `order` FROM team ORDER BY sortOrder ASC');
  },
  async count() {
    const [{ c }] = await query('SELECT COUNT(*) AS c FROM team');
    return c;
  },
  async find(id) {
    const rows = await query('SELECT id, name, title, role, photo, bio, sortOrder AS `order` FROM team WHERE id = ?', [id]);
    return rows[0];
  },
  async create(data) {
    const id = newId('team');
    await query(
      'INSERT INTO team (id, name, title, role, photo, bio, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, data.name, data.title, data.role || 'associate', data.photo || '', data.bio || '', data.order]
    );
    return id;
  },
  async update(id, data) {
    await query(
      'UPDATE team SET name=?, title=?, role=?, bio=?, sortOrder=?, photo=COALESCE(?, photo) WHERE id=?',
      [data.name, data.title, data.role, data.bio, data.order, data.photo || null, id]
    );
  },
  async remove(id) {
    await query('DELETE FROM team WHERE id = ?', [id]);
  }
};

// ---------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------
const Services = {
  async all() {
    return query('SELECT id, title, icon, descText AS `desc`, sortOrder AS `order` FROM services ORDER BY sortOrder ASC');
  },
  async count() {
    const [{ c }] = await query('SELECT COUNT(*) AS c FROM services');
    return c;
  },
  async find(id) {
    const rows = await query('SELECT id, title, icon, descText AS `desc`, sortOrder AS `order` FROM services WHERE id = ?', [id]);
    return rows[0];
  },
  async create(data) {
    const id = newId('svc');
    await query('INSERT INTO services (id, title, icon, descText, sortOrder) VALUES (?, ?, ?, ?, ?)',
      [id, data.title, data.icon || 'document', data.desc || '', data.order]);
    return id;
  },
  async update(id, data) {
    await query('UPDATE services SET title=?, icon=?, descText=?, sortOrder=? WHERE id=?',
      [data.title, data.icon, data.desc, data.order, id]);
  },
  async remove(id) {
    await query('DELETE FROM services WHERE id = ?', [id]);
  }
};

// ---------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------
const Articles = {
  async all() {
    return query('SELECT id, title, slug, excerpt, content, author, image, articleDate AS `date`, published FROM articles ORDER BY articleDate DESC');
  },
  async allPublished(limit) {
    const sql = 'SELECT id, title, slug, excerpt, content, author, image, articleDate AS `date`, published FROM articles WHERE published = 1 ORDER BY articleDate DESC' + (limit ? ' LIMIT ?' : '');
    return limit ? query(sql, [limit]) : query(sql);
  },
  async count() {
    const [{ c }] = await query('SELECT COUNT(*) AS c FROM articles');
    return c;
  },
  async countPublished() {
    const [{ c }] = await query('SELECT COUNT(*) AS c FROM articles WHERE published = 1');
    return c;
  },
  async page(offset, limit) {
    return query('SELECT id, title, slug, excerpt, content, author, image, articleDate AS `date`, published FROM articles WHERE published = 1 ORDER BY articleDate DESC LIMIT ? OFFSET ?', [limit, offset]);
  },
  async find(id) {
    const rows = await query('SELECT id, title, slug, excerpt, content, author, image, articleDate AS `date`, published FROM articles WHERE id = ?', [id]);
    return rows[0];
  },
  async findBySlug(slug) {
    const rows = await query('SELECT id, title, slug, excerpt, content, author, image, articleDate AS `date`, published FROM articles WHERE slug = ? AND published = 1', [slug]);
    return rows[0];
  },
  async slugExists(slug, excludeId) {
    const rows = excludeId
      ? await query('SELECT id FROM articles WHERE slug = ? AND id != ?', [slug, excludeId])
      : await query('SELECT id FROM articles WHERE slug = ?', [slug]);
    return rows.length > 0;
  },
  async related(slug, limit) {
    return query('SELECT id, title, slug, excerpt, content, author, image, articleDate AS `date`, published FROM articles WHERE published = 1 AND slug != ? ORDER BY articleDate DESC LIMIT ?', [slug, limit]);
  },
  async create(data) {
    const id = newId('art');
    await query(
      'INSERT INTO articles (id, title, slug, excerpt, content, author, image, articleDate, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.title, data.slug, data.excerpt || '', data.content || '', data.author || '', data.image || '', new Date(), data.published ? 1 : 0]
    );
    return id;
  },
  async update(id, data) {
    const sets = ['title=?', 'excerpt=?', 'content=?', 'author=?', 'published=?'];
    const params = [data.title, data.excerpt, data.content, data.author, data.published ? 1 : 0];
    if (data.slug) { sets.push('slug=?'); params.push(data.slug); }
    if (data.image) { sets.push('image=?'); params.push(data.image); }
    params.push(id);
    await query(`UPDATE articles SET ${sets.join(', ')} WHERE id=?`, params);
  },
  async remove(id) {
    await query('DELETE FROM articles WHERE id = ?', [id]);
  }
};

// ---------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------
const Gallery = {
  async all() {
    return query('SELECT id, caption, type, image, videoSource, videoId, videoUrl, itemDate AS `date` FROM gallery ORDER BY itemDate DESC');
  },
  async recent(limit) {
    return query('SELECT id, caption, type, image, videoSource, videoId, videoUrl, itemDate AS `date` FROM gallery ORDER BY itemDate DESC LIMIT ?', [limit]);
  },
  // Most recent video-type item, used for the auto-play "aktivitas terbaru"
  // widget on the homepage. Returns undefined if no video has been uploaded yet.
  async latestVideo() {
    const rows = await query(
      "SELECT id, caption, type, image, videoSource, videoId, videoUrl, itemDate AS `date` FROM gallery WHERE type = 'video' ORDER BY itemDate DESC LIMIT 1"
    );
    return rows[0];
  },
  async count() {
    const [{ c }] = await query('SELECT COUNT(*) AS c FROM gallery');
    return c;
  },
  async find(id) {
    const rows = await query('SELECT id, caption, type, image, videoSource, videoId, videoUrl, itemDate AS `date` FROM gallery WHERE id = ?', [id]);
    return rows[0];
  },
  async createPhoto(data) {
    const id = newId('gal');
    await query('INSERT INTO gallery (id, caption, type, image, itemDate) VALUES (?, ?, "photo", ?, ?)',
      [id, data.caption || '', data.image, new Date()]);
    return id;
  },
  async createVideo(data) {
    const id = newId('gal');
    await query(
      'INSERT INTO gallery (id, caption, type, image, videoSource, videoId, videoUrl, itemDate) VALUES (?, ?, "video", ?, ?, ?, ?, ?)',
      [id, data.caption || '', data.image || '', data.videoSource, data.videoId || null, data.videoUrl || null, new Date()]
    );
    return id;
  },
  async remove(id) {
    await query('DELETE FROM gallery WHERE id = ?', [id]);
  }
};

// ---------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------
const Partners = {
  async all() {
    return query('SELECT id, name, description, url, logo FROM partners ORDER BY name ASC');
  },
  async count() {
    const [{ c }] = await query('SELECT COUNT(*) AS c FROM partners');
    return c;
  },
  async find(id) {
    const rows = await query('SELECT id, name, description, url, logo FROM partners WHERE id = ?', [id]);
    return rows[0];
  },
  async create(data) {
    const id = newId('ptn');
    await query('INSERT INTO partners (id, name, description, url, logo) VALUES (?, ?, ?, ?, ?)',
      [id, data.name, data.description || '', data.url || '', data.logo || '']);
    return id;
  },
  async update(id, data) {
    await query('UPDATE partners SET name=?, description=?, url=?, logo=COALESCE(?, logo) WHERE id=?',
      [data.name, data.description, data.url, data.logo || null, id]);
  },
  async remove(id) {
    await query('DELETE FROM partners WHERE id = ?', [id]);
  }
};

// ---------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------
const Messages = {
  async all() {
    return query('SELECT id, name, email, phone, subject, message, msgDate AS `date`, isRead AS `read` FROM messages ORDER BY msgDate DESC');
  },
  async countUnread() {
    const [{ c }] = await query('SELECT COUNT(*) AS c FROM messages WHERE isRead = 0');
    return c;
  },
  async create(data) {
    const id = newId('msg');
    await query('INSERT INTO messages (id, name, email, phone, subject, message, msgDate, isRead) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
      [id, data.name, data.email || '', data.phone || '', data.subject || '', data.message, new Date()]);
    return id;
  },
  async markAllRead() {
    await query('UPDATE messages SET isRead = 1 WHERE isRead = 0');
  },
  async remove(id) {
    await query('DELETE FROM messages WHERE id = ?', [id]);
  }
};

// ---------------------------------------------------------------------
// Consultations (konsultasi chat: klien tamu <-> admin)
// ---------------------------------------------------------------------
const Consultations = {
  async findByToken(token) {
    const rows = await query(
      `SELECT id, clientToken, name, phone, email, topic, status,
        createdAt, lastMessageAt, adminUnread, clientUnread
       FROM consult_threads WHERE clientToken = ? ORDER BY createdAt DESC LIMIT 1`,
      [token]
    );
    return rows[0];
  },
  async find(id) {
    const rows = await query(
      `SELECT id, clientToken, name, phone, email, topic, status,
        createdAt, lastMessageAt, adminUnread, clientUnread
       FROM consult_threads WHERE id = ?`,
      [id]
    );
    return rows[0];
  },
  async all() {
    return query(
      `SELECT id, clientToken, name, phone, email, topic, status,
        createdAt, lastMessageAt, adminUnread, clientUnread
       FROM consult_threads ORDER BY lastMessageAt DESC`
    );
  },
  async countOpenUnread() {
    const [{ c }] = await query("SELECT COUNT(*) AS c FROM consult_threads WHERE adminUnread = 1");
    return c;
  },
  async create({ clientToken, name, phone, email, topic, firstMessage }) {
    const id = newId('thr');
    const now = new Date();
    await query(
      `INSERT INTO consult_threads (id, clientToken, name, phone, email, topic, status, createdAt, lastMessageAt, adminUnread, clientUnread)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, 1, 0)`,
      [id, clientToken, name, phone || '', email || '', topic || '', now, now]
    );
    if (firstMessage) {
      await query('INSERT INTO consult_messages (id, threadId, sender, body, sentAt) VALUES (?, ?, "client", ?, ?)',
        [newId('msg'), id, firstMessage, now]);
    }
    return id;
  },
  async messages(threadId) {
    return query('SELECT id, threadId, sender, body, sentAt FROM consult_messages WHERE threadId = ? ORDER BY sentAt ASC', [threadId]);
  },
  async messagesSince(threadId, sinceId) {
    if (!sinceId) return this.messages(threadId);
    return query(
      'SELECT id, threadId, sender, body, sentAt FROM consult_messages WHERE threadId = ? AND sentAt > (SELECT sentAt FROM consult_messages WHERE id = ?) ORDER BY sentAt ASC',
      [threadId, sinceId]
    );
  },
  async addMessage(threadId, sender, body) {
    const now = new Date();
    await query('INSERT INTO consult_messages (id, threadId, sender, body, sentAt) VALUES (?, ?, ?, ?, ?)',
      [newId('msg'), threadId, sender, body, now]);
    if (sender === 'client') {
      await query('UPDATE consult_threads SET lastMessageAt = ?, adminUnread = 1 WHERE id = ?', [now, threadId]);
    } else {
      await query('UPDATE consult_threads SET lastMessageAt = ?, clientUnread = 1, status = "open" WHERE id = ?', [now, threadId]);
    }
  },
  async markAdminRead(threadId) {
    await query('UPDATE consult_threads SET adminUnread = 0 WHERE id = ?', [threadId]);
  },
  async markClientRead(threadId) {
    await query('UPDATE consult_threads SET clientUnread = 0 WHERE id = ?', [threadId]);
  },
  async close(threadId) {
    await query('UPDATE consult_threads SET status = "closed" WHERE id = ?', [threadId]);
  }
};

// ---------------------------------------------------------------------
// Case submissions (Ajukan Kasus)
// ---------------------------------------------------------------------
const Cases = {
  async all() {
    return query(
      `SELECT id, name, phone, email, category, description, status, adminNote, createdAt
       FROM case_submissions ORDER BY createdAt DESC`
    );
  },
  async find(id) {
    const rows = await query(
      `SELECT id, name, phone, email, category, description, status, adminNote, createdAt
       FROM case_submissions WHERE id = ?`,
      [id]
    );
    return rows[0];
  },
  async countNew() {
    const [{ c }] = await query("SELECT COUNT(*) AS c FROM case_submissions WHERE status = 'baru'");
    return c;
  },
  async create({ name, phone, email, category, description }) {
    const id = newId('case');
    await query(
      `INSERT INTO case_submissions (id, name, phone, email, category, description, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 'baru', ?)`,
      [id, name, phone || '', email || '', category || '', description, new Date()]
    );
    return id;
  },
  async updateStatus(id, status, adminNote) {
    await query('UPDATE case_submissions SET status = ?, adminNote = ? WHERE id = ?', [status, adminNote || '', id]);
  },
  async remove(id) {
    await query('DELETE FROM case_submissions WHERE id = ?', [id]);
  }
};

module.exports = { init, Settings, Admin, Team, Services, Articles, Gallery, Partners, Messages, Consultations, Cases };
