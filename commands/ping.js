// commands/ping.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'ping',
  description: 'Check bot latency and websocket heartbeat.',
  aliases: ['pong'],
  usage: 'ping',
  /**
   * execute(message, args, ctx)
   * ctx: { client }
   */
  async execute(message, args, ctx) {
    const { client } = ctx;

    // initial embed (sending time)
    const sent = Date.now();
    const embed = new EmbedBuilder()
      .setTitle('Pinging...')
      .setDescription('Measuring latency')
      .setColor(0x00B4D8)
      .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

    const reply = await message.reply({ embeds: [embed] });

    // calculate latencies
    const now = Date.now();
    const roundTrip = now - sent;
    const apiLatency = Math.round(client.ws.ping);

    const result = new EmbedBuilder()
      .setTitle('Pong!')
      .setColor(0x2ECC71)
      .addFields(
        { name: 'Round-trip latency', value: `${roundTrip} ms`, inline: true },
        { name: 'Gateway (WS) ping', value: `${apiLatency} ms`, inline: true }
      )
      .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

    try {
      await reply.edit({ embeds: [result] });
    } catch (err) {
      // fallback: send a new message if edit fails
      await message.channel.send({ embeds: [result] });
    }
  }
};
