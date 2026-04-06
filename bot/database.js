// bot/database.js — Nova v4 — sql.js pure WASM SQLite (no native build needed)
'use strict';
const path   = require('path');
const fs     = require('fs');
const { v4: uuid } = require('uuid');

const dbPath = (process.env.DB_PATH || path.join(__dirname, '../data/nova.db'));
const dbDir  = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

let DB = null;

async function initDB() {
  if (DB) return DB;
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  DB = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
  createSchema();
  save();
  console.log('[Nova DB] Ready at', dbPath);
  return DB;
}

let saveTimer = null;
function save() {
  if (!DB) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(dbPath, Buffer.from(DB.export())); } catch(e) { console.error('[DB save]', e.message); }
  }, 200);
}

function createSchema() {
  DB.run(`
    CREATE TABLE IF NOT EXISTS guild_settings (guild_id TEXT PRIMARY KEY, prefix TEXT NOT NULL DEFAULT '!', mod_role_id TEXT, log_channel TEXT, mute_role_id TEXT, auto_mod INTEGER NOT NULL DEFAULT 0, anti_spam INTEGER NOT NULL DEFAULT 0, anti_links INTEGER NOT NULL DEFAULT 0, anti_caps INTEGER NOT NULL DEFAULT 0, caps_threshold INTEGER NOT NULL DEFAULT 70, warn_threshold INTEGER NOT NULL DEFAULT 3, warn_action TEXT NOT NULL DEFAULT 'mute', updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS infractions (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, moderator_id TEXT NOT NULL, type TEXT NOT NULL, reason TEXT, duration INTEGER, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), expires_at INTEGER);
    CREATE TABLE IF NOT EXISTS blacklist (user_id TEXT PRIMARY KEY, reason TEXT, added_by TEXT NOT NULL, added_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS temp_punishments (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, type TEXT NOT NULL, expires_at INTEGER NOT NULL, role_id TEXT);
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL, email TEXT UNIQUE, password_hash TEXT, discord_id TEXT UNIQUE, discord_username TEXT, discord_avatar TEXT, access_token TEXT, role TEXT NOT NULL DEFAULT 'user', temp_password INTEGER DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), updated_at INTEGER, last_login INTEGER);
    CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, role TEXT, questions TEXT NOT NULL DEFAULT '[]', deadline TEXT, status TEXT NOT NULL DEFAULT 'open', created_by TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS application_responses (id TEXT PRIMARY KEY, app_id TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT, discord_id TEXT, answers TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending', submitted_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), UNIQUE(app_id, user_id));
    CREATE TABLE IF NOT EXISTS patch_notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, version TEXT, content TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', author TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS team_members (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT, bio TEXT, discord_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE IF NOT EXISTS policies (type TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '', updated_by TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE IF NOT EXISTS departments (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, color TEXT NOT NULL DEFAULT '#6c63ff', created_by TEXT, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE IF NOT EXISTS staff_members (id TEXT PRIMARY KEY, discord_id TEXT NOT NULL UNIQUE, username TEXT NOT NULL, avatar TEXT, department_id TEXT, role_title TEXT NOT NULL DEFAULT 'Staff', permissions TEXT NOT NULL DEFAULT '[]', added_by TEXT NOT NULL, added_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS support_tickets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, username TEXT NOT NULL, discord_id TEXT, subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', priority TEXT NOT NULL DEFAULT 'normal', created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')), updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE IF NOT EXISTS ticket_messages (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT NOT NULL, is_staff INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')));
    CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expired INTEGER NOT NULL);
  `);
}

function q(sql, params=[]) { DB.run(sql, params); save(); }
function g(sql, params=[]) { const s=DB.prepare(sql); s.bind(params); const r=s.step()?s.getAsObject():null; s.free(); return r; }
function a(sql, params=[]) { const s=DB.prepare(sql); s.bind(params); const rows=[]; while(s.step()) rows.push(s.getAsObject()); s.free(); return rows; }
const now=()=>Math.floor(Date.now()/1000);

