// bot/commands/mute.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed, hasModPerms, isLumoraAdmin, parseDuration, formatDuration, sendModLog } = require('../utils');
const { getGuildSettings, addInfractionRecord, addTempPunishment } = require('../database');

module.exports = {
  name: 'mute', aliases: ['m'],
  data: new SlashCommandBuilder().setName('mute').setDescription('Mute a member using the mute role')
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 10m, 1h, 1d'))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const s = getGuildSettings(interaction.guild.id);
    if (!hasModPerms(interaction.member, s) && !isLumoraAdmin(interaction.user.id))
      return interaction.editReply({ embeds: [errorEmbed('No Permission', 'You need mod permissions.')] });
    if (!s.mute_role_id) return interaction.editReply({ embeds: [errorEmbed('Setup Required', 'No mute role set. Use `/setup muterole` first.')] });
    const target = interaction.options.getMember('user');
    const dur = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    if (!target) return interaction.editReply({ embeds: [errorEmbed('Error', 'Member not found.')] });
    if (target.roles.cache.has(s.mute_role_id)) return interaction.editReply({ embeds: [errorEmbed('Error', 'User is already muted.')] });
    const ms = dur ? parseDuration(dur) : null;
    const exp = ms ? Math.floor(Date.now() / 1000) + Math.floor(ms / 1000) : null;
    try {
      await target.roles.add(s.mute_role_id, `${interaction.user.tag}: ${reason}`);
      const id = addInfractionRecord({ guild_id: interaction.guild.id, user_id: target.id, moderator_id: interaction.user.id, type: 'mute', reason, duration: ms, expires_at: exp });
      if (ms && exp) addTempPunishment({ guild_id: interaction.guild.id, user_id: target.id, type: 'mute', expires_at: exp, role_id: s.mute_role_id });
      await target.user.send({ embeds: [errorEmbed(`Muted in ${interaction.guild.name}`, `**Reason:** ${reason}\n**Duration:** ${ms ? formatDuration(ms) : 'Indefinite'}`)] }).catch(() => {});
      await sendModLog(interaction.guild, s, modLogEmbed('mute', interaction.user, target.user, reason, { duration: ms ? formatDuration(ms) : 'Indefinite' }));
      return interaction.editReply({ embeds: [successEmbed('User Muted', `**${target.user.tag}** muted.\n**Duration:** ${ms ? formatDuration(ms) : 'Indefinite'}\n**Case #${id}**`)] });
    } catch (e) { return interaction.editReply({ embeds: [errorEmbed('Error', e.message)] }); }
  },
  async executePrefix(message, args) {
    const s = getGuildSettings(message.guild.id);
    if (!hasModPerms(message.member, s)) return message.reply({ embeds: [errorEmbed('No Permission', 'You need mod permissions.')] });
    if (!s.mute_role_id) return message.reply({ embeds: [errorEmbed('Setup Required', 'No mute role configured.')] });
    if (!args[0]) return message.reply({ embeds: [errorEmbed('Usage', '`!mute <@user> [duration] [reason]`')] });
    const target = await message.guild.members.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null);
    if (!target) return message.reply({ embeds: [errorEmbed('Error', 'Member not found.')] });
    let dur = null, si = 1;
    if (args[1] && /^\d+[smhd]$/.test(args[1])) { dur = args[1]; si = 2; }
    const reason = args.slice(si).join(' ') || 'No reason provided';
    const ms = dur ? parseDuration(dur) : null;
    const exp = ms ? Math.floor(Date.now() / 1000) + Math.floor(ms / 1000) : null;
    try {
      await target.roles.add(s.mute_role_id, `${message.author.tag}: ${reason}`);
      const id = addInfractionRecord({ guild_id: message.guild.id, user_id: target.id, moderator_id: message.author.id, type: 'mute', reason, duration: ms, expires_at: exp });
      if (ms && exp) addTempPunishment({ guild_id: message.guild.id, user_id: target.id, type: 'mute', expires_at: exp, role_id: s.mute_role_id });
      await sendModLog(message.guild, s, modLogEmbed('mute', message.author, target.user, reason, { duration: ms ? formatDuration(ms) : 'Indefinite' }));
      return message.reply({ embeds: [successEmbed('User Muted', `**${target.user.tag}** muted.\n**Case #${id}**`)] });
    } catch (e) { return message.reply({ embeds: [errorEmbed('Error', e.message)] }); }
  }
};
