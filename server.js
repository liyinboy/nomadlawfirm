require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const slugify = require('slugify');
const cookieParser = require('cookie-parser');
const db = require('./db');

// ---- Persistent file storage location (uploaded photos/videos) ----
// The database itself now lives in MySQL (see db.js), but uploaded files
// still need a disk location. On platforms with ephemeral disks, either
// mount a persistent volume at STORAGE_DIR, or (recommended for Hostinger
// Web Apps / Railway without a volume) point STORAGE_DIR at a normal disk
// path -- files just won't survive a redeploy unless the disk is persistent.
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, 'storage');
const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
const SEED_UPLOADS_DIR = path.join(__dirname, 'data', 'seed-uploads'); // default photos shipped with the app (team, hero)

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Seed the default team photos & hero photo into persistent storage (only fills in files that don't exist yet,
// so it never overwrites photos an admin has already replaced).
if (fs.existsSync(SEED_UPLOADS_DIR)) {
  fs.readdirSync(SEED_UPLOADS_DIR, { withFileTypes: true }).forEach((entry) => {
    if (!entry.isDirectory()) return;
    const src = path.join(SEED_UPLOADS_DIR, entry.name);
    const dest = path.join(UPLOADS_DIR, entry.name);
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((file) => {
      const destFile = path.join(dest, file);
      if (!fs.existsSync(destFile)) fs.copyFileSync(path.join(src, file), destFile);
    });
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

// ---- View engine ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- Core middleware ----
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ---- Guest client identity for the consultation chat (independent of admin session) ----
const CLIENT_TOKEN_COOKIE = 'nlf_client';
function ensureClientToken(req, res, next) {
  let token = req.cookies[CLIENT_TOKEN_COOKIE];
  if (!token) {
    token = crypto.randomBytes(20).toString('hex');
    res.cookie(CLIENT_TOKEN_COOKIE, token, { maxAge: 1000 * 60 * 60 * 24 * 365, httpOnly: true, sameSite: 'lax' });
  }
  req.clientToken = token;
  next();
}

app.use(session({
  secret: process.env.SESSION_SECRET || 'nomad-law-firm-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));
app.use(flash());

// Make settings & flash messages available to every view
app.use(async (req, res, next) => {
  try {
    res.locals.settings = await db.Settings.get();
    res.locals.currentAdmin = req.session.admin || null;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.currentPath = req.path;
    if (req.session && req.session.admin) {
      const [unreadMessages, unreadConsults, newCases] = await Promise.all([
        db.Messages.countUnread(), db.Consultations.countOpenUnread(), db.Cases.countNew()
      ]);
      res.locals.unreadMessages = unreadMessages;
      res.locals.unreadConsults = unreadConsults;
      res.locals.newCases = newCases;
    } else {
      res.locals.unreadMessages = 0;
      res.locals.unreadConsults = 0;
      res.locals.newCases = 0;
    }
    next();
  } catch (err) {
    next(err);
  }
});

// ---- Upload handling ----
function makeUploader(subfolder) {
  const dir = path.join(UPLOADS_DIR, subfolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = slugify(path.basename(file.originalname, ext), { lower: true, strict: true }).slice(0, 40);
      cb(null, `${Date.now()}-${base || 'file'}${ext}`);
    }
  });
  const fileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif|svg/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
    cb(ok ? null : new Error('Format file harus JPG, PNG, WEBP, GIF, atau SVG.'), ok);
  };
  return multer({ storage, fileFilter, limits: { fileSize: 6 * 1024 * 1024 } });
}
const uploadTeam = makeUploader('team');
const uploadArticle = makeUploader('articles');
const uploadPartner = makeUploader('partners');
const uploadHero = makeUploader('hero');

// Combined uploader for the gallery route: accepts either an image field or a video field
const galleryVideoDir = path.join(UPLOADS_DIR, 'gallery-videos');
if (!fs.existsSync(galleryVideoDir)) fs.mkdirSync(galleryVideoDir, { recursive: true });
const galleryPhotoDir = path.join(UPLOADS_DIR, 'gallery');
if (!fs.existsSync(galleryPhotoDir)) fs.mkdirSync(galleryPhotoDir, { recursive: true });

const galleryStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, file.fieldname === 'video' ? galleryVideoDir : galleryPhotoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = slugify(path.basename(file.originalname, ext), { lower: true, strict: true }).slice(0, 40);
    cb(null, `${Date.now()}-${base || 'file'}${ext}`);
  }
});
const galleryFileFilter = (req, file, cb) => {
  if (file.fieldname === 'video') {
    const allowed = /mp4|webm|mov|mkv|avi|m4v/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Format video harus MP4, WEBM, MOV, MKV, atau AVI.'), ok);
  } else {
    const allowed = /jpeg|jpg|png|webp|gif|svg/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
    cb(ok ? null : new Error('Format foto harus JPG, PNG, WEBP, GIF, atau SVG.'), ok);
  }
};
// Video files need a much larger size allowance than images (default here: 300MB)
const uploadGalleryItem = multer({ storage: galleryStorage, fileFilter: galleryFileFilter, limits: { fileSize: 300 * 1024 * 1024 } });

function removeFileIfLocal(urlPath) {
  if (!urlPath || !urlPath.startsWith('/uploads/')) return;
  const full = path.join(UPLOADS_DIR, urlPath.replace(/^\/uploads\//, ''));
  fs.unlink(full, () => {});
}

// ---- Auth guard ----
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  req.flash('error', 'Silakan login terlebih dahulu.');
  res.redirect('/admin/login');
}

// ---- Small helper to avoid try/catch boilerplate on every async route ----
function h(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// =====================================================================
// PUBLIC ROUTES
// =====================================================================
app.get('/', h(async (req, res) => {
  const [team, services, articles, gallery, partners, latestVideo] = await Promise.all([
    db.Team.all(), db.Services.all(), db.Articles.allPublished(3), db.Gallery.recent(6), db.Partners.all(), db.Gallery.latestVideo()
  ]);
  res.render('index', {
    title: null,
    team: team.filter(t => t.role !== 'associate').slice(0, 4),
    services, articles, gallery, partners, latestVideo
  });
}));

app.get('/tentang-kami', (req, res) => {
  res.render('about', { title: 'Tentang Kami' });
});

app.get('/layanan', h(async (req, res) => {
  const services = await db.Services.all();
  res.render('services', { title: 'Layanan Hukum', services });
}));

app.get('/tim-kami', h(async (req, res) => {
  const team = await db.Team.all();
  res.render('team', {
    title: 'Tim Kami',
    managingPartner: team.filter(t => t.role === 'managing-partner'),
    partners: team.filter(t => t.role === 'partner'),
    associates: team.filter(t => t.role === 'associate')
  });
}));

app.get('/berita', h(async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const perPage = 6;
  const [articles, total] = await Promise.all([
    db.Articles.page((page - 1) * perPage, perPage), db.Articles.countPublished()
  ]);
  res.render('news', {
    title: 'Berita & Artikel',
    articles, page,
    totalPages: Math.max(Math.ceil(total / perPage), 1)
  });
}));

app.get('/berita/:slug', h(async (req, res) => {
  const article = await db.Articles.findBySlug(req.params.slug);
  if (!article) return res.status(404).render('404', { title: 'Halaman Tidak Ditemukan' });
  const related = await db.Articles.related(article.slug, 3);
  res.render('news-detail', { title: article.title, article, related });
}));

app.get('/galeri', h(async (req, res) => {
  const gallery = await db.Gallery.all();
  res.render('gallery', { title: 'Galeri Kegiatan', gallery });
}));

app.get('/mitra', h(async (req, res) => {
  const partners = await db.Partners.all();
  res.render('partners', { title: 'Mitra Kerja Sama', partners });
}));

app.get('/kontak', (req, res) => {
  res.render('contact', { title: 'Kontak Kami' });
});

app.post('/kontak', h(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !message) {
    req.flash('error', 'Nama dan pesan wajib diisi.');
    return res.redirect('/kontak');
  }
  await db.Messages.create({ name, email, phone, subject, message });
  req.flash('success', 'Pesan Anda berhasil dikirim. Tim kami akan segera menghubungi Anda.');
  res.redirect('/kontak');
}));

