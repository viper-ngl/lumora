// bot/commands/unmute.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed, hasModPerms, isLumoraAdmin, sendModLog } = require('../utils');
const { getGuildSettings, addInfractionRecord } = require('../database');

module.exports = {
  name: 'unmute', aliases: ['um'],
  data: new SlashCommandBuilder().setName('unmute').setDescription('Unmute a member')
    .addUserOption(o => o.setName('user').setDescription('User to unmute').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const s = getGuildSettings(interaction.guild.id);
    if (!hasModPerms(interaction.member, s) && !isLumoraAdmin(interaction.user.id))
      return interaction.editReply({ embeds: [errorEmbed('No Permission', 'You need mod permissions.')] });
    if (!s.mute_role_id) return interaction.editReply({ embeds: [errorEmbed('Setup Required', 'No mute role configured.')] });
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    if (!target || !target.roles.cache.has(s.mute_role_id)) return interaction.editReply({ embeds: [errorEmbed('Error', 'This user is not muted.')] });
    try {
      await target.roles.remove(s.mute_role_id, `${interaction.user.tag}: ${reason}`);
      addInfractionRecord({ guild_id: interaction.guild.id, user_id: target.id, moderator_id: interaction.user.id, type: 'unmute', reason, duration: null, expires_at: null });
      await sendModLog(interaction.guild, s, modLogEmbed('unmute', interaction.user, target.user, reason));
      return interaction.editReply({ embeds: [successEmbed('User Unmuted', `**${target.user.tag}** has been unmuted.`)] });
    } catch (e) { return interaction.editReply({ embeds: [errorEmbed('Error', e.message)] }); }
  },
  async executePrefix(message, args) {
    const s = getGuildSettings(message.guild.id);
    if (!hasModPerms(message.member, s)) return message.reply({ embeds: [errorEmbed('No Permission', 'You need mod permissions.')] });
    if (!s.mute_role_id) return message.reply({ embeds: [errorEmbed('Setup Required', 'No mute role configured.')] });
    if (!args[0]) return message.reply({ embeds: [errorEmbed('Usage', '`!unmute <@user>`')] });
    const target = await message.guild.members.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null);
    if (!target || !target.roles.cache.has(s.mute_role_id)) return message.reply({ embeds: [errorEmbed('Error', 'User not found or not muted.')] });
    const reason = args.slice(1).join(' ') || 'No reason provided';
    try {
      await target.roles.remove(s.mute_role_id, `${message.author.tag}: ${reason}`);
      addInfractionRecord({ guild_id: message.guild.id, user_id: target.id, moderator_id: message.author.id, type: 'unmute', reason, duration: null, expires_at: null });
      await sendModLog(message.guild, s, modLogEmbed('unmute', message.author, target.user, reason));
      return message.reply({ embeds: [successEmbed('User Unmuted', `**${target.user.tag}** has been unmuted.`)] });
    } catch (e) { return message.reply({ embeds: [errorEmbed('Error', e.message)] }); }
  }
};
