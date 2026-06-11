import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { searchMultiple, createQueue, connectToChannel, initPlayer, playNext } from '../../handlers/music.js';
import { checkCooldown } from '../../utils/cooldown.js';

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('ابحث في يوتيوب واختر من 5 نتائج')
  .addStringOption(o => o.setName('query').setDescription('كلمات البحث').setRequired(true));

export async function execute(interaction, client) {
  await interaction.deferReply();

  const rem = checkCooldown(interaction.user.id, 'search', 8000);
  if (rem > 0) return interaction.editReply({ content: `⏳ انتظر **${(rem / 1000).toFixed(1)}ث**.` });

  const voiceCh = interaction.member.voice.channel;
  if (!voiceCh) return interaction.editReply({ content: '❌ انضم إلى قناة صوتية أولاً.' });

  const query = interaction.options.getString('query');
  const results = await searchMultiple(query, 5);

  if (!results.length) return interaction.editReply({ content: '❌ لم يُعثر على نتائج.' });

  const fmt = (s) => {
    const m = Math.floor((s || 0) / 60);
    const sec = String((s || 0) % 60).padStart(2, '0');
    return `${m}:${sec}`;
  };

  const embed = new EmbedBuilder()
    .setTitle(`🔍 نتائج البحث: "${query}"`)
    .setDescription(
      results.map((r, i) =>
        `**${i + 1}.** [${r.title}](${r.url})\n   👤 ${r.author} • ⏱️ ${fmt(r.durationSec)}`
      ).join('\n\n')
    )
    .setColor(0x5865f2)
    .setFooter({ text: 'اضغط رقم المقطع للتشغيل • تنتهي خلال 30 ثانية' });

  const row = new ActionRowBuilder().addComponents(
    ...results.map((_, i) =>
      new ButtonBuilder().setCustomId(`search_pick_${i}`).setLabel(`${i + 1}`).setStyle(ButtonStyle.Primary)
    ),
    new ButtonBuilder().setCustomId('search_cancel').setLabel('❌ إلغاء').setStyle(ButtonStyle.Secondary),
  );

  const reply = await interaction.editReply({ embeds: [embed], components: [row] });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: b => b.user.id === interaction.user.id,
    time: 30_000,
  });

  collector.on('collect', async btn => {
    await btn.deferUpdate();
    collector.stop();

    if (btn.customId === 'search_cancel') {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setDescription('❌ تم إلغاء البحث.').setColor(0xed4245)],
        components: [],
      });
    }

    const idx = parseInt(btn.customId.replace('search_pick_', ''), 10);
    const track = { ...results[idx], requestedBy: interaction.user.tag };

    let queue = client.musicQueues.get(interaction.guildId);
    if (!queue) {
      queue = createQueue(interaction.guildId, voiceCh, interaction.channelId);
      client.musicQueues.set(interaction.guildId, queue);
      queue.connection = connectToChannel(voiceCh, interaction.guild.voiceAdapterCreator);
      initPlayer(client, interaction.guildId);
    }
    queue.tracks.push(track);

    if (!queue.isPlaying) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setDescription('▶️ جاري التشغيل...').setColor(0x1db954)], components: [] });
      await playNext(client, interaction.guildId);
    } else {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ تمت الإضافة')
            .setDescription(`**[${track.title}](${track.url})**\n👤 ${track.author}`)
            .setThumbnail(track.thumbnail)
            .setColor(0x1db954)
            .setFooter({ text: `الموضع: #${queue.tracks.length}` }),
        ],
        components: [],
      });
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') interaction.editReply({ components: [] }).catch(() => {});
  });
}