// Guild Settings
function getGuildSettings(id){return g('SELECT * FROM guild_settings WHERE guild_id=?',[id])||{guild_id:id,prefix:'!',auto_mod:0,anti_spam:0,anti_links:0,anti_caps:0,caps_threshold:70,warn_threshold:3,warn_action:'mute'};}
function updateGuildSettings(id,s){const c=getGuildSettings(id);q(`INSERT INTO guild_settings(guild_id,prefix,mod_role_id,log_channel,mute_role_id,auto_mod,anti_spam,anti_links,anti_caps,caps_threshold,warn_threshold,warn_action,updated_at)VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)ON CONFLICT(guild_id)DO UPDATE SET prefix=excluded.prefix,mod_role_id=excluded.mod_role_id,log_channel=excluded.log_channel,mute_role_id=excluded.mute_role_id,auto_mod=excluded.auto_mod,anti_spam=excluded.anti_spam,anti_links=excluded.anti_links,anti_caps=excluded.anti_caps,caps_threshold=excluded.caps_threshold,warn_threshold=excluded.warn_threshold,warn_action=excluded.warn_action,updated_at=excluded.updated_at`,[id,s.prefix??c.prefix,s.mod_role_id!==undefined?(s.mod_role_id||null):(c.mod_role_id||null),s.log_channel!==undefined?(s.log_channel||null):(c.log_channel||null),s.mute_role_id!==undefined?(s.mute_role_id||null):(c.mute_role_id||null),s.auto_mod??c.auto_mod,s.anti_spam??c.anti_spam,s.anti_links??c.anti_links,s.anti_caps??c.anti_caps,s.caps_threshold??c.caps_threshold,s.warn_threshold??c.warn_threshold,s.warn_action??c.warn_action,now()]);return getGuildSettings(id);}
function getAllGuildSettings(){return a('SELECT * FROM guild_settings');}

// Infractions
function addInfractionRecord(d){q('INSERT INTO infractions(guild_id,user_id,moderator_id,type,reason,duration,expires_at)VALUES(?,?,?,?,?,?,?)',[d.guild_id,d.user_id,d.moderator_id,d.type,d.reason||null,d.duration||null,d.expires_at||null]);const r=g('SELECT last_insert_rowid() as id');return r?r.id:null;}
function getUserInfractions(gid,uid){return a('SELECT * FROM infractions WHERE guild_id=? AND user_id=? ORDER BY created_at DESC',[gid,uid]);}
function getServerInfractions(gid){return a('SELECT * FROM infractions WHERE guild_id=? ORDER BY created_at DESC LIMIT 200',[gid]);}
function getAllInfractions(){return a('SELECT * FROM infractions ORDER BY created_at DESC LIMIT 500');}
function getWarnCount(gid,uid){const r=g('SELECT COUNT(*) as c FROM infractions WHERE guild_id=? AND user_id=? AND type=? AND active=1',[gid,uid,'warn']);return r?r.c:0;}
function clearWarnings(gid,uid){q('UPDATE infractions SET active=0 WHERE guild_id=? AND user_id=? AND type=?',[gid,uid,'warn']);}
function deleteInfraction(id,gid){q('UPDATE infractions SET active=0 WHERE id=? AND guild_id=?',[id,gid]);}

// Blacklist
function blacklistUser(uid,reason,by){q('INSERT INTO blacklist(user_id,reason,added_by,added_at,active)VALUES(?,?,?,?,1)ON CONFLICT(user_id)DO UPDATE SET reason=excluded.reason,added_by=excluded.added_by,added_at=excluded.added_at,active=1',[uid,reason||null,by,now()]);}
function unblacklistUser(uid){q('UPDATE blacklist SET active=0 WHERE user_id=?',[uid]);}
function checkBlacklist(uid){return g('SELECT * FROM blacklist WHERE user_id=? AND active=1',[uid]);}
function getBlacklist(){return a('SELECT * FROM blacklist WHERE active=1 ORDER BY added_at DESC');}

// Temp punishments
function addTempPunishment(d){q('INSERT INTO temp_punishments(guild_id,user_id,type,expires_at,role_id)VALUES(?,?,?,?,?)',[d.guild_id,d.user_id,d.type,d.expires_at,d.role_id||null]);}
function getExpiredPunishments(){return a('SELECT * FROM temp_punishments WHERE expires_at<=?',[now()]);}
function removeTempPunishment(id){q('DELETE FROM temp_punishments WHERE id=?',[id]);}
function getTempByUser(gid,uid,type){return g('SELECT * FROM temp_punishments WHERE guild_id=? AND user_id=? AND type=?',[gid,uid,type]);}

