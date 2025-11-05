const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'addresponse',
  description: 'Add a named trigger-response pair (requires Manage Server).',
  aliases: [],
  /**
   * execute(message, args, ctx)
   * ctx: { manager, config, client, requireManageGuild, PREFIX, MATCH_MODE, log }
   */
  async execute(message, args, ctx) {
    const { manager, requireManageGuild, log } = ctx;

    // Only in guilds
    if (!message.guild) {
      const e = new EmbedBuilder()
        .setTitle('Command unavailable')
        .setDescription('This command can only be used inside a server.')
        .setColor('#E74C3C');
      return message.reply({ embeds: [e] });
    }

    // Permission check
    if (!requireManageGuild(message.member)) {
      const e = new EmbedBuilder()
        .setTitle('Insufficient permissions')
        .setDescription('You need the Manage Server permission to add responses.')
        .setColor('#E67E22');
      return message.reply({ embeds: [e] });
    }

    // Parse args: name trigger response...
    const name = args.shift();
    const trigger = args.shift();
    const responseText = args.join(' ');

    if (!name || !trigger || !responseText) {
      const e = new EmbedBuilder()
        .setTitle('Invalid usage')
        .setDescription(`Usage: \`${ctx.PREFIX}addresponse [name] [trigger] [response on trigger]\``)
        .addFields(
          { name: 'Example', value: `\`${ctx.PREFIX}addresponse greet hello Hello there, welcome!\`` }
        )
        .setColor('#3498DB');
      return message.reply({ embeds: [e] });
    }

    // Attempt to add to storage
    try {
      await manager.add(message.guild.id, name, trigger, responseText);

      const success = new EmbedBuilder()
        .setTitle('Response added')
        .setDescription(`**${name}** has been saved.`)
        .addFields(
          { name: 'Trigger', value: `\`${trigger}\``, inline: true },
          { name: 'Reply', value: responseText.length > 1024 ? responseText.slice(0, 1020) + '...' : responseText, inline: false }
        )
        .setColor('#2ECC71')
        .setFooter({ text: `Added by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

      return message.reply({ embeds: [success] });
    } catch (err) {
      log?.error && log.error('addresponse error', err);
      const fail = new EmbedBuilder()
        .setTitle('Failed to add response')
        .setDescription(err.message || 'An unexpected error occurred.')
        .setColor('#C0392B');
      return message.reply({ embeds: [fail] });
    }
  }
};