// =====================================================================
// KONSULTASI (chat singkat dengan advokat, tersimpan di database)
// =====================================================================
app.get('/konsultasi', ensureClientToken, h(async (req, res) => {
  const thread = await db.Consultations.findByToken(req.clientToken);
  let messages = [];
  if (thread) {
    messages = await db.Consultations.messages(thread.id);
    await db.Consultations.markClientRead(thread.id);
  }
  res.render('konsultasi', { title: 'Konsultasi Advokat', thread: thread || null, messages });
}));

app.post('/konsultasi/mulai', ensureClientToken, h(async (req, res) => {
  const { name, phone, topic, message } = req.body;
  if (!name || !message) {
    req.flash('error', 'Nama dan pertanyaan awal wajib diisi.');
    return res.redirect('/konsultasi');
  }
  const existing = await db.Consultations.findByToken(req.clientToken);
  if (existing && existing.status === 'open') {
    return res.redirect('/konsultasi');
  }
  await db.Consultations.create({
    clientToken: req.clientToken, name, phone, topic, firstMessage: message
  });
  res.redirect('/konsultasi');
}));

app.post('/konsultasi/kirim', ensureClientToken, h(async (req, res) => {
  const thread = await db.Consultations.findByToken(req.clientToken);
  const { message } = req.body;
  if (thread && thread.status === 'open' && message && message.trim()) {
    await db.Consultations.addMessage(thread.id, 'client', message.trim());
  }
  if (req.xhr || req.headers.accept === 'application/json') return res.json({ ok: true });
  res.redirect('/konsultasi');
}));

