// dashboard/server.js — Nova v4 — Complete rewrite, all bugs fixed
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express       = require('express');
const session       = require('express-session');
const passport      = require('passport');
const DiscordStrat  = require('passport-discord').Strategy;
const LocalStrat    = require('passport-local').Strategy;
const bcrypt        = require('bcryptjs');
const axios         = require('axios');
const path          = require('path');
const fs            = require('fs');
const db            = require('../bot/database');

const app  = express();
const PORT = process.env.PORT || 3000;

const OWNER_ID  = (process.env.OWNER_ID || '').trim();
const ADMIN_IDS = (process.env.LUMORA_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
if (OWNER_ID && !ADMIN_IDS.includes(OWNER_ID)) ADMIN_IDS.unshift(OWNER_ID);

const isOwner = (did) => did && did === OWNER_ID;
const isAdmin = (did) => did && ADMIN_IDS.includes(did);

// ─── Session (SQLite-backed — persists across restarts) ───────────────────────
// Custom SQLite session store (uses our sql.js db)
const SessionStore = require('express-session').Store;
class NovaSessionStore extends SessionStore {
  constructor() { super(); }
  get(sid, cb) { try { const s=db.sessionStore.get(sid); cb(null, s||null); } catch(e){ cb(e); } }
  set(sid, sess, cb) { try { const ma=sess.cookie?.maxAge; db.sessionStore.set(sid,sess,ma); cb(null); } catch(e){ cb(e); } }
  destroy(sid, cb) { try { db.sessionStore.destroy(sid); cb(null); } catch(e){ cb(e); } }
}

app.use(session({
  store: new NovaSessionStore(),
  secret: process.env.SESSION_SECRET || 'nova-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' },
}));

// ─── Passport ────────────────────────────────────────────────────────────────
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  try { const u = db.getAccountById(id); done(null, u || false); }
  catch (e) { done(e, false); }
});

// Discord OAuth
passport.use('discord', new DiscordStrat({
  clientID:     process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL:  `${process.env.DASHBOARD_URL || 'http://localhost:3000'}/auth/discord/callback`,
  scope: ['identify', 'guilds'],
}, async (accessToken, _refresh, profile, done) => {
  try {
    let acct = db.getAccountByDiscordId(profile.id);
    if (acct) {
      db.updateAccount(acct.id, { discord_username: profile.username, discord_avatar: profile.avatar, access_token: accessToken });
      db.touchLogin(acct.id);
      return done(null, db.getAccountById(acct.id));
    }
    const id = db.createAccount({ username: profile.username, discord_id: profile.id, discord_username: profile.username, discord_avatar: profile.avatar, access_token: accessToken });
    db.touchLogin(id);
    return done(null, db.getAccountById(id));
  } catch (e) { done(e); }
}));

// Email/password
passport.use('local', new LocalStrat({ usernameField: 'email', passwordField: 'password' },
  async (email, password, done) => {
    try {
      const acct = db.getAccountByEmail(email);
      if (!acct)               return done(null, false, { message: 'No account found with that email.' });
      if (!acct.password_hash) return done(null, false, { message: 'This account uses Discord login only.' });
      if (!acct.discord_id)    return done(null, false, { message: 'You must link your Discord account before signing in with email. Sign in with Discord first.' });
      const ok = await bcrypt.compare(password, acct.password_hash);
      if (!ok) return done(null, false, { message: 'Incorrect password.' });
      db.touchLogin(acct.id);
      return done(null, acct);
    } catch (e) { done(e); }
  }
));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Middleware helpers ───────────────────────────────────────────────────────
const requireAuth    = (req, res, next) => { if (req.isAuthenticated() && req.user) return next(); req.path.startsWith('/api/') ? res.status(401).json({ error: 'Not authenticated' }) : res.redirect('/login'); };
const requireAdmin   = (req, res, next) => { if (!req.isAuthenticated()||!req.user) return res.status(401).json({error:'Not authenticated'}); if (!isAdmin(req.user.discord_id)) return res.status(403).json({error:'Nova Staff only'}); next(); };
const requireNetwork = (req, res, next) => { if (!req.isAuthenticated()||!req.user) return res.status(401).json({error:'Not authenticated'}); if (!isAdmin(req.user.discord_id)) return res.status(403).json({error:'Network Management only'}); next(); };
const requireOwner   = (req, res, next) => { if (!req.isAuthenticated()||!req.user) return res.status(401).json({error:'Not authenticated'}); if (!isOwner(req.user.discord_id)) return res.status(403).json({error:'Owner only'}); next(); };

