// bot/database.js — Nova v4 — SQLite via better-sqlite3 (real persistence)
'use strict';
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const { v4: uuid } = require('uuid');

// Ensure data directory exists
const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/nova.db');
const dbDir  = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id       TEXT PRIMARY KEY,
    prefix         TEXT NOT NULL DEFAULT '!',
    mod_role_id    TEXT,
    log_channel    TEXT,
    mute_role_id   TEXT,
    auto_mod       INTEGER NOT NULL DEFAULT 0,
    anti_spam      INTEGER NOT NULL DEFAULT 0,
    anti_links     INTEGER NOT NULL DEFAULT 0,
    anti_caps      INTEGER NOT NULL DEFAULT 0,
    caps_threshold INTEGER NOT NULL DEFAULT 70,
    warn_threshold INTEGER NOT NULL DEFAULT 3,
    warn_action    TEXT NOT NULL DEFAULT 'mute',
    updated_at     INTEGER
  );

  CREATE TABLE IF NOT EXISTS infractions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    type         TEXT NOT NULL,
    reason       TEXT,
    duration     INTEGER,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    expires_at   INTEGER
  );

  CREATE TABLE IF NOT EXISTS blacklist (
    user_id   TEXT PRIMARY KEY,
    reason    TEXT,
    added_by  TEXT NOT NULL,
    added_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    active    INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS temp_punishments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    type       TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    role_id    TEXT
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id               TEXT PRIMARY KEY,
    username         TEXT NOT NULL,
    email            TEXT UNIQUE,
    password_hash    TEXT,
    discord_id       TEXT UNIQUE,
    discord_username TEXT,
    discord_avatar   TEXT,
    access_token     TEXT,
    role             TEXT NOT NULL DEFAULT 'user',
    temp_password    INTEGER DEFAULT 0,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at       INTEGER,
    last_login       INTEGER
  );

  CREATE TABLE IF NOT EXISTS applications (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT,
    role        TEXT,
    questions   TEXT NOT NULL DEFAULT '[]',
    deadline    TEXT,
    status      TEXT NOT NULL DEFAULT 'open',
    created_by  TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS application_responses (
    id           TEXT PRIMARY KEY,
    app_id       TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL,
    username     TEXT,
    discord_id   TEXT,
    answers      TEXT NOT NULL DEFAULT '{}',
    status       TEXT NOT NULL DEFAULT 'pending',
    submitted_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(app_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS patch_notes (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    version    TEXT,
    content    TEXT NOT NULL,
    tags       TEXT NOT NULL DEFAULT '[]',
    author     TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    role       TEXT,
    bio        TEXT,
    discord_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS policies (
    type       TEXT PRIMARY KEY,
    content    TEXT NOT NULL DEFAULT '',
    updated_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS departments (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    color       TEXT NOT NULL DEFAULT '#6c63ff',
    created_by  TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS staff_members (
    id            TEXT PRIMARY KEY,
    discord_id    TEXT NOT NULL UNIQUE,
    username      TEXT NOT NULL,
    avatar        TEXT,
    department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
    role_title    TEXT NOT NULL DEFAULT 'Staff',
    permissions   TEXT NOT NULL DEFAULT '[]',
    added_by      TEXT NOT NULL,
    added_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at    INTEGER
  );

  CREATE TABLE IF NOT EXISTS support_tickets (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    username    TEXT NOT NULL,
    discord_id  TEXT,
    subject     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open',
    priority    TEXT NOT NULL DEFAULT 'normal',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS ticket_messages (
    id        TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id   TEXT NOT NULL,
    username  TEXT NOT NULL,
    is_staff  INTEGER NOT NULL DEFAULT 0,
    message   TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// ─── Guild Settings ───────────────────────────────────────────────────────────
const _getGS   = db.prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`);
const _upsertGS = db.prepare(`
  INSERT INTO guild_settings (guild_id, prefix, mod_role_id, log_channel, mute_role_id,
    auto_mod, anti_spam, anti_links, anti_caps, caps_threshold, warn_threshold, warn_action, updated_at)
  VALUES (@guild_id, @prefix, @mod_role_id, @log_channel, @mute_role_id,
    @auto_mod, @anti_spam, @anti_links, @anti_caps, @caps_threshold, @warn_threshold, @warn_action, unixepoch())
  ON CONFLICT(guild_id) DO UPDATE SET
    prefix=COALESCE(@prefix,prefix), mod_role_id=COALESCE(@mod_role_id,mod_role_id),
    log_channel=COALESCE(@log_channel,log_channel), mute_role_id=COALESCE(@mute_role_id,mute_role_id),
    auto_mod=COALESCE(@auto_mod,auto_mod), anti_spam=COALESCE(@anti_spam,anti_spam),
    anti_links=COALESCE(@anti_links,anti_links), anti_caps=COALESCE(@anti_caps,anti_caps),
    caps_threshold=COALESCE(@caps_threshold,caps_threshold),
    warn_threshold=COALESCE(@warn_threshold,warn_threshold),
    warn_action=COALESCE(@warn_action,warn_action), updated_at=unixepoch()
`);

function getGuildSettings(guildId) {
  return _getGS.get(guildId) || { guild_id: guildId, prefix: '!', auto_mod: 0, anti_spam: 0, anti_links: 0, anti_caps: 0, caps_threshold: 70, warn_threshold: 3, warn_action: 'mute' };
}
function updateGuildSettings(guildId, s) {
  const cur = getGuildSettings(guildId);
  _upsertGS.run({
    guild_id: guildId,
    prefix: s.prefix ?? cur.prefix,
    mod_role_id: s.mod_role_id !== undefined ? s.mod_role_id : cur.mod_role_id,
    log_channel: s.log_channel !== undefined ? s.log_channel : cur.log_channel,
    mute_role_id: s.mute_role_id !== undefined ? s.mute_role_id : cur.mute_role_id,
    auto_mod: s.auto_mod ?? cur.auto_mod,
    anti_spam: s.anti_spam ?? cur.anti_spam,
    anti_links: s.anti_links ?? cur.anti_links,
    anti_caps: s.anti_caps ?? cur.anti_caps,
    caps_threshold: s.caps_threshold ?? cur.caps_threshold,
    warn_threshold: s.warn_threshold ?? cur.warn_threshold,
    warn_action: s.warn_action ?? cur.warn_action,
  });
  return getGuildSettings(guildId);
}
function getAllGuildSettings() { return db.prepare(`SELECT * FROM guild_settings`).all(); }

// ─── Infractions ─────────────────────────────────────────────────────────────
const _addInf = db.prepare(`INSERT INTO infractions (guild_id,user_id,moderator_id,type,reason,duration,expires_at) VALUES (@guild_id,@user_id,@moderator_id,@type,@reason,@duration,@expires_at)`);
function addInfractionRecord(d) { return _addInf.run(d).lastInsertRowid; }
function getUserInfractions(guildId, userId) { return db.prepare(`SELECT * FROM infractions WHERE guild_id=? AND user_id=? ORDER BY created_at DESC`).all(guildId, userId); }
function getServerInfractions(guildId) { return db.prepare(`SELECT * FROM infractions WHERE guild_id=? ORDER BY created_at DESC LIMIT 200`).all(guildId); }
function getAllInfractions() { return db.prepare(`SELECT * FROM infractions ORDER BY created_at DESC LIMIT 500`).all(); }
function getWarnCount(guildId, userId) { return db.prepare(`SELECT COUNT(*) as c FROM infractions WHERE guild_id=? AND user_id=? AND type='warn' AND active=1`).get(guildId, userId).c; }
function clearWarnings(guildId, userId) { db.prepare(`UPDATE infractions SET active=0 WHERE guild_id=? AND user_id=? AND type='warn'`).run(guildId, userId); }
function deleteInfraction(id, guildId) { db.prepare(`UPDATE infractions SET active=0 WHERE id=? AND guild_id=?`).run(id, guildId); }

// ─── Blacklist ────────────────────────────────────────────────────────────────
function blacklistUser(userId, reason, addedBy) {
  db.prepare(`INSERT INTO blacklist(user_id,reason,added_by) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET reason=?,added_by=?,active=1,added_at=unixepoch()`).run(userId,reason,addedBy,reason,addedBy);
}
function unblacklistUser(userId) { db.prepare(`UPDATE blacklist SET active=0 WHERE user_id=?`).run(userId); }
function checkBlacklist(userId) { return db.prepare(`SELECT * FROM blacklist WHERE user_id=? AND active=1`).get(userId) || null; }
function getBlacklist() { return db.prepare(`SELECT * FROM blacklist WHERE active=1 ORDER BY added_at DESC`).all(); }

// ─── Temp Punishments ─────────────────────────────────────────────────────────
function addTempPunishment(d) { db.prepare(`INSERT INTO temp_punishments(guild_id,user_id,type,expires_at,role_id) VALUES(?,?,?,?,?)`).run(d.guild_id,d.user_id,d.type,d.expires_at,d.role_id||null); }
function getExpiredPunishments() { return db.prepare(`SELECT * FROM temp_punishments WHERE expires_at<=unixepoch()`).all(); }
function removeTempPunishment(id) { db.prepare(`DELETE FROM temp_punishments WHERE id=?`).run(id); }
function getTempByUser(guildId, userId, type) { return db.prepare(`SELECT * FROM temp_punishments WHERE guild_id=? AND user_id=? AND type=?`).get(guildId,userId,type); }

// ─── Accounts ────────────────────────────────────────────────────────────────
function createAccount(d) {
  const id = uuid();
  db.prepare(`INSERT INTO accounts(id,username,email,password_hash,discord_id,discord_username,discord_avatar,access_token,role) VALUES(?,?,?,?,?,?,?,?,'user')`).run(id,d.username,d.email||null,d.password_hash||null,d.discord_id||null,d.discord_username||null,d.discord_avatar||null,d.access_token||null);
  return id;
}
function getAccountByEmail(email) { return email ? db.prepare(`SELECT * FROM accounts WHERE lower(email)=lower(?)`).get(email) : null; }
function getAccountByDiscordId(did) { return did ? db.prepare(`SELECT * FROM accounts WHERE discord_id=?`).get(did) : null; }
function getAccountById(id) { return id ? db.prepare(`SELECT * FROM accounts WHERE id=?`).get(id) : null; }
function updateAccount(id, d) {
  const sets = Object.entries(d).map(([k]) => `${k}=@${k}`).join(', ');
  if (!sets) return getAccountById(id);
  db.prepare(`UPDATE accounts SET ${sets}, updated_at=unixepoch() WHERE id=@id`).run({ ...d, id });
  return getAccountById(id);
}
function getAllAccounts() { return db.prepare(`SELECT id,username,email,discord_id,discord_username,discord_avatar,role,temp_password,created_at,last_login FROM accounts ORDER BY created_at DESC`).all(); }
function touchLogin(id) { db.prepare(`UPDATE accounts SET last_login=unixepoch() WHERE id=?`).run(id); }

// ─── Applications ─────────────────────────────────────────────────────────────
function createApplicationPost(d) {
  const id = uuid();
  db.prepare(`INSERT INTO applications(id,title,description,role,questions,deadline,status,created_by) VALUES(?,?,?,?,?,?,?,?)`).run(id,d.title,d.description||null,d.role||null,JSON.stringify(d.questions||[]),d.deadline||null,d.status||'open',d.created_by||null);
  return id;
}
function getApplicationPosts() {
  const apps = db.prepare(`SELECT * FROM applications ORDER BY created_at DESC`).all();
  return apps.map(a => ({ ...a, questions: JSON.parse(a.questions||'[]'), responses: getAppResponses(a.id) }));
}
function getApplicationPost(id) {
  const a = db.prepare(`SELECT * FROM applications WHERE id=?`).get(id);
  if (!a) return null;
  return { ...a, questions: JSON.parse(a.questions||'[]'), responses: getAppResponses(id) };
}
function getAppResponses(appId) {
  const rows = db.prepare(`SELECT * FROM application_responses WHERE app_id=? ORDER BY submitted_at ASC`).all(appId);
  return rows.map(r => ({ ...r, answers: JSON.parse(r.answers||'{}') }));
}
function updateApplicationPost(id, d) {
  const sets = [];
  const params = { id };
  if (d.title !== undefined)       { sets.push('title=@title');             params.title       = d.title; }
  if (d.description !== undefined) { sets.push('description=@description'); params.description = d.description; }
  if (d.role !== undefined)        { sets.push('role=@role');               params.role        = d.role; }
  if (d.questions !== undefined)   { sets.push('questions=@questions');     params.questions   = JSON.stringify(d.questions); }
  if (d.deadline !== undefined)    { sets.push('deadline=@deadline');       params.deadline    = d.deadline; }
  if (d.status !== undefined)      { sets.push('status=@status');           params.status      = d.status; }
  if (sets.length) db.prepare(`UPDATE applications SET ${sets.join(',')},updated_at=unixepoch() WHERE id=@id`).run(params);
}
function deleteApplicationPost(id) { db.prepare(`DELETE FROM applications WHERE id=?`).run(id); }
function submitApplicationResponse(appId, d) {
  const id = uuid();
  db.prepare(`INSERT INTO application_responses(id,app_id,user_id,username,discord_id,answers) VALUES(?,?,?,?,?,?)`).run(id,appId,d.user_id,d.username||null,d.discord_id||null,JSON.stringify(d.answers||{}));
  return id;
}
function updateApplicationResponse(appId, responseId, d) {
  if (d.status) db.prepare(`UPDATE application_responses SET status=? WHERE id=? AND app_id=?`).run(d.status,responseId,appId);
}
function hasApplied(appId, userId) { return !!db.prepare(`SELECT id FROM application_responses WHERE app_id=? AND user_id=?`).get(appId,userId); }

// ─── Patch Notes ──────────────────────────────────────────────────────────────
function createPatchNote(d) {
  const id = uuid();
  db.prepare(`INSERT INTO patch_notes(id,title,version,content,tags,author) VALUES(?,?,?,?,?,?)`).run(id,d.title,d.version||null,d.content,JSON.stringify(d.tags||[]),d.author||null);
  return id;
}
function getPatchNotes() {
  return db.prepare(`SELECT * FROM patch_notes ORDER BY created_at DESC`).all().map(n=>({...n,tags:JSON.parse(n.tags||'[]')}));
}
function getPatchNote(id) { const n=db.prepare(`SELECT * FROM patch_notes WHERE id=?`).get(id); return n?{...n,tags:JSON.parse(n.tags||'[]')}:null; }
function updatePatchNote(id, d) {
  const sets=[]; const p={id};
  if(d.title!==undefined){sets.push('title=@title');p.title=d.title;}
  if(d.version!==undefined){sets.push('version=@version');p.version=d.version;}
  if(d.content!==undefined){sets.push('content=@content');p.content=d.content;}
  if(d.tags!==undefined){sets.push('tags=@tags');p.tags=JSON.stringify(d.tags);}
  if(sets.length) db.prepare(`UPDATE patch_notes SET ${sets.join(',')},updated_at=unixepoch() WHERE id=@id`).run(p);
}
function deletePatchNote(id) { db.prepare(`DELETE FROM patch_notes WHERE id=?`).run(id); }

// ─── Team ─────────────────────────────────────────────────────────────────────
function getTeamMembers() { return db.prepare(`SELECT * FROM team_members ORDER BY sort_order ASC, created_at ASC`).all(); }
function upsertTeamMember(d) {
  if (d.id && db.prepare(`SELECT id FROM team_members WHERE id=?`).get(d.id)) {
    db.prepare(`UPDATE team_members SET name=?,role=?,bio=?,discord_id=?,sort_order=? WHERE id=?`).run(d.name,d.role||null,d.bio||null,d.discord_id||null,d.sort_order||0,d.id);
    return d.id;
  }
  const id = uuid();
  db.prepare(`INSERT INTO team_members(id,name,role,bio,discord_id,sort_order) VALUES(?,?,?,?,?,?)`).run(id,d.name,d.role||null,d.bio||null,d.discord_id||null,d.sort_order||0);
  return id;
}
function deleteTeamMember(id) { db.prepare(`DELETE FROM team_members WHERE id=?`).run(id); }

// ─── Policies ────────────────────────────────────────────────────────────────
function getPolicy(type) { return db.prepare(`SELECT * FROM policies WHERE type=?`).get(type) || null; }
function upsertPolicy(type, content, updatedBy) {
  db.prepare(`INSERT INTO policies(type,content,updated_by) VALUES(?,?,?) ON CONFLICT(type) DO UPDATE SET content=?,updated_by=?,updated_at=unixepoch()`).run(type,content,updatedBy,content,updatedBy);
  return getPolicy(type);
}

// ─── Departments ──────────────────────────────────────────────────────────────
function getDepartments() { return db.prepare(`SELECT * FROM departments ORDER BY created_at ASC`).all(); }
function getDepartment(id) { return db.prepare(`SELECT * FROM departments WHERE id=?`).get(id)||null; }
function createDepartment(d) {
  const id = uuid();
  db.prepare(`INSERT INTO departments(id,name,description,color,created_by) VALUES(?,?,?,?,?)`).run(id,d.name,d.description||null,d.color||'#6c63ff',d.created_by||null);
  return id;
}
function updateDepartment(id, d) {
  const sets=[]; const p={id};
  if(d.name!==undefined){sets.push('name=@name');p.name=d.name;}
  if(d.description!==undefined){sets.push('description=@description');p.description=d.description;}
  if(d.color!==undefined){sets.push('color=@color');p.color=d.color;}
  if(sets.length) db.prepare(`UPDATE departments SET ${sets.join(',')} WHERE id=@id`).run(p);
  return getDepartment(id);
}
function deleteDepartment(id) {
  db.prepare(`UPDATE staff_members SET department_id=NULL WHERE department_id=?`).run(id);
  db.prepare(`DELETE FROM departments WHERE id=?`).run(id);
}

// ─── Staff Members ────────────────────────────────────────────────────────────
function _enrichStaff(rows) {
  const depts = getDepartments();
  return rows.map(m => ({ ...m, permissions: JSON.parse(m.permissions||'[]'), department: depts.find(d=>d.id===m.department_id)||null }));
}
function getAllStaff() { return _enrichStaff(db.prepare(`SELECT * FROM staff_members ORDER BY added_at ASC`).all()); }
function getStaffMember(discordId) { const r=db.prepare(`SELECT * FROM staff_members WHERE discord_id=?`).get(discordId); return r?_enrichStaff([r])[0]:null; }
function getStaffById(id) { const r=db.prepare(`SELECT * FROM staff_members WHERE id=?`).get(id); return r?_enrichStaff([r])[0]:null; }
function getStaffByDepartment(deptId) { return _enrichStaff(db.prepare(`SELECT * FROM staff_members WHERE department_id=?`).all(deptId)); }
function addStaffMember(d) {
  const existing = db.prepare(`SELECT id FROM staff_members WHERE discord_id=?`).get(d.discord_id);
  if (existing) {
    db.prepare(`UPDATE staff_members SET username=?,avatar=?,department_id=?,role_title=?,permissions=?,updated_at=unixepoch() WHERE discord_id=?`).run(d.username,d.avatar||null,d.department_id||null,d.role_title||'Staff',JSON.stringify(d.permissions||[]),d.discord_id);
    return existing.id;
  }
  const id = uuid();
  db.prepare(`INSERT INTO staff_members(id,discord_id,username,avatar,department_id,role_title,permissions,added_by) VALUES(?,?,?,?,?,?,?,?)`).run(id,d.discord_id,d.username,d.avatar||null,d.department_id||null,d.role_title||'Staff',JSON.stringify(d.permissions||[]),d.added_by||'owner');
  return id;
}
function updateStaffMember(id, d) {
  const sets=[]; const p={id};
  if(d.username!==undefined){sets.push('username=@username');p.username=d.username;}
  if(d.avatar!==undefined){sets.push('avatar=@avatar');p.avatar=d.avatar;}
  if(d.department_id!==undefined){sets.push('department_id=@department_id');p.department_id=d.department_id||null;}
  if(d.role_title!==undefined){sets.push('role_title=@role_title');p.role_title=d.role_title;}
  if(d.permissions!==undefined){sets.push('permissions=@permissions');p.permissions=JSON.stringify(d.permissions);}
  if(sets.length) db.prepare(`UPDATE staff_members SET ${sets.join(',')},updated_at=unixepoch() WHERE id=@id`).run(p);
  return getStaffById(id);
}
function removeStaffMember(id) { db.prepare(`DELETE FROM staff_members WHERE id=?`).run(id); }
function isStaffMember(discordId) { return !!db.prepare(`SELECT id FROM staff_members WHERE discord_id=?`).get(discordId); }

// ─── Support Tickets ─────────────────────────────────────────────────────────
function createTicket(d) {
  const id = uuid();
  db.prepare(`INSERT INTO support_tickets(id,user_id,username,discord_id,subject,priority) VALUES(?,?,?,?,?,?)`).run(id,d.user_id,d.username,d.discord_id||null,d.subject,d.priority||'normal');
  return id;
}
function getTickets(status) {
  const q = status ? `SELECT * FROM support_tickets WHERE status=? ORDER BY created_at DESC` : `SELECT * FROM support_tickets ORDER BY created_at DESC`;
  return status ? db.prepare(q).all(status) : db.prepare(q).all();
}
function getTicket(id) { return db.prepare(`SELECT * FROM support_tickets WHERE id=?`).get(id)||null; }
function getMyTickets(userId) { return db.prepare(`SELECT * FROM support_tickets WHERE user_id=? ORDER BY created_at DESC`).all(userId); }
function updateTicket(id, d) {
  const sets=[]; const p={id};
  if(d.status!==undefined){sets.push('status=@status');p.status=d.status;}
  if(d.priority!==undefined){sets.push('priority=@priority');p.priority=d.priority;}
  if(sets.length) db.prepare(`UPDATE support_tickets SET ${sets.join(',')},updated_at=unixepoch() WHERE id=@id`).run(p);
  return getTicket(id);
}
function addTicketMessage(d) {
  const id = uuid();
  db.prepare(`INSERT INTO ticket_messages(id,ticket_id,user_id,username,is_staff,message) VALUES(?,?,?,?,?,?)`).run(id,d.ticket_id,d.user_id,d.username,d.is_staff?1:0,d.message);
  db.prepare(`UPDATE support_tickets SET updated_at=unixepoch() WHERE id=?`).run(d.ticket_id);
  return id;
}
function getTicketMessages(ticketId) { return db.prepare(`SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY created_at ASC`).all(ticketId); }

module.exports = {
  db,
  // guild
  getGuildSettings, updateGuildSettings, getAllGuildSettings,
  // infractions
  addInfractionRecord, getUserInfractions, getServerInfractions, getAllInfractions,
  getWarnCount, clearWarnings, deleteInfraction,
  // blacklist
  blacklistUser, unblacklistUser, checkBlacklist, getBlacklist,
  // temp
  addTempPunishment, getExpiredPunishments, removeTempPunishment, getTempByUser,
  // accounts
  createAccount, getAccountByEmail, getAccountByDiscordId, getAccountById,
  updateAccount, getAllAccounts, touchLogin,
  // applications
  createApplicationPost, getApplicationPosts, getApplicationPost,
  updateApplicationPost, deleteApplicationPost,
  submitApplicationResponse, updateApplicationResponse, hasApplied,
  // patch notes
  createPatchNote, getPatchNotes, getPatchNote, updatePatchNote, deletePatchNote,
  // team
  getTeamMembers, upsertTeamMember, deleteTeamMember,
  // policies
  getPolicy, upsertPolicy,
  // departments
  getDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment,
  // staff
  getAllStaff, getStaffMember, getStaffById, getStaffByDepartment,
  addStaffMember, updateStaffMember, removeStaffMember, isStaffMember,
  // tickets
  createTicket, getTickets, getTicket, getMyTickets, updateTicket,
  addTicketMessage, getTicketMessages,
};
