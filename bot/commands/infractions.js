// bot/commands/infractions.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { errorEmbed, successEmbed, hasModPerms, isLumoraAdmin, FOOTER } = require('../utils');
const { getGuildSettings, getUserInfractions, clearWarnings, deleteInfraction } = require('../database');

module.exports = {
  name: 'infractions', aliases: ['inf', 'cases'],
  data: new SlashCommandBuilder().setName('infractions').setDescription('View or manage infractions')
    .addSubcommand(s => s.setName('view').setDescription('View a user\'s infractions').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('clear').setDescription('Clear all warnings for a user').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('delete').setDescription('Delete a specific case').addIntegerOption(o => o.setName('case_id').setDescription('Case ID').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const s = getGuildSettings(interaction.guild.id);
    if (!hasModPerms(interaction.member, s) && !isLumoraAdmin(interaction.user.id))
      return interaction.editReply({ embeds: [errorEmbed('No Permission', 'You need mod permissions.')] });
    const sub = interaction.options.getSubcommand();
    if (sub === 'view') {
      const target = interaction.options.getUser('user');
      const records = getUserInfractions(interaction.guild.id, target.id);
      return interaction.editReply({ embeds: [buildEmbed(records, target.tag, target.id)] });
    }
    if (sub === 'clear') {
      const target = interaction.options.getUser('user');
      clearWarnings(interaction.guild.id, target.id);
      return interaction.editReply({ embeds: [successEmbed('Warnings Cleared', `All warnings cleared for **${target.tag}**.`)] });
    }
    if (sub === 'delete') {
      const id = interaction.options.getInteger('case_id');
      deleteInfraction(id, interaction.guild.id);
      return interaction.editReply({ embeds: [successEmbed('Case Deleted', `Case **#${id}** has been deleted.`)] });
    }
  },
  async executePrefix(message, args) {
    const s = getGuildSettings(message.guild.id);
    if (!hasModPerms(message.member, s)) return message.reply({ embeds: [errorEmbed('No Permission', 'You need mod permissions.')] });
    if (!args[0]) return message.reply({ embeds: [errorEmbed('Usage', '`!infractions <@user>`')] });
    const userId = args[0].replace(/[<@!>]/g, '');
    const user = await message.client.users.fetch(userId).catch(() => null);
    const records = getUserInfractions(message.guild.id, userId);
    return message.reply({ embeds: [buildEmbed(records, user?.tag || userId, userId)] });
  }
};

function buildEmbed(records, tag, userId) {
  const icons = { ban: '🔨', kick: '👢', mute: '🔇', warn: '⚠️', unban: '✅', unmute: '🔊', timeout: '⏱️' };
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`📋 Infractions — ${tag}`).setFooter(FOOTER).setTimestamp();
  if (!records.length) return embed.setDescription('No infractions found for this user.');
  const lines = records.slice(0, 15).map(r => `\`#${r.id}\` ${icons[r.type] || '📋'} **${r.type.toUpperCase()}** — ${r.reason || 'No reason'} — <t:${r.created_at}:R>`);
  embed.setDescription(lines.join('\n'));
  if (records.length > 15) embed.setFooter({ text: `Showing 15 of ${records.length} • Powered by Lumora Services` });
  return embed;
}
