// bot/commands/setup.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { successEmbed, errorEmbed, infoEmbed, FOOTER } = require('../utils');
const { getGuildSettings, updateGuildSettings } = require('../database');

module.exports = {
  name: 'setup', aliases: ['config'],
  data: new SlashCommandBuilder().setName('setup').setDescription('Configure Lumora Bot for your server')
    .addSubcommand(s => s.setName('view').setDescription('View current settings'))
    .addSubcommand(s => s.setName('prefix').setDescription('Set command prefix').addStringOption(o => o.setName('prefix').setDescription('New prefix (1-3 chars)').setRequired(true)))
    .addSubcommand(s => s.setName('modrole').setDescription('Set moderator role').addRoleOption(o => o.setName('role').setDescription('Mod role').setRequired(true)))
    .addSubcommand(s => s.setName('logchannel').setDescription('Set mod log channel').addChannelOption(o => o.setName('channel').setDescription('Log channel').setRequired(true)))
    .addSubcommand(s => s.setName('muterole').setDescription('Set mute role').addRoleOption(o => o.setName('role').setDescription('Mute role').setRequired(true)))
    .addSubcommand(s => s.setName('automod').setDescription('Toggle auto-mod feature')
      .addStringOption(o => o.setName('feature').setDescription('Feature').setRequired(true).addChoices(
        { name: 'Anti-Spam', value: 'anti_spam' }, { name: 'Anti-Links', value: 'anti_links' },
        { name: 'Anti-Caps', value: 'anti_caps' }, { name: 'All AutoMod', value: 'auto_mod' }
      ))
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable or disable').setRequired(true)))
    .addSubcommand(s => s.setName('warnthreshold').setDescription('Warn threshold for auto-action').addIntegerOption(o => o.setName('threshold').setDescription('Number of warns').setRequired(true).setMinValue(1).setMaxValue(20)))
    .addSubcommand(s => s.setName('warnaction').setDescription('Action at warn threshold').addStringOption(o => o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'Mute', value: 'mute' }, { name: 'Kick', value: 'kick' }, { name: 'Ban', value: 'ban' })))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.editReply({ embeds: [errorEmbed('No Permission', 'Only administrators can configure the bot.')] });
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const s = getGuildSettings(guildId);
    if (sub === 'view') return interaction.editReply({ embeds: [settingsEmbed(s, interaction.guild)] });
    if (sub === 'prefix') {
      const p = interaction.options.getString('prefix');
      if (p.length > 3) return interaction.editReply({ embeds: [errorEmbed('Invalid', 'Prefix must be 1-3 characters.')] });
      updateGuildSettings(guildId, { prefix: p });
      return interaction.editReply({ embeds: [successEmbed('Prefix Updated', `Prefix set to \`${p}\``)] });
    }
    if (sub === 'modrole') { updateGuildSettings(guildId, { mod_role_id: interaction.options.getRole('role').id }); return interaction.editReply({ embeds: [successEmbed('Mod Role Set', `Mod role updated.`)] }); }
    if (sub === 'logchannel') { updateGuildSettings(guildId, { log_channel: interaction.options.getChannel('channel').id }); return interaction.editReply({ embeds: [successEmbed('Log Channel Set', `Log channel updated.`)] }); }
    if (sub === 'muterole') { updateGuildSettings(guildId, { mute_role_id: interaction.options.getRole('role').id }); return interaction.editReply({ embeds: [successEmbed('Mute Role Set', `Mute role updated.`)] }); }
    if (sub === 'automod') {
      const feature = interaction.options.getString('feature');
      const enabled = interaction.options.getBoolean('enabled') ? 1 : 0;
      updateGuildSettings(guildId, { [feature]: enabled });
      return interaction.editReply({ embeds: [successEmbed('AutoMod Updated', `**${feature}** is now **${enabled ? 'enabled' : 'disabled'}**.`)] });
    }
    if (sub === 'warnthreshold') { updateGuildSettings(guildId, { warn_threshold: interaction.options.getInteger('threshold') }); return interaction.editReply({ embeds: [successEmbed('Threshold Set', `Warn threshold updated.`)] }); }
    if (sub === 'warnaction') { updateGuildSettings(guildId, { warn_action: interaction.options.getString('action') }); return interaction.editReply({ embeds: [successEmbed('Warn Action Set', `Action at threshold updated.`)] }); }
  },
  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply({ embeds: [errorEmbed('No Permission', 'Only administrators can configure the bot.')] });
    const s = getGuildSettings(message.guild.id);
    if (!args[0] || args[0] === 'view') return message.reply({ embeds: [settingsEmbed(s, message.guild)] });
    if (args[0] === 'prefix' && args[1]) {
      if (args[1].length > 3) return message.reply({ embeds: [errorEmbed('Invalid', 'Prefix must be 1-3 chars.')] });
      updateGuildSettings(message.guild.id, { prefix: args[1] });
      return message.reply({ embeds: [successEmbed('Prefix Updated', `Prefix set to \`${args[1]}\``)] });
    }
    return message.reply({ embeds: [infoEmbed('Setup', 'Use `/setup` for full configuration options.')] });
  }
};

function settingsEmbed(s, guild) {
  return new EmbedBuilder().setColor(0x5865F2).setTitle(`⚙️ Settings — ${guild.name}`)
    .addFields(
      { name: 'Prefix', value: `\`${s.prefix || '!'}\``, inline: true },
      { name: 'Mod Role', value: s.mod_role_id ? `<@&${s.mod_role_id}>` : 'Not set', inline: true },
      { name: 'Log Channel', value: s.log_channel ? `<#${s.log_channel}>` : 'Not set', inline: true },
      { name: 'Mute Role', value: s.mute_role_id ? `<@&${s.mute_role_id}>` : 'Not set', inline: true },
      { name: 'Anti-Spam', value: s.anti_spam ? '✅ On' : '❌ Off', inline: true },
      { name: 'Anti-Links', value: s.anti_links ? '✅ On' : '❌ Off', inline: true },
      { name: 'Anti-Caps', value: s.anti_caps ? '✅ On' : '❌ Off', inline: true },
      { name: 'Warn Threshold', value: `${s.warn_threshold || 3}`, inline: true },
      { name: 'Warn Action', value: s.warn_action || 'mute', inline: true },
    ).setFooter(FOOTER).setTimestamp();
}
