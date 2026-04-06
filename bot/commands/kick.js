// bot/commands/kick.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed, hasModPerms, isLumoraAdmin, sendModLog } = require('../utils');
const { getGuildSettings, addInfractionRecord } = require('../database');

module.exports = {
  name: 'kick', aliases: ['k'],
  data: new SlashCommandBuilder().setName('kick').setDescription('Kick a user')
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const s = getGuildSettings(interaction.guild.id);
    if (!hasModPerms(interaction.member, s) && !isLumoraAdmin(interaction.user.id))
      return interaction.editReply({ embeds: [errorEmbed('No Permission', 'You need Kick Members permission.')] });
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    if (!target) return interaction.editReply({ embeds: [errorEmbed('Error', 'Member not found.')] });
    if (!target.kickable) return interaction.editReply({ embeds: [errorEmbed('Error', 'I cannot kick this user.')] });
    try {
      await target.user.send({ embeds: [errorEmbed(`Kicked from ${interaction.guild.name}`, `**Reason:** ${reason}`)] }).catch(() => {});
      await target.kick(`${interaction.user.tag}: ${reason}`);
      const id = addInfractionRecord({ guild_id: interaction.guild.id, user_id: target.id, moderator_id: interaction.user.id, type: 'kick', reason, duration: null, expires_at: null });
      await sendModLog(interaction.guild, s, modLogEmbed('kick', interaction.user, target.user, reason));
      return interaction.editReply({ embeds: [successEmbed('User Kicked', `**${target.user.tag}** kicked.\n**Reason:** ${reason}\n**Case #${id}**`)] });
    } catch (e) { return interaction.editReply({ embeds: [errorEmbed('Error', e.message)] }); }
  },
  async executePrefix(message, args) {
    const s = getGuildSettings(message.guild.id);
    if (!hasModPerms(message.member, s)) return message.reply({ embeds: [errorEmbed('No Permission', 'You need Kick Members permission.')] });
    if (!args[0]) return message.reply({ embeds: [errorEmbed('Usage', '`!kick <@user> [reason]`')] });
    const target = await message.guild.members.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null);
    if (!target) return message.reply({ embeds: [errorEmbed('Error', 'Member not found.')] });
    const reason = args.slice(1).join(' ') || 'No reason provided';
    try {
      await target.user.send({ embeds: [errorEmbed(`Kicked from ${message.guild.name}`, `**Reason:** ${reason}`)] }).catch(() => {});
      await target.kick(`${message.author.tag}: ${reason}`);
      const id = addInfractionRecord({ guild_id: message.guild.id, user_id: target.id, moderator_id: message.author.id, type: 'kick', reason, duration: null, expires_at: null });
      await sendModLog(message.guild, s, modLogEmbed('kick', message.author, target.user, reason));
      return message.reply({ embeds: [successEmbed('User Kicked', `**${target.user.tag}** kicked.\n**Reason:** ${reason}\n**Case #${id}**`)] });
    } catch (e) { return message.reply({ embeds: [errorEmbed('Error', e.message)] }); }
  }
};