// Accounts
function createAccount(d){const id=uuid();q('INSERT INTO accounts(id,username,email,password_hash,discord_id,discord_username,discord_avatar,access_token,role)VALUES(?,?,?,?,?,?,?,?,?)',[id,d.username,d.email||null,d.password_hash||null,d.discord_id||null,d.discord_username||null,d.discord_avatar||null,d.access_token||null,'user']);return id;}
function getAccountByEmail(email){return email?g('SELECT * FROM accounts WHERE lower(email)=lower(?)',[email]):null;}
function getAccountByDiscordId(did){return did?g('SELECT * FROM accounts WHERE discord_id=?',[did]):null;}
function getAccountById(id){return id?g('SELECT * FROM accounts WHERE id=?',[id]):null;}
function updateAccount(id,d){const fields=Object.keys(d).filter(k=>k!=='id');if(!fields.length)return getAccountById(id);const sets=fields.map(k=>`${k}=?`).join(', ');const vals=fields.map(k=>d[k]);q(`UPDATE accounts SET ${sets},updated_at=? WHERE id=?`,[...vals,now(),id]);return getAccountById(id);}
function getAllAccounts(){return a('SELECT id,username,email,discord_id,discord_username,discord_avatar,role,temp_password,created_at,last_login FROM accounts ORDER BY created_at DESC');}
function touchLogin(id){q('UPDATE accounts SET last_login=? WHERE id=?',[now(),id]);}

// Applications
function createApplicationPost(d){const id=uuid();q('INSERT INTO applications(id,title,description,role,questions,deadline,status,created_by)VALUES(?,?,?,?,?,?,?,?)',[id,d.title,d.description||null,d.role||null,JSON.stringify(d.questions||[]),d.deadline||null,d.status||'open',d.created_by||null]);return id;}
function _parseApp(a2){return a2?{...a2,questions:JSON.parse(a2.questions||'[]'),responses:a('SELECT * FROM application_responses WHERE app_id=? ORDER BY submitted_at ASC',[a2.id]).map(r=>({...r,answers:JSON.parse(r.answers||'{}')})) }:null;}
function getApplicationPosts(){return a('SELECT * FROM applications ORDER BY created_at DESC').map(_parseApp);}
function getApplicationPost(id){return _parseApp(g('SELECT * FROM applications WHERE id=?',[id]));}
function updateApplicationPost(id,d){const u=(f,v)=>q(`UPDATE applications SET ${f}=?,updated_at=? WHERE id=?`,[v,now(),id]);if(d.title!==undefined)u('title',d.title);if(d.description!==undefined)u('description',d.description||null);if(d.role!==undefined)u('role',d.role||null);if(d.questions!==undefined)u('questions',JSON.stringify(d.questions));if(d.deadline!==undefined)u('deadline',d.deadline||null);if(d.status!==undefined)u('status',d.status);}
function deleteApplicationPost(id){q('DELETE FROM applications WHERE id=?',[id]);}
function submitApplicationResponse(appId,d){const id=uuid();q('INSERT INTO application_responses(id,app_id,user_id,username,discord_id,answers)VALUES(?,?,?,?,?,?)',[id,appId,d.user_id,d.username||null,d.discord_id||null,JSON.stringify(d.answers||{})]);return id;}
function updateApplicationResponse(appId,rid,d){if(d.status)q('UPDATE application_responses SET status=? WHERE id=? AND app_id=?',[d.status,rid,appId]);}
function hasApplied(appId,uid){return!!g('SELECT id FROM application_responses WHERE app_id=? AND user_id=?',[appId,uid]);}

// Patch notes
function createPatchNote(d){const id=uuid();q('INSERT INTO patch_notes(id,title,version,content,tags,author)VALUES(?,?,?,?,?,?)',[id,d.title,d.version||null,d.content,JSON.stringify(d.tags||[]),d.author||null]);return id;}
function getPatchNotes(){return a('SELECT * FROM patch_notes ORDER BY created_at DESC').map(n=>({...n,tags:JSON.parse(n.tags||'[]')}));}
function getPatchNote(id){const n=g('SELECT * FROM patch_notes WHERE id=?',[id]);return n?{...n,tags:JSON.parse(n.tags||'[]')}:null;}
function updatePatchNote(id,d){const u=(f,v)=>q(`UPDATE patch_notes SET ${f}=?,updated_at=? WHERE id=?`,[v,now(),id]);if(d.title!==undefined)u('title',d.title);if(d.version!==undefined)u('version',d.version||null);if(d.content!==undefined)u('content',d.content);if(d.tags!==undefined)u('tags',JSON.stringify(d.tags));}
function deletePatchNote(id){q('DELETE FROM patch_notes WHERE id=?',[id]);}

