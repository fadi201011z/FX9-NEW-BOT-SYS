import { SlashCommandBuilder, ChannelType, EmbedBuilder } from 'discord.js';
import { setGuildSetup, buildStatusPanel, updatePanelMessageId } from '../../handlers/tempVoice.js';

export const data = new SlashCommandBuilder()
  .setName('setup-voice')
  .setDescription('إعداد نظام القنوات الصوتية المؤقتة')
  .addChannelOption(o =>
    o.setName('category').setDescription('الفئة التي ستُنشأ فيها القنوات')
     .addChannelTypes(ChannelType.GuildCategory).setRequired(true)
  )
  .addChannelOption(o =>
    o.setName('join_channel').setDescription('قناة "انضم لإنشاء قناة"')
     .addChannelTypes(ChannelType.GuildVoice).setRequired(true)
  )
  .addChannelOption(o =>
    o.setName('text_channel').setDescription('القناة النصية للوحة التحكم الدائمة')
     .addChannelTypes(ChannelType.GuildText).setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const category = interaction.options.getChannel('category');
  const joinCh = interaction.options.getChannel('join_channel');
  const textCh = interaction.options.getChannel('text_channel');

  if (joinCh.parentId !== category.id) {
    return interaction.editReply({ content: '❌ قناة الانضمام يجب أن تكون داخل الفئة المختارة.' });
  }

  const config = {
    categoryId: category.id,
    joinChannelId: joinCh.id,
    textChannelId: textCh.id,
    panelMessageId: null,
  };

  await setGuildSetup(interaction.guildId, config);

  // Delete old panel if exists, then send fresh one
  try {
    const oldMsgs = await textCh.messages.fetch({ limit: 20 });
    for (const msg of oldMsgs.values()) {
      if (msg.author.id === interaction.client.user.id && msg.embeds.length > 0) {
        await msg.delete().catch(() => {});
      }
    }
  } catch (_) {}

  const panel = buildStatusPanel(config, 0);
  const msg = await textCh.send(panel);
  await updatePanelMessageId(interaction.guildId, msg.id);

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle('✅ تم الإعداد بنجاح!')
        .setColor(0x57f287)
        .setDescription(
          '✨ **الإعدادات محفوظة تلقائياً** — لن تحتاج لإعادة **`/setup-voice`** بعد ريستارت البوت.\n' +
          '**اللوحة ستبقى دائماً في القناة النصية المختارة.**'
        )
        .addFields(
          { name: '📁 الفئة', value: `${category}`, inline: true },
          { name: '🔊 قناة الانضمام', value: `${joinCh}`, inline: true },
          { name: '💬 قناة التحكم', value: `${textCh}`, inline: true },
        )
        .setFooter({ text: 'FX9-VOICE v3.0' })
        .setTimestamp(),
    ],
  });
}
