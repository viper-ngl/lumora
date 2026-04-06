// bot/commands/unban.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed, hasModPerms, isLumoraAdmin, sendModLog } = require('../utils');
const { getGuildSettings, addInfractionRecord } = require('../database');

module.exports = {
  name: 'unban', aliases: ['ub'],
  data: new SlashCommandBuilder().setName('unban').setDescription('Unban a user by ID')
    .addStringOption(o => o.setName('user_id').setDescription('User ID to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const s = getGuildSettings(interaction.guild.id);
    if (!hasModPerms(interaction.member, s) && !isLumoraAdmin(interaction.user.id))
      return interaction.editReply({ embeds: [errorEmbed('No Permission', 'You need Ban Members permission.')] });
    const userId = interaction.options.getString('user_id');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    try {
      const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
      if (!ban) return interaction.editReply({ embeds: [errorEmbed('Error', 'This user is not banned.')] });
      await interaction.guild.members.unban(userId, `${interaction.user.tag}: ${reason}`);
      addInfractionRecord({ guild_id: interaction.guild.id, user_id: userId, moderator_id: interaction.user.id, type: 'unban', reason, duration: null, expires_at: null });
      await sendModLog(interaction.guild, s, modLogEmbed('unban', interaction.user, ban.user, reason));
      return interaction.editReply({ embeds: [successEmbed('User Unbanned', `**${ban.user.tag}** has been unbanned.`)] });
    } catch (e) { return interaction.editReply({ embeds: [errorEmbed('Error', e.message)] }); }
  },
  async executePrefix(message, args) {
    const s = getGuildSettings(message.guild.id);
    if (!hasModPerms(message.member, s)) return message.reply({ embeds: [errorEmbed('No Permission', 'You need Ban Members permission.')] });
    if (!args[0]) return message.reply({ embeds: [errorEmbed('Usage', '`!unban <userID>`')] });
    const reason = args.slice(1).join(' ') || 'No reason provided';
    try {
      const ban = await message.guild.bans.fetch(args[0]).catch(() => null);
      if (!ban) return message.reply({ embeds: [errorEmbed('Error', 'User is not banned.')] });
      await message.guild.members.unban(args[0], `${message.author.tag}: ${reason}`);
      addInfractionRecord({ guild_id: message.guild.id, user_id: args[0], moderator_id: message.author.id, type: 'unban', reason, duration: null, expires_at: null });
      await sendModLog(message.guild, s, modLogEmbed('unban', message.author, ban.user, reason));
      return message.reply({ embeds: [successEmbed('User Unbanned', `**${ban.user.tag}** has been unbanned.`)] });
    } catch (e) { return message.reply({ embeds: [errorEmbed('Error', e.message)] }); }
  }
};
