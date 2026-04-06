// bot/events/messageCreate.js — AutoMod
const { PermissionFlagsBits } = require('discord.js');
const { getGuildSettings, addInfractionRecord, getWarnCount } = require('../database');
const { modLogEmbed, sendModLog, warnEmbed } = require('../utils');

const spamMap = new Map();
const INVITE_RE = /discord(?:\.gg|app\.com\/invite|\.com\/invite)\/[a-zA-Z0-9]+/i;
const LINK_RE   = /https?:\/\//i;
const CAP_RE    = /[A-Z]/g;

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;
    const s = getGuildSettings(message.guild.id);
    if (!s.auto_mod) return;
    const member = message.member;
    if (!member) return;
    if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

    let reason = null;

    // Anti-Spam
    if (s.anti_spam) {
      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      const ts = (spamMap.get(key) || []).filter(t => now - t < 5000);
      ts.push(now);
      spamMap.set(key, ts);
      if (ts.length >= 5) { reason = 'AutoMod: Sending messages too quickly'; spamMap.delete(key); }
    }

    // Anti-Links
    if (!reason && s.anti_links && LINK_RE.test(message.content)) {
      reason = INVITE_RE.test(message.content)
        ? 'AutoMod: Discord invites are not allowed'
        : 'AutoMod: External links are not allowed';
    }

    // Anti-Caps
    if (!reason && s.anti_caps && message.content.length > 8) {
      const caps = (message.content.match(CAP_RE) || []).length;
      if ((caps / message.content.length) * 100 >= (s.caps_threshold || 70)) {
        reason = `AutoMod: Excessive caps (${Math.round((caps / message.content.length) * 100)}%)`;
      }
    }

    if (!reason) return;

    await message.delete().catch(() => {});

    addInfractionRecord({ guild_id: message.guild.id, user_id: message.author.id, moderator_id: client.user.id, type: 'warn', reason, duration: null, expires_at: null });
    const warnCount = getWarnCount(message.guild.id, message.author.id);

    await message.author.send({ embeds: [warnEmbed(`AutoMod — ${message.guild.name}`, `**Reason:** ${reason}\n**Warnings:** ${warnCount}`)] }).catch(() => {});
    await sendModLog(message.guild, s, modLogEmbed('warn', client.user, message.author, reason, { count: warnCount }));

    // Auto-escalate at threshold
    if (warnCount >= (s.warn_threshold || 3)) {
      const esc = `AutoMod: Reached ${warnCount} warnings`;
      if (s.warn_action === 'mute' && s.mute_role_id) {
        await member.roles.add(s.mute_role_id, esc).catch(() => {});
        await sendModLog(message.guild, s, modLogEmbed('mute', client.user, message.author, esc));
      } else if (s.warn_action === 'kick') {
        await member.kick(esc).catch(() => {});
        await sendModLog(message.guild, s, modLogEmbed('kick', client.user, message.author, esc));
      } else if (s.warn_action === 'ban') {
        await message.guild.members.ban(message.author.id, { reason: esc }).catch(() => {});
        await sendModLog(message.guild, s, modLogEmbed('ban', client.user, message.author, esc));
      }
    }
  }
};
