// bot/commands/lock.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed, hasModPerms, isLumoraAdmin, sendModLog } = require('../utils');
const { getGuildSettings } = require('../database');

module.exports = {
  name: 'lock',
  data: new SlashCommandBuilder().setName('lock').setDescription('Lock a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel (default: current)'))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const s = getGuildSettings(interaction.guild.id);
    if (!hasModPerms(interaction.member, s) && !isLumoraAdmin(interaction.user.id))
      return interaction.editReply({ embeds: [errorEmbed('No Permission', 'You need Manage Channels permission.')] });
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const reason = interaction.options.getString('reason') || 'No reason provided';
    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      await sendModLog(interaction.guild, s, modLogEmbed('lock', interaction.user, channel, reason));
      return interaction.editReply({ embeds: [successEmbed('Channel Locked', `${channel} has been locked.\n**Reason:** ${reason}`)] });
    } catch (e) { return interaction.editReply({ embeds: [errorEmbed('Error', e.message)] }); }
  },
  async executePrefix(message, args) {
    const s = getGuildSettings(message.guild.id);
    if (!hasModPerms(message.member, s)) return message.reply({ embeds: [errorEmbed('No Permission', 'You need Manage Channels.')] });
    const channel = message.mentions.channels.first() || message.channel;
    try {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      await sendModLog(message.guild, s, modLogEmbed('lock', message.author, channel, 'Channel locked'));
      return message.reply({ embeds: [successEmbed('Channel Locked', `${channel} has been locked.`)] });
    } catch (e) { return message.reply({ embeds: [errorEmbed('Error', e.message)] }); }
  }
};
