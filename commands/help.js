// commands/help.js
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

const EMBED_COLOR = 0x00B894;
const PER_PAGE = 8;
const TIMEOUT_MS = 120000;

function loadCommandMetas(commandsPath) {
  const metas = [];
  if (!fs.existsSync(commandsPath)) return metas;
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      delete require.cache[require.resolve(path.join(commandsPath, file))];
      const mod = require(path.join(commandsPath, file));
      const name = mod.name || path.basename(file, '.js');
      const description = mod.description || 'No description provided.';
      const aliases = Array.isArray(mod.aliases) && mod.aliases.length ? mod.aliases.join(', ') : '';
      const usage = mod.usage || null;
      metas.push({ name, description, aliases, usage });
    } catch (e) {
      // skip invalid command files
      continue;
    }
  }
  // sort alphabetically
  metas.sort((a, b) => a.name.localeCompare(b.name));
  return metas;
}

function makePageEmbed(items, pageIndex, totalPages, prefix) {
  const embed = new EmbedBuilder()
    .setTitle('Commands')
    .setDescription('List of available bot commands')
    .setColor(EMBED_COLOR)
    .setFooter({ text: `Page ${pageIndex + 1} of ${totalPages}` });

  for (const it of items) {
    const lines = [];
    if (it.aliases) lines.push(`Aliases: ${it.aliases}`);
    if (it.usage) lines.push(`Usage: \`${prefix}${it.usage}\``);
    const value = [it.description, ...lines].filter(Boolean).join('\n');
    embed.addFields({ name: `• ${it.name}`, value: value, inline: false });
  }
  return embed;
}

module.exports = {
  name: 'help',
  description: 'Show a list of commands and basic usage (paginated).',
  aliases: ['commands', 'h'],
  usage: 'help [page]',
  async execute(message, args, ctx) {
    const commandsPath = path.join(__dirname);
    const all = loadCommandMetas(commandsPath);

    if (!all.length) {
      const e = new EmbedBuilder()
        .setTitle('No commands found')
        .setDescription('There are no commands in the commands folder.')
        .setColor(0xE74C3C);
      return message.reply({ embeds: [e] });
    }

    // prepare pages
    const pages = [];
    for (let i = 0; i < all.length; i += PER_PAGE) {
      const chunk = all.slice(i, i + PER_PAGE);
      pages.push(makePageEmbed(chunk, Math.floor(i / PER_PAGE), Math.ceil(all.length / PER_PAGE), ctx.PREFIX));
    }

    // requested page
    const requested = Math.max(1, parseInt(args[0], 10) || 1);
    let index = Math.min(Math.max(0, requested - 1), pages.length - 1);

    // if only one page, send and return
    if (pages.length === 1) {
      return message.reply({ embeds: [pages[0]] });
    }

    // build controls
    const firstBtn = new ButtonBuilder().setCustomId('first').setLabel('⏮️').setStyle(ButtonStyle.Primary);
    const prevBtn  = new ButtonBuilder().setCustomId('prev').setLabel('◀️').setStyle(ButtonStyle.Secondary);
    const stopBtn  = new ButtonBuilder().setCustomId('stop').setLabel('⏹️').setStyle(ButtonStyle.Danger);
    const nextBtn  = new ButtonBuilder().setCustomId('next').setLabel('▶️').setStyle(ButtonStyle.Secondary);
    const lastBtn  = new ButtonBuilder().setCustomId('last').setLabel('⏭️').setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents([firstBtn, prevBtn, stopBtn, nextBtn, lastBtn]);

    const reply = await message.reply({ embeds: [pages[index]], components: [row] });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: TIMEOUT_MS
    });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: "Only the command author can control this help panel.", ephemeral: true });
      }
      await interaction.deferUpdate();

      switch (interaction.customId) {
        case 'first':
          index = 0;
          break;
        case 'prev':
          index = Math.max(0, index - 1);
          break;
        case 'next':
          index = Math.min(pages.length - 1, index + 1);
          break;
        case 'last':
          index = pages.length - 1;
          break;
        case 'stop':
          collector.stop('stopped-by-user');
          break;
      }

      if (!collector.ended) {
        try {
          await reply.edit({ embeds: [pages[index]], components: [row] });
        } catch (e) { /* ignore update errors */ }
      }
    });

    collector.on('end', async () => {
      try {
        const disabled = new ActionRowBuilder().addComponents(
          row.components.map(b => ButtonBuilder.from(b).setDisabled(true))
        );
        await reply.edit({ embeds: [pages[index]], components: [disabled] });
      } catch (e) {}
    });
  }
};
