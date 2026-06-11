import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';
import { Colors } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('serverinfo')
  .setDescription('معلومات تفصيلية عن السيرفر الحالي');

export async function execute(interaction) {
  await interaction.deferReply();
  const guild = interaction.guild;
  await guild.members.fetch().catch(() => {});

  const owner      = await guild.fetchOwner().catch(() => null);
  const humans     = guild.members.cache.filter(m => !m.user.bot).size;
  const bots       = guild.members.cache.filter(m => m.user.bot).size;
  const textCh     = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
  const voiceCh    = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
  const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
  const roles      = guild.roles.cache.size - 1;
  const boosters   = guild.premiumSubscriptionCount ?? 0;
  const boostTier  = guild.premiumTier;

  const verificationLevels = { 0: 'بدون', 1: 'منخفض', 2: 'متوسط', 3: 'عالي', 4: 'أعلى' };

  const embed = new EmbedBuilder()
    .setColor(Colors.DARK)
    .setTitle(`🏠  ${guild.name}`)
    .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: '👑  المالك',          value: owner ? `${owner.user.tag}` : 'غير معروف',                              inline: true },
      { name: '🆔  معرّف السيرفر',   value: `\`${guild.id}\``,                                                      inline: true },
      { name: '📅  تاريخ الإنشاء',   value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,                   inline: true },
      { name: '👥  إجمالي الأعضاء',  value: `${guild.memberCount}`,                                                  inline: true },
      { name: '🧑  بشر',             value: `${humans}`,                                                             inline: true },
      { name: '🤖  بوتات',           value: `${bots}`,                                                              inline: true },
      { name: '💬  قنوات نصية',      value: `${textCh}`,                                                            inline: true },
      { name: '🎤  قنوات صوتية',     value: `${voiceCh}`,                                                           inline: true },
      { name: '📁  تصنيفات',         value: `${categories}`,                                                         inline: true },
      { name: '🏷️  أدوار',           value: `${roles}`,                                                             inline: true },
      { name: '🔐  مستوى التحقق',    value: verificationLevels[guild.verificationLevel] ?? 'غير معروف',             inline: true },
      { name: '✨  مستوى البوست',    value: `المستوى ${boostTier} (${boosters} بوست)`,                             inline: true },
    )
    .setTimestamp()
    .setFooter({ text: '⚔️ FX9-SYS  •  معلومات السيرفر' });

  if (guild.bannerURL()) embed.setImage(guild.bannerURL({ size: 1024 }));

  await interaction.editReply({ embeds: [embed] });
}
