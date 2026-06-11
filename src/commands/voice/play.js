import { SlashCommandBuilder } from 'discord.js';
import { searchTrack, createQueue, connectToChannel, initPlayer, playNext } from '../../handlers/music.js';
import { checkCooldown } from '../../utils/cooldown.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('تشغيل الموسيقى من يوتيوب')
  .addStringOption(o =>
    o.setName('query').setDescription('اسم الأغنية أو رابط يوتيوب').setRequired(true)
  );

export async function execute(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  const query = interaction.options.getString('query', true);
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    return interaction.editReply({ content: '❌ يجب أن تكون في قناة صوتية.' });
  }

  const rem = checkCooldown(interaction.user.id, 'play');
  if (rem > 0) return interaction.editReply({ content: `⏳ انتظر **${(rem / 1000).toFixed(1)}ث**.` });

  const tracks = await searchTrack(query, interaction.user.tag);
  if (!tracks?.length) return interaction.editReply({ content: '❌ لم يُعثر على نتائج.' });

  let queue = client.musicQueues.get(interaction.guildId);
  if (!queue) {
    queue = createQueue(interaction.guildId, voiceChannel, interaction.channelId);
    client.musicQueues.set(interaction.guildId, queue);
  }

  queue.tracks.push(...tracks);

  if (!queue.isPlaying) {
    const connection = connectToChannel(voiceChannel, interaction.guild.voiceAdapterCreator);
    queue.connection = connection;
    initPlayer(client, interaction.guildId);
    playNext(client, interaction.guildId);
  }

  await interaction.editReply({
    content: `✅ تمت إضافة **${tracks.length === 1 ? tracks[0].title : `${tracks.length} مقاطع`}** للقائمة.`,
  });
}