// Polling endpoint dipakai oleh halaman /konsultasi untuk mengambil balasan baru tanpa reload
app.get('/konsultasi/cek', ensureClientToken, h(async (req, res) => {
  const thread = await db.Consultations.findByToken(req.clientToken);
  if (!thread) return res.json({ status: 'none' });
  const since = req.query.since || null;
  const messages = await db.Consultations.messagesSince(thread.id, since);
  if (messages.length) await db.Consultations.markClientRead(thread.id);
  res.json({ status: thread.status, messages });
}));

// =====================================================================
// AJUKAN KASUS (klien mengirim ringkasan kasus untuk ditinjau tim)
// =====================================================================
app.get('/ajukan-kasus', (req, res) => {
  res.render('ajukan-kasus', { title: 'Ajukan Kasus' });
});

app.post('/ajukan-kasus', h(async (req, res) => {
  const { name, phone, email, category, description } = req.body;
  if (!name || !phone || !description) {
    req.flash('error', 'Nama, no. telepon, dan uraian kasus wajib diisi.');
    return res.redirect('/ajukan-kasus');
  }
  await db.Cases.create({ name, phone, email, category, description });
  req.flash('success', 'Kasus Anda berhasil diajukan. Tim kami akan meninjau dan menghubungi Anda segera.');
  res.redirect('/ajukan-kasus');
}));

// =====================================================================
// ADMIN AUTH
// =====================================================================
app.get('/admin/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { title: 'Login Admin', layout: false });
});

app.post('/admin/login', h(async (req, res) => {
  const { username, password } = req.body;
  const admin = await db.Admin.get();
  if (admin && username === admin.username && bcrypt.compareSync(password || '', admin.passwordHash)) {
    req.session.admin = { username };
    req.flash('success', 'Berhasil masuk. Selamat datang kembali!');
    return res.redirect('/admin');
  }
  req.flash('error', 'Username atau password salah.');
  res.redirect('/admin/login');
}));

app.post('/admin/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin', requireAuth, h(async (req, res) => {
  const [team, services, articles, gallery, partners, messages, consults, cases] = await Promise.all([
    db.Team.count(), db.Services.count(), db.Articles.count(), db.Gallery.count(), db.Partners.count(),
    db.Messages.countUnread(), db.Consultations.countOpenUnread(), db.Cases.countNew()
  ]);
  res.render('admin/dashboard', {
    title: 'Dashboard',
    counts: { team, services, articles, gallery, partners, messages, consults, cases }
  });
}));

// =====================================================================
// ADMIN: TEAM (identitas anggota)
// =====================================================================
app.get('/admin/team', requireAuth, h(async (req, res) => {
  res.render('admin/team', { title: 'Kelola Tim', team: await db.Team.all() });
}));

