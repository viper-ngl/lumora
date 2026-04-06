// bot/events/guildMemberAdd.js
const { checkBlacklist, getGuildSettings } = require('../database');
const { modLogEmbed, sendModLog, errorEmbed } = require('../utils');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    const bl = checkBlacklist(member.id);
    if (!bl) return;
    const s = getGuildSettings(member.guild.id);
    const reason = `Lumora Global Blacklist: ${bl.reason || 'No reason provided'}`;
    try {
      await member.user.send({ embeds: [errorEmbed('Banned on Join', `You are globally blacklisted from Lumora-protected servers.\n**Reason:** ${bl.reason || 'No reason'}`)] }).catch(() => {});
      await member.guild.members.ban(member.id, { reason });
      await sendModLog(member.guild, s, modLogEmbed('ban', { tag: 'Lumora AutoBan', id: client.user.id }, member.user, reason));
    } catch (e) {
      console.error('[AutoBan] Failed:', e.message);
    }
  }
};