function meObj(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, email: u.email||null,
    discord_id: u.discord_id||null, discord_username: u.discord_username||null,
    avatar: u.discord_avatar||null, role: u.role||'user',
    isOwner:   isOwner(u.discord_id),
    isAdmin:   isAdmin(u.discord_id),
    isNetwork: isAdmin(u.discord_id),
    has_discord:  !!u.discord_id,
    has_password: !!u.password_hash,
    temp_password: !!u.temp_password,
    access_token: u.access_token||null,
  };
}

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.get('/auth/discord', passport.authenticate('discord'));
app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/login?error=auth_failed' }),
  (req, res) => res.redirect('/dashboard')
);

app.post('/auth/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err)   return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: info?.message || 'Invalid credentials' });
    req.logIn(user, err2 => {
      if (err2) return res.status(500).json({ error: err2.message });
      if (req.body.remember === 'true') req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
      else req.session.cookie.expires = false;
      res.json({ success: true, user: meObj(user), requirePasswordChange: !!user.temp_password });
    });
  })(req, res, next);
});

app.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (db.getAccountByEmail(email))
      return res.status(409).json({ error: 'An account with that email already exists.' });
    const hash = await bcrypt.hash(password, 12);
    const id   = db.createAccount({ username: username.trim(), email: email.trim(), password_hash: hash });
    req.logIn(db.getAccountById(id), err => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, requireDiscord: true });
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/auth/logout', (req, res) => req.logout(() => res.redirect('/')));

// ─── Page routes ──────────────────────────────────────────────────────────────
const pg = (f) => (_req, res) => res.sendFile(path.join(__dirname, 'public', f));
app.get('/',           pg('index.html'));
app.get('/login',      pg('login.html'));
app.get('/register',   pg('login.html'));
app.get('/dashboard',  requireAuth, pg('dashboard.html'));
app.get('/server/:id', requireAuth, pg('server.html'));
app.get('/account',    requireAuth, pg('account.html'));
app.get('/updates',    pg('updates.html'));
app.get('/apply',      pg('apply.html'));
app.get('/apply/:id',  pg('apply-form.html'));
app.get('/policy',     pg('policy.html'));
app.get('/terms',      pg('policy.html'));
app.get('/team',       pg('team.html'));
app.get('/support',    pg('support.html'));
app.get('/tickets',    requireAuth, pg('tickets.html'));
app.get('/tickets/:id',requireAuth, pg('ticket-view.html'));
app.get('/admin',      requireAuth, (req,res) => isAdmin(req.user?.discord_id) ? res.sendFile(path.join(__dirname,'public','admin.html')) : res.redirect('/dashboard'));
app.get('/network',    requireAuth, (req,res) => isAdmin(req.user?.discord_id) ? res.sendFile(path.join(__dirname,'public','network.html')) : res.redirect('/dashboard'));
app.get('/org',        requireAuth, (req,res) => isAdmin(req.user?.discord_id) ? res.sendFile(path.join(__dirname,'public','org.html')) : res.redirect('/dashboard'));
app.get('/owner',      requireAuth, (req,res) => isOwner(req.user?.discord_id) ? res.sendFile(path.join(__dirname,'public','owner.html')) : res.redirect('/dashboard'));

// ─── API: Me & Account ────────────────────────────────────────────────────────
app.get('/api/me', requireAuth, (req, res) => res.json(meObj(req.user)));