app.post('/admin/team', requireAuth, uploadTeam.single('photo'), h(async (req, res) => {
  const { name, title, role, bio, order } = req.body;
  const count = await db.Team.count();
  await db.Team.create({
    name, title, role: role || 'associate', bio: bio || '',
    photo: req.file ? `/uploads/team/${req.file.filename}` : '',
    order: parseInt(order) || (count + 1)
  });
  req.flash('success', 'Anggota tim baru berhasil ditambahkan.');
  res.redirect('/admin/team');
}));

app.put('/admin/team/:id', requireAuth, uploadTeam.single('photo'), h(async (req, res) => {
  const item = await db.Team.find(req.params.id);
  if (!item) { req.flash('error', 'Data tidak ditemukan.'); return res.redirect('/admin/team'); }
  const { name, title, role, bio, order } = req.body;
  let photo = null;
  if (req.file) {
    removeFileIfLocal(item.photo);
    photo = `/uploads/team/${req.file.filename}`;
  }
  await db.Team.update(req.params.id, { name, title, role, bio, order: parseInt(order) || item.order, photo });
  req.flash('success', 'Data anggota tim berhasil diperbarui.');
  res.redirect('/admin/team');
}));

app.delete('/admin/team/:id', requireAuth, h(async (req, res) => {
  const item = await db.Team.find(req.params.id);
  if (item) removeFileIfLocal(item.photo);
  await db.Team.remove(req.params.id);
  req.flash('success', 'Anggota tim dihapus.');
  res.redirect('/admin/team');
}));

// =====================================================================
// ADMIN: SERVICES (layanan hukum)
// =====================================================================
app.get('/admin/services', requireAuth, h(async (req, res) => {
  res.render('admin/services', { title: 'Kelola Layanan Hukum', services: await db.Services.all() });
}));

app.post('/admin/services', requireAuth, h(async (req, res) => {
  const { title, icon, desc, order } = req.body;
  const count = await db.Services.count();
  await db.Services.create({ title, icon: icon || 'document', desc: desc || '', order: parseInt(order) || (count + 1) });
  req.flash('success', 'Layanan hukum baru berhasil ditambahkan.');
  res.redirect('/admin/services');
}));

app.put('/admin/services/:id', requireAuth, h(async (req, res) => {
  const item = await db.Services.find(req.params.id);
  if (!item) { req.flash('error', 'Layanan tidak ditemukan.'); return res.redirect('/admin/services'); }
  const { title, icon, desc, order } = req.body;
  await db.Services.update(req.params.id, { title, icon: icon || item.icon, desc, order: parseInt(order) || item.order });
  req.flash('success', 'Layanan hukum berhasil diperbarui.');
  res.redirect('/admin/services');
}));

app.delete('/admin/services/:id', requireAuth, h(async (req, res) => {
  await db.Services.remove(req.params.id);
  req.flash('success', 'Layanan hukum dihapus.');
  res.redirect('/admin/services');
}));

// =====================================================================
// ADMIN: ARTICLES (artikel berita)
// =====================================================================
app.get('/admin/articles', requireAuth, h(async (req, res) => {
  res.render('admin/articles', { title: 'Kelola Artikel', articles: await db.Articles.all() });
}));

app.get('/admin/articles/new', requireAuth, (req, res) => {
  res.render('admin/article-form', { title: 'Tulis Artikel', article: null });
});

app.get('/admin/articles/:id/edit', requireAuth, h(async (req, res) => {
  const article = await db.Articles.find(req.params.id);
  if (!article) { req.flash('error', 'Artikel tidak ditemukan.'); return res.redirect('/admin/articles'); }
  res.render('admin/article-form', { title: 'Edit Artikel', article });
}));

app.post('/admin/articles', requireAuth, uploadArticle.single('image'), h(async (req, res) => {
  const { title, excerpt, content, author, published } = req.body;
  let slug = slugify(title, { lower: true, strict: true });
  let uniqueSlug = slug, i = 1;
  while (await db.Articles.slugExists(uniqueSlug)) uniqueSlug = `${slug}-${i++}`;
  await db.Articles.create({
    title, slug: uniqueSlug, excerpt: excerpt || '', content: content || '',
    author: author || res.locals.settings.officeName,
    image: req.file ? `/uploads/articles/${req.file.filename}` : '',
    published: published === 'on'
  });
  req.flash('success', 'Artikel berhasil dipublikasikan.');
  res.redirect('/admin/articles');
}));

