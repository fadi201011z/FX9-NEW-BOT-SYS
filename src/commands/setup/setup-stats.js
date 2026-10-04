import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { setConfig } from '../../database.js';
import { notice, field, C, EPHEMERAL } from '../../utils/embeds.js';
import { requireRole } from '../../utils/permissions.js';
import { COMMAND_ROLES } from '../../config/roles.js';
import { updateStatusChannels } from '../../utils/statusUpdater.js';

export const data = new SlashCommandBuilder()
  .setName('setup-stats')
  .setDescription('Set up live server statistics in voice channels — refreshes every minute')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub.setName('create')
      .setDescription('Create the three voice channels and a category for them'))
  .addSubcommand((sub) =>
    sub.setName('set')
      .setDescription('Bind statistics to voice channels you already have')
      .addChannelOption((opt) =>
        opt.setName('total').setDescription('Total members channel').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
      .addChannelOption((opt) =>
        opt.setName('online').setDescription('Online members channel').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
      .addChannelOption((opt) =>
        opt.setName('bots').setDescription('Bots channel').addChannelTypes(ChannelType.GuildVoice).setRequired(true)));

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.setup)) return;

  await interaction.deferReply({ flags: EPHEMERAL });

  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    // Nobody may connect — the channel names are the whole point.
    const locked = [{ id: interaction.guild.id, deny: ['Connect'] }];

    const category = await interaction.guild.channels.create({
      name: '📊 Server statistics',
      type: ChannelType.GuildCategory,
      permissionOverwrites: locked,
    });

    const total  = await interaction.guild.channels.create({ name: '👥 Members: 0', type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: locked });
    const online = await interaction.guild.channels.create({ name: '🟢 Online: 0',  type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: locked });
    const bots   = await interaction.guild.channels.create({ name: '🤖 Bots: 0',    type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: locked });

    setConfig(interaction.guildId, 'stats_total',  total.id);
    setConfig(interaction.guildId, 'stats_online', online.id);
    setConfig(interaction.guildId, 'stats_bots',   bots.id);

    await updateStatusChannels(interaction.guild).catch(() => {});

    return interaction.editReply({
      embeds: [notice({
        title: '📊 Statistics channels created',
        color: C.ok,
        description: `Three voice channels were created under **${category.name}**. `
          + 'They refresh automatically every minute and nobody can connect to them.',
        fields: [
          field('👥 Members', total.toString()),
          field('🟢 Online', online.toString()),
          field('🤖 Bots', bots.toString()),
        ],
        footer: 'Kratos System • Setup',
        timestamp: true,
      })],
    });
  }

  // sub === 'set'
  const total  = interaction.options.getChannel('total', true);
  const online = interaction.options.getChannel('online', true);
  const bots   = interaction.options.getChannel('bots', true);

  setConfig(interaction.guildId, 'stats_total',  total.id);
  setConfig(interaction.guildId, 'stats_online', online.id);
  setConfig(interaction.guildId, 'stats_bots',   bots.id);

  await updateStatusChannels(interaction.guild).catch(() => {});

  return interaction.editReply({
    embeds: [notice({
      title: '📊 Statistics channels linked',
      color: C.ok,
      description: 'Channels are linked and the current counts have been written. '
        + 'They refresh every minute.',
      fields: [
        field('👥 Members', total.toString()),
        field('🟢 Online', online.toString()),
        field('🤖 Bots', bots.toString()),
      ],
      footer: 'Kratos System • Setup',
      timestamp: true,
    })],
  });
}