// Team
function getTeamMembers(){return a('SELECT * FROM team_members ORDER BY sort_order ASC, created_at ASC');}
function upsertTeamMember(d){if(d.id&&g('SELECT id FROM team_members WHERE id=?',[d.id])){q('UPDATE team_members SET name=?,role=?,bio=?,discord_id=?,sort_order=? WHERE id=?',[d.name,d.role||null,d.bio||null,d.discord_id||null,d.sort_order||0,d.id]);return d.id;}const id=uuid();q('INSERT INTO team_members(id,name,role,bio,discord_id,sort_order)VALUES(?,?,?,?,?,?)',[id,d.name,d.role||null,d.bio||null,d.discord_id||null,d.sort_order||0]);return id;}
function deleteTeamMember(id){q('DELETE FROM team_members WHERE id=?',[id]);}

// Policies
function getPolicy(type){return g('SELECT * FROM policies WHERE type=?',[type]);}
function upsertPolicy(type,content,by){q('INSERT INTO policies(type,content,updated_by,created_at,updated_at)VALUES(?,?,?,?,?)ON CONFLICT(type)DO UPDATE SET content=excluded.content,updated_by=excluded.updated_by,updated_at=excluded.updated_at',[type,content,by,now(),now()]);return getPolicy(type);}

// Departments
function getDepartments(){return a('SELECT * FROM departments ORDER BY created_at ASC');}
function getDepartment(id){return g('SELECT * FROM departments WHERE id=?',[id]);}
function createDepartment(d){const id=uuid();q('INSERT INTO departments(id,name,description,color,created_by)VALUES(?,?,?,?,?)',[id,d.name,d.description||null,d.color||'#6c63ff',d.created_by||null]);return id;}
function updateDepartment(id,d){if(d.name!==undefined)q('UPDATE departments SET name=? WHERE id=?',[d.name,id]);if(d.description!==undefined)q('UPDATE departments SET description=? WHERE id=?',[d.description||null,id]);if(d.color!==undefined)q('UPDATE departments SET color=? WHERE id=?',[d.color,id]);return getDepartment(id);}
function deleteDepartment(id){q('UPDATE staff_members SET department_id=NULL WHERE department_id=?',[id]);q('DELETE FROM departments WHERE id=?',[id]);}

// Staff
function _enrich(rows){const depts=getDepartments();return rows.map(m=>({...m,permissions:JSON.parse(m.permissions||'[]'),department:depts.find(d=>d.id===m.department_id)||null}));}
function getAllStaff(){return _enrich(a('SELECT * FROM staff_members ORDER BY added_at ASC'));}
function getStaffById(id){const r=g('SELECT * FROM staff_members WHERE id=?',[id]);return r?_enrich([r])[0]:null;}
function getStaffMember(did){const r=g('SELECT * FROM staff_members WHERE discord_id=?',[did]);return r?_enrich([r])[0]:null;}
function addStaffMember(d){const ex=g('SELECT id FROM staff_members WHERE discord_id=?',[d.discord_id]);if(ex){q('UPDATE staff_members SET username=?,avatar=?,department_id=?,role_title=?,permissions=?,updated_at=? WHERE discord_id=?',[d.username,d.avatar||null,d.department_id||null,d.role_title||'Staff',JSON.stringify(d.permissions||[]),now(),d.discord_id]);return ex.id;}const id=uuid();q('INSERT INTO staff_members(id,discord_id,username,avatar,department_id,role_title,permissions,added_by)VALUES(?,?,?,?,?,?,?,?)',[id,d.discord_id,d.username,d.avatar||null,d.department_id||null,d.role_title||'Staff',JSON.stringify(d.permissions||[]),d.added_by||'owner']);return id;}
function updateStaffMember(id,d){const u=(f,v)=>q(`UPDATE staff_members SET ${f}=?,updated_at=? WHERE id=?`,[v,now(),id]);if(d.username!==undefined)u('username',d.username);if(d.avatar!==undefined)u('avatar',d.avatar||null);if(d.department_id!==undefined)u('department_id',d.department_id||null);if(d.role_title!==undefined)u('role_title',d.role_title);if(d.permissions!==undefined)u('permissions',JSON.stringify(d.permissions));return getStaffById(id);}
function removeStaffMember(id){q('DELETE FROM staff_members WHERE id=?',[id]);}
function isStaffMember(did){return!!g('SELECT id FROM staff_members WHERE discord_id=?',[did]);}

