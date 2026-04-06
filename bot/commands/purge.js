// bot/commands/purge.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, hasModPerms, isLumoraAdmin, sendModLog, modLogEmbed } = require('../utils');
const { getGuildSettings } = require('../database');

module.exports = {
  name: 'purge', aliases: ['clear', 'prune'],
  data: new SlashCommandBuilder().setName('purge').setDescription('Bulk delete messages (1-100)')
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('user').setDescription('Only delete messages from this user'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const s = getGuildSettings(interaction.guild.id);
    if (!hasModPerms(interaction.member, s) && !isLumoraAdmin(interaction.user.id))
      return interaction.editReply({ embeds: [errorEmbed('No Permission', 'You need Manage Messages permission.')] });
    const amount = interaction.options.getInteger('amount');
    const filterUser = interaction.options.getUser('user');
    try {
      let msgs = await interaction.channel.messages.fetch({ limit: filterUser ? 100 : amount });
      if (filterUser) msgs = new Map([...msgs].filter(([, m]) => m.author.id === filterUser.id).slice(0, amount));
      const twoWeeks = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const deletable = [...msgs.values()].filter(m => m.createdTimestamp > twoWeeks);
      if (!deletable.length) return interaction.editReply({ embeds: [errorEmbed('Error', 'No deletable messages found (must be under 14 days old).')] });
      await interaction.channel.bulkDelete(deletable, true);
      await sendModLog(interaction.guild, s, modLogEmbed('purge', interaction.user, interaction.channel, `Purged ${deletable.length} messages`, { count: deletable.length }));
      return interaction.editReply({ embeds: [successEmbed('Messages Purged', `Deleted **${deletable.length}** messages.`)] });
    } catch (e) { return interaction.editReply({ embeds: [errorEmbed('Error', e.message)] }); }
  },
  async executePrefix(message, args) {
    const s = getGuildSettings(message.guild.id);
    if (!hasModPerms(message.member, s)) return message.reply({ embeds: [errorEmbed('No Permission', 'You need Manage Messages permission.')] });
    const amount = parseInt(args[0]);
    if (!amount || amount < 1 || amount > 100) return message.reply({ embeds: [errorEmbed('Usage', '`!purge <1-100>`')] });
    await message.delete().catch(() => {});
    try {
      const msgs = await message.channel.messages.fetch({ limit: amount });
      const twoWeeks = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const deletable = [...msgs.values()].filter(m => m.createdTimestamp > twoWeeks);
      await message.channel.bulkDelete(deletable, true);
      const m = await message.channel.send({ embeds: [successEmbed('Messages Purged', `Deleted **${deletable.length}** messages.`)] });
      setTimeout(() => m.delete().catch(() => {}), 4000);
    } catch (e) { message.channel.send({ embeds: [errorEmbed('Error', e.message)] }).catch(() => {}); }
  }
};
