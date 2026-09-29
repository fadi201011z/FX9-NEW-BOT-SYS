// ════════════════════════════════════════════════════════════════════════
//  ⚜️  قسيم البريميوم — يظهر للعضو فور دخوله السيرفر
//
//  ✅ الهيكل احترافي ومحتواه «فارغ» — جاهز لاستقبال التفاصيل
//  📌 عند إخبارك بما تريد إضافته، تُعبَّأ الأقسام المعلّمة أدناه فقط.
// ════════════════════════════════════════════════════════════════════════

import { EmbedBuilder } from 'discord.js';
import { COLOR } from './embeds.js';

/**
 * يُنشئ قسيم البريميوم الاحترافي الخاص بالعضو الجديد.
 * @param {{ member: import('discord.js').GuildMember, guild: import('discord.js').Guild }} opts
 * @returns {Promise<EmbedBuilder>}
 */
export async function generatePremiumCard({ member, guild }) {
  const user      = member.user ?? member;
  const avatarURL = user.displayAvatarURL({ dynamic: true, size: 512 });
  const guildIcon = guild.iconURL({ dynamic: true, size: 256 });

  const embed = new EmbedBuilder()
    // ─── هوية القسيم ─────────────────────────────────────────────────
    .setColor(COLOR.gold)                       // ذهبي فاخر = طابع بريميوم
    .setAuthor({
      name: '⚜️ FX9 Premium',
      iconURL: guildIcon ?? avatarURL,
    })
    .setThumbnail(avatarURL)                    // صورة العضو على يمين القسيم
    .setFooter({ text: '⚔️ FX9-SYS  •  Premium' })
    .setTimestamp();

  // ─── المحتوى — فارغ حالياً، يُضاف لاحقاً ─────────────────────────
  // 📝 العنوان:
  // embed.setTitle('...');

  // 📝 الوصف:
  // embed.setDescription('...');

  // 📝 المزايا (أقسام):
  // embed.addFields([
  //   { name: 'ميزة ١', value: '...', inline: true },
  //   { name: 'ميزة ٢', value: '...', inline: true },
  // ]);

  // 📝 صورة كبيرة (بانر/إعلان):
  // embed.setImage('https://...');

  return embed;
}