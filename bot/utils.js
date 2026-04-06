// bot/utils.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const SUCCESS_COLOR = 0x57F287;
const ERROR_COLOR   = 0xED4245;
const WARNING_COLOR = 0xFEE75C;
const INFO_COLOR    = 0x5865F2;
const FOOTER = { text: 'Powered by Lumora Services' };

function successEmbed(title, description) {
  return new EmbedBuilder().setColor(SUCCESS_COLOR).setTitle(`✅ ${title}`).setDescription(description).setFooter(FOOTER).setTimestamp();
}
function errorEmbed(title, description) {
  return new EmbedBuilder().setColor(ERROR_COLOR).setTitle(`❌ ${title}`).setDescription(description).setFooter(FOOTER).setTimestamp();
}
function infoEmbed(title, description) {
  return new EmbedBuilder().setColor(INFO_COLOR).setTitle(`ℹ️ ${title}`).setDescription(description).setFooter(FOOTER).setTimestamp();
}
function warnEmbed(title, description) {
  return new EmbedBuilder().setColor(WARNING_COLOR).setTitle(`⚠️ ${title}`).setDescription(description).setFooter(FOOTER).setTimestamp();
}

function modLogEmbed(action, moderator, target, reason, extra = {}) {
  const colors = { ban: ERROR_COLOR, kick: WARNING_COLOR, mute: WARNING_COLOR, warn: WARNING_COLOR, unban: SUCCESS_COLOR, unmute: SUCCESS_COLOR, timeout: WARNING_COLOR, purge: INFO_COLOR, lock: INFO_COLOR, unlock: SUCCESS_COLOR };
  const icons  = { ban: '🔨', kick: '👢', mute: '🔇', warn: '⚠️', unban: '✅', unmute: '🔊', timeout: '⏱️', purge: '🗑️', lock: '🔒', unlock: '🔓' };
  const embed = new EmbedBuilder()
    .setColor(colors[action] || INFO_COLOR)
    .setTitle(`${icons[action] || '📋'} ${action.toUpperCase()}`)
    .addFields(
      { name: 'Target', value: `${target.tag || target.username || String(target)} (${target.id || String(target)})`, inline: true },
      { name: 'Moderator', value: `${moderator.tag || moderator.username || String(moderator)}`, inline: true },
      { name: 'Reason', value: reason || 'No reason provided', inline: false }
    )
    .setFooter(FOOTER).setTimestamp();
  if (extra.duration) embed.addFields({ name: 'Duration', value: extra.duration, inline: true });
  if (extra.count)    embed.addFields({ name: 'Count', value: String(extra.count), inline: true });
  return embed;
}

function hasModPerms(member, settings) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ModerateMembers)) return true;
  if (settings?.mod_role_id && member.roles.cache.has(settings.mod_role_id)) return true;
  return false;
}

function isLumoraAdmin(userId) {
  return (process.env.LUMORA_ADMIN_IDS || '').split(',').map(s => s.trim()).includes(userId);
}

function parseDuration(str) {
  if (!str) return null;
  const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const match = String(str).match(/^(\d+)([smhd])$/);
  if (!match) return null;
  return parseInt(match[1]) * (units[match[2]] || 0);
}

function formatDuration(ms) {
  if (!ms) return null;
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000),
        m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  if (d) return `${d} day${d !== 1 ? 's' : ''}`;
  if (h) return `${h} hour${h !== 1 ? 's' : ''}`;
  if (m) return `${m} minute${m !== 1 ? 's' : ''}`;
  return `${s} second${s !== 1 ? 's' : ''}`;
}

async function sendModLog(guild, settings, embed) {
  if (!settings?.log_channel) return;
  try {
    const ch = guild.channels.cache.get(settings.log_channel);
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch {}
}

async function resolveUser(client, input) {
  if (!input) return null;
  return client.users.fetch(input.replace(/[<@!>]/g, '')).catch(() => null);
}

module.exports = {
  SUCCESS_COLOR, ERROR_COLOR, WARNING_COLOR, INFO_COLOR, FOOTER,
  successEmbed, errorEmbed, infoEmbed, warnEmbed, modLogEmbed,
  hasModPerms, isLumoraAdmin, parseDuration, formatDuration,
  sendModLog, resolveUser
};
