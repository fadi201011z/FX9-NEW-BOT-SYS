import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { notice, field, C, EPHEMERAL } from '../../utils/embeds.js';
import { HELP_SECTIONS, helpMenuOptions } from '../../utils/menuContent.js';
import { commandModules } from '../../config/commandLoader.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Browse every command the bot has');

export async function execute(interaction) {
  // Counts are read from the loaded commands, not typed in. The old version
  // hardcoded "41 commands" and "6 sections" while offering 7 sections and
  // listing a /profile command that does not exist.
  const modules = await commandModules();
  const total = modules.filter((m) => typeof m.mod.execute === 'function').length;

  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('help_menu')
      .setPlaceholder('📋 Choose a section…')
      .addOptions(helpMenuOptions().map((o) => new StringSelectMenuOptionBuilder()
        .setLabel(o.label)
        .setDescription(o.description)
        .setValue(o.value)))
  );

  await interaction.reply({
    embeds: [notice({
      title: '⚔️ Kratos — command directory',
      description: 'One bot for moderation, tickets and temporary voice.\n'
        + 'Pick a section below to see what it does. 👇',
      color: C.accent,
      thumbnail: interaction.client.user.displayAvatarURL({ dynamic: true, size: 512 }),
      fields: [
        field('Total commands', `${total}`),
        field('Sections', `${HELP_SECTIONS.length}`),
        field('Available sections', HELP_SECTIONS
          .map((s) => `\`${s.value.replace('help_', '')}\` — ${s.blurb}`)
          .join('\n'), false),
      ],
      footer: 'Kratos System • Choose a section below',
      timestamp: true,
    })],
    components: [menu],
    flags: EPHEMERAL,
  });
}