// Support tickets
function createTicket(d){const id=uuid();q('INSERT INTO support_tickets(id,user_id,username,discord_id,subject,priority)VALUES(?,?,?,?,?,?)',[id,d.user_id,d.username,d.discord_id||null,d.subject,d.priority||'normal']);return id;}
function getTickets(status){return status?a('SELECT * FROM support_tickets WHERE status=? ORDER BY created_at DESC',[status]):a('SELECT * FROM support_tickets ORDER BY created_at DESC');}
function getTicket(id){return g('SELECT * FROM support_tickets WHERE id=?',[id]);}
function getMyTickets(uid){return a('SELECT * FROM support_tickets WHERE user_id=? ORDER BY created_at DESC',[uid]);}
function updateTicket(id,d){if(d.status!==undefined)q('UPDATE support_tickets SET status=?,updated_at=? WHERE id=?',[d.status,now(),id]);if(d.priority!==undefined)q('UPDATE support_tickets SET priority=?,updated_at=? WHERE id=?',[d.priority,now(),id]);return getTicket(id);}
function addTicketMessage(d){const id=uuid();q('INSERT INTO ticket_messages(id,ticket_id,user_id,username,is_staff,message)VALUES(?,?,?,?,?,?)',[id,d.ticket_id,d.user_id,d.username,d.is_staff?1:0,d.message]);q('UPDATE support_tickets SET updated_at=? WHERE id=?',[now(),d.ticket_id]);return id;}
function getTicketMessages(tid){return a('SELECT * FROM ticket_messages WHERE ticket_id=? ORDER BY created_at ASC',[tid]);}

// Session store (SQLite-backed for persistence across restarts)
const sessionStore = {
  get:(sid)=>{const r=g('SELECT sess,expired FROM sessions WHERE sid=?',[sid]);if(!r)return null;if(r.expired<now()){sessionStore.destroy(sid);return null;}try{return JSON.parse(r.sess);}catch{return null;}},
  set:(sid,sess,maxAge)=>{const exp=now()+(maxAge?Math.floor(maxAge/1000):604800);q('INSERT INTO sessions(sid,sess,expired)VALUES(?,?,?)ON CONFLICT(sid)DO UPDATE SET sess=excluded.sess,expired=excluded.expired',[sid,JSON.stringify(sess),exp]);},
  destroy:(sid)=>{q('DELETE FROM sessions WHERE sid=?',[sid]);},
  cleanup:()=>{q('DELETE FROM sessions WHERE expired<?',[now()]);},
};
setInterval(()=>sessionStore.cleanup(),3600000);

module.exports={initDB,save,sessionStore,getGuildSettings,updateGuildSettings,getAllGuildSettings,addInfractionRecord,getUserInfractions,getServerInfractions,getAllInfractions,getWarnCount,clearWarnings,deleteInfraction,blacklistUser,unblacklistUser,checkBlacklist,getBlacklist,addTempPunishment,getExpiredPunishments,removeTempPunishment,getTempByUser,createAccount,getAccountByEmail,getAccountByDiscordId,getAccountById,updateAccount,getAllAccounts,touchLogin,createApplicationPost,getApplicationPosts,getApplicationPost,updateApplicationPost,deleteApplicationPost,submitApplicationResponse,updateApplicationResponse,hasApplied,createPatchNote,getPatchNotes,getPatchNote,updatePatchNote,deletePatchNote,getTeamMembers,upsertTeamMember,deleteTeamMember,getPolicy,upsertPolicy,getDepartments,getDepartment,createDepartment,updateDepartment,deleteDepartment,getAllStaff,getStaffMember,getStaffById,addStaffMember,updateStaffMember,removeStaffMember,isStaffMember,createTicket,getTickets,getTicket,getMyTickets,updateTicket,addTicketMessage,getTicketMessages};
