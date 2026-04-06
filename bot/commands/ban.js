// bot/commands/ban.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed, hasModPerms, isLumoraAdmin, parseDuration, formatDuration, sendModLog } = require('../utils');
const { getGuildSettings, addInfractionRecord, addTempPunishment } = require('../database');

module.exports = {
  name: 'ban', aliases: ['b'],
  data: new SlashCommandBuilder().setName('ban').setDescription('Ban a user from the server')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 1d, 7d (leave blank = permanent)'))
    .addIntegerOption(o => o.setName('delete_messages').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const settings = getGuildSettings(interaction.guild.id);
    if (!hasModPerms(interaction.member, settings) && !isLumoraAdmin(interaction.user.id))
      return interaction.editReply({ embeds: [errorEmbed('No Permission', 'You need Ban Members permission.')] });
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const duration = interaction.options.getString('duration');
    const del = interaction.options.getInteger('delete_messages') ?? 0;
    await doBan(interaction.guild, interaction.user, target, reason, duration, del, settings, interaction);
  },

  async executePrefix(message, args) {
    const settings = getGuildSettings(message.guild.id);
    if (!hasModPerms(message.member, settings) && !isLumoraAdmin(message.author.id))
      return message.reply({ embeds: [errorEmbed('No Permission', 'You need Ban Members permission.')] });
    if (!args[0]) return message.reply({ embeds: [errorEmbed('Usage', '`!ban <@user> [duration] [reason]`')] });
    const target = await message.client.users.fetch(args[0].replace(/[<@!>]/g, '')).catch(() => null);
    if (!target) return message.reply({ embeds: [errorEmbed('Error', 'User not found.')] });
    let dur = null, si = 1;
    if (args[1] && /^\d+[smhd]$/.test(args[1])) { dur = args[1]; si = 2; }
    await doBan(message.guild, message.author, target, args.slice(si).join(' ') || 'No reason provided', dur, 0, settings, message);
  }
};

async function doBan(guild, mod, target, reason, durStr, del, settings, ctx) {
  const reply = e => ctx.editReply ? ctx.editReply({ embeds: [e] }) : ctx.reply({ embeds: [e] });
  if (target.id === mod.id) return reply(errorEmbed('Error', 'You cannot ban yourself.'));
  const member = await guild.members.fetch(target.id).catch(() => null);
  if (member && !member.bannable) return reply(errorEmbed('Error', 'I cannot ban this user.'));
  const ms = durStr ? parseDuration(durStr) : null;
  const exp = ms ? Math.floor(Date.now() / 1000) + Math.floor(ms / 1000) : null;
  try {
    await target.send({ embeds: [errorEmbed(`Banned from ${guild.name}`, `**Reason:** ${reason}\n**Duration:** ${ms ? formatDuration(ms) : 'Permanent'}`)] }).catch(() => {});
    await guild.members.ban(target.id, { deleteMessageSeconds: del * 86400, reason: `${mod.tag}: ${reason}` });
    const id = addInfractionRecord({ guild_id: guild.id, user_id: target.id, moderator_id: mod.id, type: 'ban', reason, duration: ms, expires_at: exp });
    if (ms && exp) addTempPunishment({ guild_id: guild.id, user_id: target.id, type: 'ban', expires_at: exp, role_id: null });
    await sendModLog(guild, settings, modLogEmbed('ban', mod, target, reason, { duration: ms ? formatDuration(ms) : 'Permanent' }));
    return reply(successEmbed('User Banned', `**${target.tag}** banned.\n**Reason:** ${reason}\n**Duration:** ${ms ? formatDuration(ms) : 'Permanent'}\n**Case #${id}**`));
  } catch (e) { return reply(errorEmbed('Error', e.message)); }
}
