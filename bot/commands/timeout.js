// bot/commands/timeout.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed, hasModPerms, isLumoraAdmin, parseDuration, formatDuration, sendModLog } = require('../utils');
const { getGuildSettings, addInfractionRecord } = require('../database');

module.exports = {
  name: 'timeout', aliases: ['to'],
  data: new SlashCommandBuilder().setName('timeout').setDescription('Timeout a member (max 28d)')
    .addUserOption(o => o.setName('user').setDescription('User to timeout').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 10m, 1h, 1d').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const s = getGuildSettings(interaction.guild.id);
    if (!hasModPerms(interaction.member, s) && !isLumoraAdmin(interaction.user.id))
      return interaction.editReply({ embeds: [errorEmbed('No Permission', 'You need Moderate Members permission.')] });
    const target = interaction.options.getMember('user');
    const durStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const ms = parseDuration(durStr);
    if (!ms) return interaction.editReply({ embeds: [errorEmbed('Invalid Duration', 'Use format like `10m`, `1h`, `1d` (max 28d).')] });
    if (ms > 28 * 24 * 60 * 60 * 1000) return interaction.editReply({ embeds: [errorEmbed('Too Long', 'Max timeout is 28 days.')] });
    if (!target) return interaction.editReply({ embeds: [errorEmbed('Error', 'Member not found.')] });
    try {
      await target.timeout(ms, `${interaction.user.tag}: ${reason}`);
      const id = addInfractionRecord({ guild_id: interaction.guild.id, user_id: target.id, moderator_id: interaction.user.id, type: 'timeout', reason, duration: ms, expires_at: Math.floor(Date.now() / 1000) + Math.floor(ms / 1000) });
      await sendModLog(interaction.guild, s, modLogEmbed('timeout', interaction.user, target.user, reason, { duration: formatDuration(ms) }));
      return interaction.editReply({ embeds: [successEmbed('User Timed Out', `**${target.user.tag}** timed out for **${formatDuration(ms)}**.\n**Case #${id}**`)] });
    } catch (e) { return interaction.editReply({ embeds: [errorEmbed('Error', e.message)] }); }
  },
  async executePrefix(message, args) {
    const s = getGuildSettings(message.guild.id);
    if (!hasModPerms(message.member, s)) return message.reply({ embeds: [errorEmbed('No Permission', 'You need mod permissions.')] });
    if (!args[0] || !args[1]) return message.reply({ embeds: [errorEmbed('Usage', '`!timeout <@user> <duration> [reason]`')] });
    const target = await message.guild.members.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null);
    if (!target) return message.reply({ embeds: [errorEmbed('Error', 'Member not found.')] });
    const ms = parseDuration(args[1]);
    if (!ms) return message.reply({ embeds: [errorEmbed('Invalid Duration', 'Use `10m`, `1h`, `1d`.')] });
    const reason = args.slice(2).join(' ') || 'No reason provided';
    try {
      await target.timeout(ms, `${message.author.tag}: ${reason}`);
      const id = addInfractionRecord({ guild_id: message.guild.id, user_id: target.id, moderator_id: message.author.id, type: 'timeout', reason, duration: ms, expires_at: Math.floor(Date.now() / 1000) + Math.floor(ms / 1000) });
      await sendModLog(message.guild, s, modLogEmbed('timeout', message.author, target.user, reason, { duration: formatDuration(ms) }));
      return message.reply({ embeds: [successEmbed('User Timed Out', `**${target.user.tag}** timed out for **${formatDuration(ms)}**.\n**Case #${id}**`)] });
    } catch (e) { return message.reply({ embeds: [errorEmbed('Error', e.message)] }); }
  }
};
