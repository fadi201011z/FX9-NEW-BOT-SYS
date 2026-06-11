import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { setConfig } from '../../database.js';
import { successEmbed, EPHEMERAL } from '../../utils/embeds.js';
import { requireRole } from '../../utils/permissions.js';
import { COMMAND_ROLES } from '../../config/roles.js';
import { updateStatusChannels } from '../../utils/statusUpdater.js';

export const data = new SlashCommandBuilder()
  .setName('setup-stats')
  .setDescription('إعداد قنوات الإحصائيات الصوتية (تتحدث كل دقيقة)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('create')
      .setDescription('إنشاء 3 قنوات صوتية تلقائياً لإحصائيات السيرفر')
  )
  .addSubcommand(sub =>
    sub.setName('set')
      .setDescription('ربط قنوات صوتية موجودة بالإحصائيات')
      .addChannelOption(opt =>
        opt.setName('total').setDescription('قناة إجمالي الأعضاء').addChannelTypes(ChannelType.GuildVoice).setRequired(true)
      )
      .addChannelOption(opt =>
        opt.setName('online').setDescription('قناة الأعضاء المتصلين').addChannelTypes(ChannelType.GuildVoice).setRequired(true)
      )
      .addChannelOption(opt =>
        opt.setName('bots').setDescription('قناة البوتات').addChannelTypes(ChannelType.GuildVoice).setRequired(true)
      )
  );

export async function execute(interaction) {
  if (!await requireRole(interaction, COMMAND_ROLES.setup)) return;

  await interaction.deferReply({ flags: EPHEMERAL });
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    const category = await interaction.guild.channels.create({
      name: '📊 إحصائيات السيرفر',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [{ id: interaction.guild.id, deny: ['Connect'] }],
    });

    const totalCh  = await interaction.guild.channels.create({ name: '👥 الأعضاء: 0',  type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: [{ id: interaction.guild.id, deny: ['Connect'] }] });
    const onlineCh = await interaction.guild.channels.create({ name: '🟢 متصل: 0',     type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: [{ id: interaction.guild.id, deny: ['Connect'] }] });
    const botsCh   = await interaction.guild.channels.create({ name: '🤖 بوتات: 0',    type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: [{ id: interaction.guild.id, deny: ['Connect'] }] });

    setConfig(interaction.guildId, 'stats_total',  totalCh.id);
    setConfig(interaction.guildId, 'stats_online', onlineCh.id);
    setConfig(interaction.guildId, 'stats_bots',   botsCh.id);

    await updateStatusChannels(interaction.guild).catch(() => {});

    await interaction.editReply({
      embeds: [
        successEmbed('تم إنشاء قنوات الإحصائيات', 'تم إنشاء **3 قنوات صوتية** تحت تصنيف 📊 إحصائيات السيرفر.\nتتحدث تلقائياً كل **دقيقة واحدة**.')
          .addFields(
            { name: '👥  إجمالي الأعضاء', value: totalCh.toString(),  inline: true },
            { name: '🟢  متصلون',          value: onlineCh.toString(), inline: true },
            { name: '🤖  بوتات',           value: botsCh.toString(),   inline: true }
          )
      ],
    });
  }

  if (sub === 'set') {
    const total  = interaction.options.getChannel('total');
    const online = interaction.options.getChannel('online');
    const bots   = interaction.options.getChannel('bots');

    setConfig(interaction.guildId, 'stats_total',  total.id);
    setConfig(interaction.guildId, 'stats_online', online.id);
    setConfig(interaction.guildId, 'stats_bots',   bots.id);

    await updateStatusChannels(interaction.guild).catch(() => {});

    await interaction.editReply({
      embeds: [
        successEmbed('تم ربط قنوات الإحصائيات', 'تم ربط القنوات وتحديث الأرقام الحالية. تتحدث كل **دقيقة واحدة**.')
          .addFields(
            { name: '👥  إجمالي', value: total.toString(),  inline: true },
            { name: '🟢  متصل',   value: online.toString(), inline: true },
            { name: '🤖  بوتات',  value: bots.toString(),   inline: true }
          )
      ],
    });
  }
}
