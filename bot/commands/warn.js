// bot/commands/warn.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, warnEmbed, modLogEmbed, hasModPerms, isLumoraAdmin, sendModLog } = require('../utils');
const { getGuildSettings, addInfractionRecord, getWarnCount } = require('../database');

module.exports = {
  name: 'warn', aliases: ['w'],
  data: new SlashCommandBuilder().setName('warn').setDescription('Warn a member')
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const s = getGuildSettings(interaction.guild.id);
    if (!hasModPerms(interaction.member, s) && !isLumoraAdmin(interaction.user.id))
      return interaction.editReply({ embeds: [errorEmbed('No Permission', 'You need mod permissions.')] });
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason');
    if (!target) return interaction.editReply({ embeds: [errorEmbed('Error', 'Member not found.')] });
    const id = addInfractionRecord({ guild_id: interaction.guild.id, user_id: target.id, moderator_id: interaction.user.id, type: 'warn', reason, duration: null, expires_at: null });
    const count = getWarnCount(interaction.guild.id, target.id);
    await target.user.send({ embeds: [warnEmbed(`Warning in ${interaction.guild.name}`, `**Reason:** ${reason}\n**Total Warnings:** ${count}`)] }).catch(() => {});
    await sendModLog(interaction.guild, s, modLogEmbed('warn', interaction.user, target.user, reason, { count }));
    const extra = count >= (s.warn_threshold || 3) ? `\n⚠️ User has reached **${count}** warnings (threshold: ${s.warn_threshold || 3}).` : '';
    return interaction.editReply({ embeds: [successEmbed('Warning Issued', `**${target.user.tag}** warned.\n**Reason:** ${reason}\n**Total Warns:** ${count}\n**Case #${id}**${extra}`)] });
  },
  async executePrefix(message, args) {
    const s = getGuildSettings(message.guild.id);
    if (!hasModPerms(message.member, s)) return message.reply({ embeds: [errorEmbed('No Permission', 'You need mod permissions.')] });
    if (!args[0]) return message.reply({ embeds: [errorEmbed('Usage', '`!warn <@user> <reason>`')] });
    const target = await message.guild.members.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null);
    if (!target) return message.reply({ embeds: [errorEmbed('Error', 'Member not found.')] });
    const reason = args.slice(1).join(' ') || 'No reason provided';
    const id = addInfractionRecord({ guild_id: message.guild.id, user_id: target.id, moderator_id: message.author.id, type: 'warn', reason, duration: null, expires_at: null });
    const count = getWarnCount(message.guild.id, target.id);
    await target.user.send({ embeds: [warnEmbed(`Warning in ${message.guild.name}`, `**Reason:** ${reason}\n**Total Warnings:** ${count}`)] }).catch(() => {});
    await sendModLog(message.guild, s, modLogEmbed('warn', message.author, target.user, reason, { count }));
    return message.reply({ embeds: [successEmbed('Warning Issued', `**${target.user.tag}** warned.\n**Reason:** ${reason}\n**Total Warns:** ${count}\n**Case #${id}**`)] });
  }
};
