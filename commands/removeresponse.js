// commands/removeresponse.js
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'removeresponse',
  description: 'Remove a named response (requires Manage Server).',
  aliases: ['removeres', 'delresponse', 'deleteresponse'],
  async execute(message, args, ctx) {
    const { manager, requireManageGuild, log } = ctx;

    if (!message.guild) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('Command unavailable')
          .setDescription('This command can only be used inside a server.')
          .setColor('#E74C3C')]
      });
    }

    if (!requireManageGuild(message.member)) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('Insufficient permissions')
          .setDescription('You need the Manage Server permission to remove responses.')
          .setColor('#E67E22')]
      });
    }

    const name = args.shift();
    if (!name) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('Invalid usage')
          .setDescription(`Usage: \`${ctx.PREFIX}removeresponse [name]\``)
          .setColor('#3498DB')]
      });
    }

    try {
      await manager.remove(message.guild.id, name);
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('Response removed')
          .setDescription(`**${name}** has been removed.`)
          .setColor('#E74C3C')
          .setFooter({ text: `Removed by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })]
      });
    } catch (err) {
      log?.error && log.error('removeresponse error', err);
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('Failed to remove')
          .setDescription(err.message || 'An unexpected error occurred.')
          .setColor('#C0392B')]
      });
    }
  }
};
