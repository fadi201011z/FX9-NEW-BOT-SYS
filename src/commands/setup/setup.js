import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { notice, field, C, EPHEMERAL } from '../../utils/embeds.js';
import { SETUP_SECTIONS, setupMenuOptions } from '../../utils/menuContent.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('⚙️ Open the setup guide for every system');

export async function execute(interaction) {
  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup_menu')
      .setPlaceholder('📋 Choose the system you want to set up…')
      // Options come from SETUP_SECTIONS, so a new guide section appears here
      // automatically instead of needing a second edit in interactionCreate.
      .addOptions(setupMenuOptions().map((o) => new StringSelectMenuOptionBuilder()
        .setLabel(o.label)
        .setDescription(o.description)
        .setValue(o.value)))
  );

  await interaction.reply({
    embeds: [notice({
      title: '⚙️ Setup centre',
      color: C.accent,
      description: 'Pick the system you want to configure. Each page lists the commands '
        + 'to run, in order.',
      fields: [
        field('Available guides', SETUP_SECTIONS
          .map((s) => `${s.title.split(' ').slice(1).join(' ')} — ${s.blurb}`)
          .join('\n'), false),
        field('Not listed here?', '`/config` shows every current setting, including which channels are set.', false),
      ],
      footer: 'Kratos System • Setup centre',
      timestamp: true,
    })],
    components: [menu],
    flags: EPHEMERAL,
  });
}