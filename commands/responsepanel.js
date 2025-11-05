// commands/responsepanel.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

const EMBED_COLOR = 0x5865F2;
const PER_PAGE = 6;
const TIMEOUT_MS = 120000; // 2 minutes

module.exports = {
  name: 'responsepanel',
  description: 'Show all saved responses for this server in a paginated embed with controls.',
  aliases: ['responses', 'responselist', 'rp'],
  /**
   * execute(message, args, ctx)
   * ctx: { manager, config, client, requireManageGuild, PREFIX, MATCH_MODE, log }
   */
  async execute(message, args, ctx) {
    const { manager, log, PREFIX } = ctx;

    if (!message.guild) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('Command unavailable')
          .setDescription('This command can only be used inside a server.')
          .setColor(0xE74C3C)]
      });
    }

    try {
      const items = await manager.list(message.guild.id);
      if (!items || items.length === 0) {
        return message.reply({
          embeds: [new EmbedBuilder()
            .setTitle('No responses')
            .setDescription('There are no saved responses for this server yet.')
            .setColor(0x95A5A6)]
        });
      }

      // build pages
      const pages = [];
      for (let i = 0; i < items.length; i += PER_PAGE) {
        const chunk = items.slice(i, i + PER_PAGE);
        const embed = new EmbedBuilder()
          .setTitle('Response Panel')
          .setDescription(`Total responses: **${items.length}**`)
          .setColor(EMBED_COLOR)
          .setFooter({ text: `Page ${Math.floor(i / PER_PAGE) + 1} of ${Math.ceil(items.length / PER_PAGE)}` });

        for (const r of chunk) {
          const trigger = String(r.trigger ?? r.trigger);
          const resp = String(r.response ?? r.response);
          const displayResp = resp.length > 256 ? resp.slice(0, 253) + '...' : resp;
          embed.addFields({ name: `• ${r.name}`, value: `Trigger: \`${trigger}\`\nReply: ${displayResp}`, inline: false });
        }
        pages.push(embed);
      }

      // controls
      const firstBtn = new ButtonBuilder().setCustomId('first').setLabel('⏮️').setStyle(ButtonStyle.Primary);
      const prevBtn  = new ButtonBuilder().setCustomId('prev').setLabel('◀️').setStyle(ButtonStyle.Secondary);
      const stopBtn  = new ButtonBuilder().setCustomId('stop').setLabel('⏹️').setStyle(ButtonStyle.Danger);
      const nextBtn  = new ButtonBuilder().setCustomId('next').setLabel('▶️').setStyle(ButtonStyle.Secondary);
      const lastBtn  = new ButtonBuilder().setCustomId('last').setLabel('⏭️').setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder().addComponents([firstBtn, prevBtn, stopBtn, nextBtn, lastBtn]);

      // determine initial page
      const requestedPage = Math.max(1, parseInt(args[0], 10) || 1);
      let pageIndex = Math.min(Math.max(0, requestedPage - 1), pages.length - 1);

      const reply = await message.reply({ embeds: [pages[pageIndex]], components: pages.length > 1 ? [row] : [] });

      if (pages.length === 1) return;

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: TIMEOUT_MS,
      });

      collector.on('collect', async (interaction) => {
        // allow only original invoker to control
        if (interaction.user.id !== message.author.id) {
          return interaction.reply({ content: "You can't control this panel — only the command author can.", ephemeral: true });
        }

        await interaction.deferUpdate();

        switch (interaction.customId) {
          case 'first':
            pageIndex = 0;
            break;
          case 'prev':
            pageIndex = Math.max(0, pageIndex - 1);
            break;
          case 'next':
            pageIndex = Math.min(pages.length - 1, pageIndex + 1);
            break;
          case 'last':
            pageIndex = pages.length - 1;
            break;
          case 'stop':
            collector.stop('stopped-by-user');
            break;
        }

        // update embed (unless stopped)
        if (!collector.ended) {
          try {
            await reply.edit({ embeds: [pages[pageIndex]], components: [row] });
          } catch (err) {
            log?.error && log.error('Failed to update paginator message', err);
          }
        }
      });

      collector.on('end', async (_, reason) => {
        // disable buttons when collector ends
        try {
          const disabledRow = new ActionRowBuilder().addComponents(
            row.components.map(b => ButtonBuilder.from(b).setDisabled(true))
          );
          await reply.edit({
            embeds: [pages[pageIndex]],
            components: [disabledRow]
          });
        } catch (err) {
          log?.error && log.error('Failed to disable paginator buttons', err);
        }
      });

    } catch (err) {
      log?.error && log.error('responsepanel error', err);
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('Failed to fetch responses')
          .setDescription(err.message || 'An unexpected error occurred.')
          .setColor(0xC0392B)]
      });
    }
  }
};
