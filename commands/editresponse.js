// commands/editresponse.js
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'editresponse',
  description: 'Edit trigger or response text for an existing named response (requires Manage Server).',
  aliases: ['updateresponse', 'modresponse'],
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
          .setDescription('You need the Manage Server permission to edit responses.')
          .setColor('#E67E22')]
      });
    }

    const name = args.shift();
    const newTrigger = args.shift();
    const newResponse = args.join(' ');

    if (!name || !newTrigger || !newResponse) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('Invalid usage')
          .setDescription(`Usage: \`${ctx.PREFIX}editresponse [name] [edit_trigger] [edit_response on trigger]\``)
          .addFields(
            { name: 'Example', value: `\`${ctx.PREFIX}editresponse greet hi Hey there — updated!\`` }
          )
          .setColor('#3498DB')]
      });
    }

    try {
      await manager.edit(message.guild.id, name, newTrigger, newResponse);
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('Response updated')
          .setDescription(`**${name}** has been updated.`)
          .addFields(
            { name: 'New Trigger', value: `\`${newTrigger}\``, inline: true },
            { name: 'New Reply', value: newResponse.length > 1024 ? newResponse.slice(0, 1020) + '...' : newResponse, inline: false }
          )
          .setColor('#F1C40F')
          .setFooter({ text: `Edited by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })]
      });
    } catch (err) {
      log?.error && log.error('editresponse error', err);
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('Failed to update')
          .setDescription(err.message || 'An unexpected error occurred.')
          .setColor('#C0392B')]
      });
    }
  }
};
