// bot/commands/help.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { FOOTER } = require('../utils');
const { getGuildSettings } = require('../database');

module.exports = {
  name: 'help', aliases: ['h', 'commands'],
  data: new SlashCommandBuilder().setName('help').setDescription('View all Lumora Bot commands'),
  async execute(interaction) {
    return interaction.reply({ embeds: [buildHelp('/')], ephemeral: true });
  },
  async executePrefix(message) {
    const s = getGuildSettings(message.guild.id);
    return message.reply({ embeds: [buildHelp(s.prefix || '!')] });
  }
};

function buildHelp(p) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📘 Lumora Bot — Commands')
    .setDescription('A public moderation bot by Lumora Services.')
    .addFields(
      { name: '⚔️ Moderation', value: [
        `\`${p}ban <user> [duration] [reason]\``,
        `\`${p}unban <userID> [reason]\``,
        `\`${p}kick <user> [reason]\``,
        `\`${p}mute <user> [duration] [reason]\``,
        `\`${p}unmute <user> [reason]\``,
        `\`${p}timeout <user> <duration> [reason]\``,
        `\`${p}warn <user> <reason>\``,
        `\`${p}purge <amount>\``,
        `\`${p}lock [#channel]\``,
        `\`${p}unlock [#channel]\``,
      ].join('\n') },
      { name: '📋 Records', value: [
        `\`${p}infractions view <user>\``,
        `\`${p}infractions clear <user>\``,
        `\`${p}infractions delete <caseID>\``,
      ].join('\n') },
      { name: '⚙️ Setup (Admin only)', value: [
        `\`${p}setup view\``,
        `\`${p}setup prefix <prefix>\``,
        `\`${p}setup modrole <role>\``,
        `\`${p}setup logchannel <#channel>\``,
        `\`${p}setup muterole <role>\``,
        `\`${p}setup automod <feature> <on/off>\``,
        `\`${p}setup warnthreshold <number>\``,
        `\`${p}setup warnaction <mute|kick|ban>\``,
      ].join('\n') },
    )
    .setFooter(FOOTER)
    .setTimestamp();
}