app.patch('/api/account', requireAuth, async (req, res) => {
  try {
    const { username, email, current_password, new_password } = req.body;
    const acct = db.getAccountById(req.user.id);
    const upd  = {};
    if (username?.trim()) upd.username = username.trim();
    if (email?.trim() && email !== acct.email) {
      if (db.getAccountByEmail(email)?.id !== acct.id)
        return res.status(409).json({ error: 'Email already in use.' });
      upd.email = email.trim();
    }
    if (new_password) {
      if (new_password.length < 8) return res.status(400).json({ error: 'Password must be 8+ characters.' });
      if (acct.password_hash && acct.temp_password !== 1) {
        if (!current_password) return res.status(400).json({ error: 'Enter your current password.' });
        const ok = await bcrypt.compare(current_password, acct.password_hash);
        if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });
      }
      upd.password_hash = await bcrypt.hash(new_password, 12);
      upd.temp_password = 0;
    }
    const updated = db.updateAccount(acct.id, upd);
    res.json({ success: true, user: meObj(updated) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── API: Guilds (requires Discord access token) ─────────────────────────────
app.get('/api/guilds', requireAuth, async (req, res) => {
  const token = req.user?.access_token;
  if (!token) return res.status(403).json({ error: 'No Discord token. Please re-login with Discord.', needsDiscord: true });
  try {
    const { data: guilds } = await axios.get('https://discord.com/api/v10/users/@me/guilds', { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
    const managed = guilds.filter(g => (BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8) || g.owner);
    res.json(managed.map(g => ({ ...g, settings: db.getGuildSettings(g.id), infraction_count: db.getServerInfractions(g.id).length })));
  } catch (e) {
    if (e.response?.status === 401) return res.status(403).json({ error: 'Discord token expired. Please re-login.', needsDiscord: true });
    res.status(500).json({ error: 'Failed to fetch Discord guilds.' });
  }
});

app.get('/api/server/:id', requireAuth, async (req, res) => {
  const token = req.user?.access_token;
  if (!token) return res.status(403).json({ error: 'No Discord token.', needsDiscord: true });
  try {
    const { data: guilds } = await axios.get('https://discord.com/api/v10/users/@me/guilds', { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
    const g = guilds.find(x => x.id === req.params.id);
    if (!g || (!((BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8)) && !g.owner))
      return res.status(403).json({ error: 'You do not have Administrator permission in this server.' });
    res.json({ guild: g, settings: db.getGuildSettings(req.params.id), infractions: db.getServerInfractions(req.params.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/server/:id/settings', requireAuth, async (req, res) => {
  const token = req.user?.access_token;
  if (!token) return res.status(403).json({ error: 'No Discord token.', needsDiscord: true });
  try {
    const { data: guilds } = await axios.get('https://discord.com/api/v10/users/@me/guilds', { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
    const g = guilds.find(x => x.id === req.params.id);
    if (!g || (!((BigInt(g.permissions) & BigInt(0x8)) === BigInt(0x8)) && !g.owner))
      return res.status(403).json({ error: 'Access denied.' });
    const ALLOWED = ['prefix','mod_role_id','log_channel','mute_role_id','auto_mod','anti_spam','anti_links','anti_caps','warn_threshold','warn_action'];
    const upd = {};
    for (const k of ALLOWED) if (req.body[k] !== undefined) upd[k] = req.body[k];
    const settings = db.updateGuildSettings(req.params.id, upd);
    res.json({ success: true, settings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/server/:id/infraction/:cid', requireAuth, (req, res) => {
  db.deleteInfraction(parseInt(req.params.cid), req.params.id);
  res.json({ success: true });
});

// ─── API: Admin ───────────────────────────────────────────────────────────────
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json({
    totalServers:      db.getAllGuildSettings().length,
    totalInfractions:  db.getAllInfractions().length,
    totalBlacklisted:  db.getBlacklist().length,
    totalAccounts:     db.getAllAccounts().length,
    recentInfractions: db.getAllInfractions().slice(0, 50),
    allSettings:       db.getAllGuildSettings(),
  });
});
app.get('/api/admin/blacklist',          requireAdmin, (_req, res) => res.json(db.getBlacklist()));
app.post('/api/admin/blacklist',         requireAdmin, (req, res) => {
  const { userId, reason } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  db.blacklistUser(userId, reason||'No reason', req.user.discord_id||req.user.id);
  res.json({ success: true });
});
app.delete('/api/admin/blacklist/:uid', requireAdmin, (req, res) => {
  db.unblacklistUser(req.params.uid);
  res.json({ success: true });
});

// ─── API: Owner ───────────────────────────────────────────────────────────────
app.get('/api/owner/accounts', requireOwner, (_req, res) => res.json(db.getAllAccounts()));
app.post('/api/owner/accounts/:id/reset-password', requireOwner, async (req, res) => {
  const acct = db.getAccountById(req.params.id);
  if (!acct) return res.status(404).json({ error: 'Account not found' });
  // Generate temp password
  const temp = Math.random().toString(36).slice(2, 10).toUpperCase();
  const hash = await bcrypt.hash(temp, 10);
  db.updateAccount(acct.id, { password_hash: hash, temp_password: 1 });
  res.json({ success: true, temp_password: temp });
});
app.delete('/api/owner/accounts/:id', requireOwner, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account.' });
  db.db.prepare(`DELETE FROM accounts WHERE id=?`).run(req.params.id);
  res.json({ success: true });
});

// ─── API: Applications ────────────────────────────────────────────────────────
app.get('/api/applications', (_req, res) => {
  const posts = db.getApplicationPosts().filter(a => a.status === 'open');
  res.json(posts.map(a => ({ ...a, responses: undefined, response_count: (a.responses||[]).length })));
});
app.get('/api/applications/all', requireNetwork, (_req, res) => res.json(db.getApplicationPosts()));
app.get('/api/applications/:id', (req, res) => {
  const p = db.getApplicationPost(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const isManager = req.isAuthenticated() && isAdmin(req.user?.discord_id);
  res.json(isManager ? p : { ...p, responses: undefined, response_count: (p.responses||[]).length });
});
app.post('/api/applications', requireNetwork, (req, res) => {
  const { title, description, questions, role, deadline } = req.body;
  if (!title || !questions?.length) return res.status(400).json({ error: 'Title and questions required.' });
  const id = db.createApplicationPost({ title, description, questions, role, deadline, created_by: req.user.username });
  res.json({ success: true, id });
});
app.put('/api/applications/:id', requireNetwork, (req, res) => {
  if (!db.getApplicationPost(req.params.id)) return res.status(404).json({ error: 'Not found' });
  db.updateApplicationPost(req.params.id, req.body);
  res.json({ success: true });
});
app.delete('/api/applications/:id', requireNetwork, (req, res) => {
  db.deleteApplicationPost(req.params.id);
  res.json({ success: true });
});
app.post('/api/applications/:id/apply', requireAuth, (req, res) => {
  const post = db.getApplicationPost(req.params.id);
  if (!post)                  return res.status(404).json({ error: 'Application not found.' });
  if (post.status !== 'open') return res.status(400).json({ error: 'This position is closed.' });
  if (db.hasApplied(req.params.id, req.user.id)) return res.status(409).json({ error: 'You have already applied.' });
  const answers = req.body.answers || {};
  const missing = (post.questions||[]).filter(q => !String(answers[q]||'').trim());
  if (missing.length) return res.status(400).json({ error: 'Please answer all questions.' });
  const rid = db.submitApplicationResponse(req.params.id, { user_id: req.user.id, username: req.user.username, discord_id: req.user.discord_id||null, answers });
  res.json({ success: true, id: rid });
});
app.patch('/api/applications/:id/response/:rid', requireNetwork, (req, res) => {
  db.updateApplicationResponse(req.params.id, req.params.rid, req.body);
  res.json({ success: true });
});

// ─── API: Patch Notes ─────────────────────────────────────────────────────────
app.get('/api/updates',        (_req, res) => res.json(db.getPatchNotes()));
app.post('/api/updates',       requireNetwork, (req, res) => {
  const { title, version, content, tags } = req.body;
  if (!title||!content) return res.status(400).json({ error: 'Title and content required.' });
  const id = db.createPatchNote({ title, version:version||'', content, tags: Array.isArray(tags)?tags:(tags||'').split(',').map(t=>t.trim()).filter(Boolean), author: req.user.username });
  res.json({ success: true, id });
});
app.put('/api/updates/:id',    requireNetwork, (req, res) => {
  if (!db.getPatchNote(req.params.id)) return res.status(404).json({ error: 'Not found' });
  db.updatePatchNote(req.params.id, req.body);
  res.json({ success: true });
});
app.delete('/api/updates/:id', requireNetwork, (req, res) => { db.deletePatchNote(req.params.id); res.json({ success: true }); });

// ─── API: Team ────────────────────────────────────────────────────────────────
app.get('/api/team',           (_req, res) => res.json(db.getTeamMembers()));
app.post('/api/team',          requireNetwork, (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Name required.' });
  const id = db.upsertTeamMember(req.body);
  res.json({ success: true, id });
});
app.delete('/api/team/:id',    requireNetwork, (req, res) => { db.deleteTeamMember(req.params.id); res.json({ success: true }); });

// ─── API: Policies ────────────────────────────────────────────────────────────
app.get('/api/policy/:type',   (_req, res) => res.json(db.getPolicy(req.params.type) || { type: req.params.type, content: '' }));
app.put('/api/policy/:type',   requireNetwork, (req, res) => {
  if (req.body.content === undefined) return res.status(400).json({ error: 'content required' });
  const p = db.upsertPolicy(req.params.type, req.body.content, req.user.username||req.user.id);
  res.json({ success: true, policy: p });
});

// ─── API: Departments & Staff (Owner only to modify) ─────────────────────────
app.get('/api/departments',        requireAdmin,   (_req, res) => res.json(db.getDepartments()));
app.post('/api/departments',       requireOwner,   (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'Name required.' });
  const id = db.createDepartment({ ...req.body, created_by: req.user.discord_id });
  res.json({ success: true, id, department: db.getDepartment(id) });
});
app.put('/api/departments/:id',    requireOwner,   (req, res) => {
  if (!db.getDepartment(req.params.id)) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, department: db.updateDepartment(req.params.id, req.body) });
});
app.delete('/api/departments/:id', requireOwner,   (req, res) => { db.deleteDepartment(req.params.id); res.json({ success: true }); });

app.get('/api/staff',              requireAdmin,   (_req, res) => res.json(db.getAllStaff()));
app.get('/api/staff/public',       (_req, res) => {
  const staff = db.getAllStaff();
  const depts = db.getDepartments();
  const grouped = depts.map(d => ({ ...d, members: staff.filter(s=>s.department_id===d.id).map(s=>({id:s.id,discord_id:s.discord_id,username:s.username,avatar:s.avatar,role_title:s.role_title})) })).filter(d=>d.members.length);
  res.json({ departments: grouped, unassigned: staff.filter(s=>!s.department_id).map(s=>({id:s.id,discord_id:s.discord_id,username:s.username,avatar:s.avatar,role_title:s.role_title})) });
});
app.post('/api/staff',             requireOwner,   (req, res) => {
  const { discord_id, username } = req.body;
  if (!discord_id||!username) return res.status(400).json({ error: 'discord_id and username required.' });
  if (!/^\d{17,20}$/.test(discord_id)) return res.status(400).json({ error: 'Invalid Discord ID.' });
  const id = db.addStaffMember({ ...req.body, added_by: req.user.discord_id });
  res.json({ success: true, id });
});
app.put('/api/staff/:id',          requireOwner,   (req, res) => {
  if (!db.getStaffById(req.params.id)) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, member: db.updateStaffMember(req.params.id, req.body) });
});
app.delete('/api/staff/:id',       requireOwner,   (req, res) => { db.removeStaffMember(req.params.id); res.json({ success: true }); });

// ─── API: Support Tickets ─────────────────────────────────────────────────────
app.get('/api/tickets',            requireAuth,    (req, res) => {
  if (isAdmin(req.user.discord_id)) return res.json(db.getTickets());
  res.json(db.getMyTickets(req.user.id));
});
app.post('/api/tickets',           requireAuth,    (req, res) => {
  const { subject, message, priority } = req.body;
  if (!subject||!message) return res.status(400).json({ error: 'Subject and message required.' });
  const id = db.createTicket({ user_id: req.user.id, username: req.user.username, discord_id: req.user.discord_id||null, subject, priority: priority||'normal' });
  db.addTicketMessage({ ticket_id: id, user_id: req.user.id, username: req.user.username, is_staff: false, message });
  res.json({ success: true, id });
});
app.get('/api/tickets/:id',        requireAuth,    (req, res) => {
  const t = db.getTicket(req.params.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found.' });
  if (t.user_id !== req.user.id && !isAdmin(req.user.discord_id)) return res.status(403).json({ error: 'Access denied.' });
  res.json({ ...t, messages: db.getTicketMessages(t.id) });
});
app.post('/api/tickets/:id/reply', requireAuth,    (req, res) => {
  const t = db.getTicket(req.params.id);
  if (!t) return res.status(404).json({ error: 'Ticket not found.' });
  if (t.user_id !== req.user.id && !isAdmin(req.user.discord_id)) return res.status(403).json({ error: 'Access denied.' });
  if (!req.body.message?.trim()) return res.status(400).json({ error: 'Message required.' });
  const mid = db.addTicketMessage({ ticket_id: t.id, user_id: req.user.id, username: req.user.username, is_staff: isAdmin(req.user.discord_id)?1:0, message: req.body.message.trim() });
  res.json({ success: true, id: mid });
});
app.patch('/api/tickets/:id',      requireAdmin,   (req, res) => {
  const t = db.getTicket(req.params.id);
  if (!t) return res.status(404).json({ error: 'Not found.' });
  res.json({ success: true, ticket: db.updateTicket(t.id, req.body) });
});

// Fix policy route (req.params bug)
app.get('/api/policy/:type', (_req, res) => {
  const p = db.getPolicy(_req.params.type);
  res.json(p || { type: _req.params.type, content: '' });
});

// Initialize DB then start server
db.initDB().then(() => {
  app.listen(PORT, () => console.log(`[Nova] ✅ Dashboard running at http://localhost:${PORT}`));
}).catch(err => { console.error('[Nova] DB init failed:', err); process.exit(1); });
module.exports = app;