app.put('/admin/articles/:id', requireAuth, uploadArticle.single('image'), h(async (req, res) => {
  const item = await db.Articles.find(req.params.id);
  if (!item) { req.flash('error', 'Artikel tidak ditemukan.'); return res.redirect('/admin/articles'); }
  const { title, excerpt, content, author, published } = req.body;
  const update = { title, excerpt, content, author, published: published === 'on' };
  if (title && title !== item.title) {
    let slug = slugify(title, { lower: true, strict: true });
    let uniqueSlug = slug, i = 1;
    while (await db.Articles.slugExists(uniqueSlug, item.id)) uniqueSlug = `${slug}-${i++}`;
    update.slug = uniqueSlug;
  }
  if (req.file) {
    removeFileIfLocal(item.image);
    update.image = `/uploads/articles/${req.file.filename}`;
  }
  await db.Articles.update(req.params.id, update);
  req.flash('success', 'Artikel berhasil diperbarui.');
  res.redirect('/admin/articles');
}));

app.delete('/admin/articles/:id', requireAuth, h(async (req, res) => {
  const item = await db.Articles.find(req.params.id);
  if (item) removeFileIfLocal(item.image);
  await db.Articles.remove(req.params.id);
  req.flash('success', 'Artikel dihapus.');
  res.redirect('/admin/articles');
}));

// =====================================================================
// ADMIN: GALLERY (foto & video kegiatan)
// =====================================================================
app.get('/admin/gallery', requireAuth, h(async (req, res) => {
  res.render('admin/gallery', { title: 'Kelola Galeri', gallery: await db.Gallery.all() });
}));

