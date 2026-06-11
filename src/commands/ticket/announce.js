import {
  ChatInputCommandInteraction, SlashCommandBuilder,
  PermissionsBitField, EmbedBuilder, TextChannel, ChannelType,
} from "discord.js";
import { COLOR } from "../../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("announce")
  .setDescription("📢 إرسال إعلان رسمي احترافي")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)

  .addStringOption((o) => o.setName("title").setDescription("📌 عنوان الإعلان").setRequired(true).setMaxLength(200))
  .addStringOption((o) => o.setName("message").setDescription("📝 نص الإعلان الرئيسي").setRequired(true).setMaxLength(2000))

  .addChannelOption((o) => o.setName("channel").setDescription("📣 القناة المستهدفة (افتراضي: الحالية)").addChannelTypes(ChannelType.GuildText).setRequired(false))
  .addStringOption((o) =>
    o.setName("mention").setDescription("📢 من تريد منشنه؟").setRequired(false)
     .addChoices(
       { name: "@everyone", value: "everyone" },
       { name: "@here",     value: "here" },
       { name: "لا أحد",   value: "none" },
     )
  )
  .addRoleOption((o) => o.setName("mention_role").setDescription("🏷️ منشن رتبة معينة").setRequired(false))

  .addStringOption((o) =>
    o.setName("color").setDescription("🎨 لون الإعلان").setRequired(false)
     .addChoices(
       { name: "🔵 أزرق (افتراضي)", value: "blue"   },
       { name: "🔴 أحمر",           value: "red"    },
       { name: "🟡 ذهبي",           value: "gold"   },
       { name: "🟢 أخضر",           value: "green"  },
       { name: "⚫ أسود",           value: "black"  },
       { name: "🟣 بنفسجي",         value: "purple" },
       { name: "🟠 برتقالي",        value: "orange" },
     )
  )

  .addStringOption((o) => o.setName("image").setDescription("🖼️ رابط صورة كبيرة في الإعلان").setRequired(false))
  .addStringOption((o) => o.setName("thumbnail").setDescription("🖼️ رابط صورة صغيرة (جانب الإعلان)").setRequired(false))
  .addStringOption((o) => o.setName("footer").setDescription("📎 نص Footer مخصص").setRequired(false).setMaxLength(100))
  .addStringOption((o) => o.setName("type").setDescription("📋 نوع الإعلان").setRequired(false)
    .addChoices(
      { name: "📢 إعلان عام",        value: "general"     },
      { name: "🔧 صيانة",           value: "maintenance"  },
      { name: "✅ تحديث/إصدار",     value: "update"       },
      { name: "🚨 تحذير",           value: "warning"      },

      { name: "📋 قواعد",           value: "rules"        },
    )
  )
  .addBooleanOption((o) => o.setName("timestamp").setDescription("⏰ إظهار التوقيت؟ (افتراضي: نعم)").setRequired(false));

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const title     = interaction.options.getString("title", true);
  const message   = interaction.options.getString("message", true);
  const target    = interaction.options.getChannel("channel") ?? interaction.channel;
  const colorKey  = interaction.options.getString("color") ?? "blue";
  const mention   = interaction.options.getString("mention") ?? "none";
  const mentionRole = interaction.options.getRole("mention_role");
  const image     = interaction.options.getString("image");
  const thumbnail = interaction.options.getString("thumbnail");
  const footerTxt = interaction.options.getString("footer");
  const type      = interaction.options.getString("type") ?? "general";
  const showTime  = interaction.options.getBoolean("timestamp") ?? true;

  const colorMap = {
    blue: COLOR.blue, red: COLOR.red, gold: COLOR.gold,
    green: COLOR.green, black: COLOR.black, purple: COLOR.purple, orange: COLOR.orange,
  };

  const typeMap = {
    general:     { emoji: "📢", label: "إعلان",   color: COLOR.blue   },
    maintenance: { emoji: "🔧", label: "صيانة",   color: COLOR.orange },
    update:      { emoji: "✅", label: "تحديث",   color: COLOR.green  },
    warning:     { emoji: "🚨", label: "تحذير",   color: COLOR.red    },

    rules:       { emoji: "📋", label: "قواعد",   color: COLOR.purple },
  };

  const typeInfo  = typeMap[type] ?? typeMap.general;
  const finalColor = colorMap[colorKey] ?? typeInfo.color;

  const embed = new EmbedBuilder()
    .setColor(finalColor)
    .setTitle(`${typeInfo.emoji}  ${title}`);

  embed.setDescription(
    [
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      message,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ].join("\n")
  );

  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image)     embed.setImage(image);

  const footerBase = footerTxt ?? `FX9 — ${typeInfo.label} • بواسطة: ${interaction.user.username}`;
  embed.setFooter({ text: footerBase, iconURL: interaction.user.displayAvatarURL() });

  if (showTime) embed.setTimestamp();

  let content;
  if (mention === "everyone")    content = "@everyone";
  else if (mention === "here")   content = "@here";
  else if (mentionRole)          content = `<@&${mentionRole.id}>`;

  await target.send({ content, embeds: [embed] });

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR.green)
        .setTitle("✅ تم إرسال الإعلان")
        .addFields(
          { name: "📣 القناة", value: `<#${target.id}>`, inline: true },
          { name: "📋 النوع",  value: typeInfo.label,     inline: true },
          { name: "🎨 اللون",  value: colorKey,           inline: true },
          { name: "📢 المنشن", value: content ?? "لا يوجد", inline: true },
        )
        .setTimestamp(),
    ],
  });
}