app.post('/admin/gallery', requireAuth, uploadGalleryItem.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), h(async (req, res) => {
  const { type, videoSource, videoUrl, captionPhoto, captionVideoUpload, captionVideoYoutube } = req.body;
  const imageFile = req.files && req.files.image && req.files.image[0];
  const videoFile = req.files && req.files.video && req.files.video[0];

  if (type === 'video') {
    if (videoSource === 'upload') {
      if (!videoFile) { req.flash('error', 'Pilih file video terlebih dahulu.'); return res.redirect('/admin/gallery'); }
      await db.Gallery.createVideo({ caption: captionVideoUpload, videoSource: 'upload', videoUrl: `/uploads/gallery-videos/${videoFile.filename}` });
      req.flash('success', 'Video kegiatan berhasil diunggah.');
      return res.redirect('/admin/gallery');
    }
    const videoId = extractYouTubeId(videoUrl);
    if (!videoId) {
      req.flash('error', 'Link YouTube tidak valid. Pastikan link berupa youtube.com/watch?v=... atau youtu.be/...');
      return res.redirect('/admin/gallery');
    }
    await db.Gallery.createVideo({ caption: captionVideoYoutube, videoSource: 'youtube', videoId, image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` });
    req.flash('success', 'Video kegiatan berhasil ditambahkan.');
    return res.redirect('/admin/gallery');
  }

  if (!imageFile) { req.flash('error', 'Pilih foto terlebih dahulu.'); return res.redirect('/admin/gallery'); }
  await db.Gallery.createPhoto({ caption: captionPhoto, image: `/uploads/gallery/${imageFile.filename}` });
  req.flash('success', 'Foto kegiatan berhasil diunggah.');
  res.redirect('/admin/gallery');
}));

app.delete('/admin/gallery/:id', requireAuth, h(async (req, res) => {
  const item = await db.Gallery.find(req.params.id);
  if (item) {
    if (item.type === 'photo') removeFileIfLocal(item.image);
    else if (item.type === 'video' && item.videoSource === 'upload') removeFileIfLocal(item.videoUrl);
  }
  await db.Gallery.remove(req.params.id);
  req.flash('success', 'Item galeri dihapus.');
  res.redirect('/admin/gallery');
}));

// =====================================================================
// ADMIN: PARTNERS (mitra perusahaan)
// =====================================================================
app.get('/admin/partners', requireAuth, h(async (req, res) => {
  res.render('admin/partners', { title: 'Kelola Mitra', partners: await db.Partners.all() });
}));

app.post('/admin/partners', requireAuth, uploadPartner.single('logo'), h(async (req, res) => {
  const { name, description, url } = req.body;
  await db.Partners.create({ name, description, url, logo: req.file ? `/uploads/partners/${req.file.filename}` : '' });
  req.flash('success', 'Mitra perusahaan berhasil ditambahkan.');
  res.redirect('/admin/partners');
}));

app.put('/admin/partners/:id', requireAuth, uploadPartner.single('logo'), h(async (req, res) => {
  const item = await db.Partners.find(req.params.id);
  if (!item) { req.flash('error', 'Mitra tidak ditemukan.'); return res.redirect('/admin/partners'); }
  const { name, description, url } = req.body;
  let logo = null;
  if (req.file) {
    removeFileIfLocal(item.logo);
    logo = `/uploads/partners/${req.file.filename}`;
  }
  await db.Partners.update(req.params.id, { name, description, url, logo });
  req.flash('success', 'Data mitra diperbarui.');
  res.redirect('/admin/partners');
}));

app.delete('/admin/partners/:id', requireAuth, h(async (req, res) => {
  const item = await db.Partners.find(req.params.id);
  if (item) removeFileIfLocal(item.logo);
  await db.Partners.remove(req.params.id);
  req.flash('success', 'Mitra dihapus.');
  res.redirect('/admin/partners');
}));

// =====================================================================
// ADMIN: MESSAGES (pesan dari form kontak)
// =====================================================================
app.get('/admin/messages', requireAuth, h(async (req, res) => {
  await db.Messages.markAllRead();
  res.render('admin/messages', { title: 'Pesan Masuk', messages: await db.Messages.all() });
}));

app.delete('/admin/messages/:id', requireAuth, h(async (req, res) => {
  await db.Messages.remove(req.params.id);
  req.flash('success', 'Pesan dihapus.');
  res.redirect('/admin/messages');
}));

// =====================================================================
// ADMIN: KONSULTASI (balas chat klien)
// =====================================================================
app.get('/admin/konsultasi', requireAuth, h(async (req, res) => {
  res.render('admin/consultations', { title: 'Konsultasi Klien', threads: await db.Consultations.all() });
}));

app.get('/admin/konsultasi/:id', requireAuth, h(async (req, res) => {
  const thread = await db.Consultations.find(req.params.id);
  if (!thread) { req.flash('error', 'Percakapan tidak ditemukan.'); return res.redirect('/admin/konsultasi'); }
  await db.Consultations.markAdminRead(thread.id);
  const messages = await db.Consultations.messages(thread.id);
  res.render('admin/consultation-detail', { title: 'Detail Konsultasi', thread, messages });
}));

app.post('/admin/konsultasi/:id/balas', requireAuth, h(async (req, res) => {
  const { message } = req.body;
  if (message && message.trim()) {
    await db.Consultations.addMessage(req.params.id, 'admin', message.trim());
  }
  res.redirect(`/admin/konsultasi/${req.params.id}`);
}));

app.post('/admin/konsultasi/:id/tutup', requireAuth, h(async (req, res) => {
  await db.Consultations.close(req.params.id);
  req.flash('success', 'Percakapan ditandai selesai.');
  res.redirect('/admin/konsultasi');
}));

// =====================================================================
// ADMIN: AJUKAN KASUS (tinjau kasus yang masuk dari klien)
// =====================================================================
app.get('/admin/kasus', requireAuth, h(async (req, res) => {
  res.render('admin/cases', { title: 'Pengajuan Kasus', cases: await db.Cases.all() });
}));

app.post('/admin/kasus/:id/status', requireAuth, h(async (req, res) => {
  const { status, adminNote } = req.body;
  await db.Cases.updateStatus(req.params.id, status, adminNote);
  req.flash('success', 'Status kasus diperbarui.');
  res.redirect('/admin/kasus');
}));

app.delete('/admin/kasus/:id', requireAuth, h(async (req, res) => {
  await db.Cases.remove(req.params.id);
  req.flash('success', 'Pengajuan kasus dihapus.');
  res.redirect('/admin/kasus');
}));

// =====================================================================
// ADMIN: SETTINGS (info kantor, sosial media, password)
// =====================================================================
app.get('/admin/settings', requireAuth, (req, res) => {
  res.render('admin/settings', { title: 'Pengaturan' });
});

app.post('/admin/settings', requireAuth, uploadHero.fields([{ name: 'heroImage', maxCount: 1 }, { name: 'aboutImage', maxCount: 1 }]), h(async (req, res) => {
  const {
    officeName, shortName, tagline, heroTitle, heroSubtitle,
    aboutText, visionText, missionText,
    phone, phoneDisplay, whatsapp, email, address, operationalHours,
    instagram, tiktok, facebook, mapEmbedUrl, mapUrl,
    totalCasesHandled, statsYear, ongoingCases
  } = req.body;
  const update = {
    officeName, shortName, tagline, heroTitle, heroSubtitle,
    aboutText, visionText, missionText,
    phone, phoneDisplay, whatsapp, email, address, operationalHours,
    instagram, tiktok, facebook, mapEmbedUrl, mapUrl,
    totalCasesHandled: parseInt(totalCasesHandled) || 0,
    statsYear: parseInt(statsYear) || new Date().getFullYear(),
    ongoingCases: parseInt(ongoingCases) || 0
  };
  const current = await db.Settings.get();
  if (req.files && req.files.heroImage && req.files.heroImage[0]) {
    removeFileIfLocal(current.heroImage);
    update.heroImage = `/uploads/hero/${req.files.heroImage[0].filename}`;
  }
  if (req.files && req.files.aboutImage && req.files.aboutImage[0]) {
    removeFileIfLocal(current.aboutImage);
    update.aboutImage = `/uploads/hero/${req.files.aboutImage[0].filename}`;
  }
  await db.Settings.update(update);
  req.flash('success', 'Pengaturan berhasil disimpan.');
  res.redirect('/admin/settings');
}));

app.post('/admin/settings/password', requireAuth, h(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const admin = await db.Admin.get();
  if (!bcrypt.compareSync(currentPassword || '', admin.passwordHash)) {
    req.flash('error', 'Password saat ini salah.');
    return res.redirect('/admin/settings');
  }
  if (!newPassword || newPassword.length < 6) {
    req.flash('error', 'Password baru minimal 6 karakter.');
    return res.redirect('/admin/settings');
  }
  if (newPassword !== confirmPassword) {
    req.flash('error', 'Konfirmasi password baru tidak sama.');
    return res.redirect('/admin/settings');
  }
  await db.Admin.updatePassword(bcrypt.hashSync(newPassword, 10));
  req.flash('success', 'Password berhasil diganti.');
  res.redirect('/admin/settings');
}));

// ---- Error / 404 handling ----
app.use((req, res) => {
  res.status(404).render('404', { title: 'Halaman Tidak Ditemukan' });
});

app.use((err, req, res, next) => {
  console.error(err);
  let message = err.message || 'Terjadi kesalahan.';
  if (err.code === 'LIMIT_FILE_SIZE') {
    message = 'Ukuran file terlalu besar. Maksimal 300MB untuk video dan 6MB untuk foto.';
  }
  if (req.originalUrl.startsWith('/admin')) {
    req.flash('error', message);
    return res.redirect('back');
  }
  res.status(500).send('Terjadi kesalahan pada server.');
});

// ---- Start server only after the database is ready ----
db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Nomad Law Firm website berjalan di http://localhost:${PORT}`);
      console.log(`Admin panel: http://localhost:${PORT}/admin/login`);
    });
  })
  .catch((err) => {
    console.error('==================================================');
    console.error(' Gagal terhubung ke database MySQL.');
    console.error(' Pastikan DB_HOST, DB_USER, DB_PASSWORD, DB_NAME di .env sudah benar');
    console.error(' dan database MySQL-nya sudah aktif/dibuat.');
    console.error('==================================================');
    console.error(err.message);
    process.exit(1);
  });
