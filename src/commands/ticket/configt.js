import {
  ChatInputCommandInteraction, SlashCommandBuilder,
  PermissionsBitField, EmbedBuilder, ChannelType, TextChannel,
} from "discord.js";
import { getGuildConfig, saveGuildConfig } from "../../data/ticketDB.js";
import { panelEmbed, panelMenu, COLOR, successEmbed, errorEmbed } from "../../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("configt")
  .setDescription("⚙️ إعداد نظام التكتات FX9 — للإدارة فقط")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)

  .addSubcommand((s) => s.setName("setup").setDescription("🚀 معالج الإعداد — عرض الوضع الحالي"))

  .addSubcommand((s) =>
    s.setName("panel_channel").setDescription("📣 تعيين قناة البنل")
     .addChannelOption((o) => o.setName("channel").setDescription("القناة").addChannelTypes(ChannelType.GuildText).setRequired(true))
     .addBooleanOption((o) => o.setName("send_now").setDescription("إرسال البنل فيها الآن؟").setRequired(false))
  )

  .addSubcommand((s) =>
    s.setName("ticket_category").setDescription("📁 فئة التكتات (قناة العضو)")
     .addChannelOption((o) => o.setName("category").setDescription("الفئة").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
  )

  .addSubcommand((s) =>
    s.setName("admin_category").setDescription("🔐 فئة قنوات الإدارة (الريلاي)")
     .addChannelOption((o) => o.setName("category").setDescription("فئة مخصصة للإدارة فقط").addChannelTypes(ChannelType.GuildCategory).setRequired(false))
     .addBooleanOption((o) => o.setName("disable").setDescription("تعطيل نظام القنوات المزدوجة").setRequired(false))
  )

  .addSubcommand((s) =>
    s.setName("support_role").setDescription("🛡️ إدارة رتب فريق الدعم (متعددة)")
     .addStringOption((o) =>
       o.setName("action").setDescription("الإجراء").setRequired(true)
        .addChoices(
          { name: "➕ إضافة رتبة", value: "add" },
          { name: "➖ إزالة رتبة", value: "remove" },
          { name: "📋 عرض الرتب",  value: "list" },
          { name: "🗑️ مسح الكل",   value: "clear" },
        )
     )
     .addRoleOption((o) => o.setName("role").setDescription("الرتبة (مطلوبة للإضافة والإزالة)").setRequired(false))
  )

  .addSubcommand((s) =>
    s.setName("log_channel").setDescription("📋 تعيين قناة السجلات")
     .addChannelOption((o) => o.setName("channel").setDescription("القناة").addChannelTypes(ChannelType.GuildText).setRequired(true))
  )

  .addSubcommand((s) => s.setName("show").setDescription("👁️ عرض الإعدادات الحالية"))

  .addSubcommand((s) => s.setName("reset").setDescription("⚠️ مسح جميع الإعدادات — يتطلب Administrator"));

export async function execute(interaction) {
  const config = getGuildConfig(interaction.guildId);
  const sub    = interaction.options.getSubcommand();

  if (sub === "setup") {
    const checks = [
      { label: "📁 فئة تكتات الأعضاء", done: !!config.ticketCategoryId, value: config.ticketCategoryId ? `<#${config.ticketCategoryId}>` : null, fix: "`/configt ticket_category`" },
      { label: "🔐 فئة قنوات الإدارة", done: !!config.adminCategoryId,   value: config.adminCategoryId   ? `<#${config.adminCategoryId}>`   : null, fix: "`/configt admin_category` (اختياري)" },
      { label: "🛡️ رتب فريق الدعم",    done: config.supportRoleIds.length > 0, value: config.supportRoleIds.length > 0 ? config.supportRoleIds.map((id) => `<@&${id}>`).join(", ") : null, fix: "`/configt support_role action:إضافة`" },
      { label: "📋 قناة السجلات",       done: !!config.logChannelId,      value: config.logChannelId      ? `<#${config.logChannelId}>`      : null, fix: "`/configt log_channel`" },
      { label: "📣 قناة البنل",         done: !!config.panelChannelId,    value: config.panelChannelId    ? `<#${config.panelChannelId}>`    : null, fix: "`/configt panel_channel`" },
    ];
    const done  = checks.filter((c) => c.done).length;
    const bar   = "█".repeat(done) + "░".repeat(checks.length - done);
    const lines = checks.map((c) => c.done ? `✅ ${c.label}: ${c.value}` : `❌ ${c.label} — استخدم ${c.fix}`);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(done >= 3 ? COLOR.green : done >= 2 ? COLOR.orange : COLOR.red)
          .setTitle("🚀 معالج إعداد FX9")
          .setDescription([
            `**التقدم: ${done}/${checks.length}** \`[${bar}]\``,
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            ...lines,
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            done >= 3 ? "✅ **النظام جاهز للعمل!** استخدم `/panel` لإرسال البنل." : "⚠️ أكمل الإعدادات الأساسية أولاً (1، 3).",
          ].join("\n"))
          .addFields(
            { name: "🔢 إجمالي التكتات",      value: `${config.ticketCounter ?? 0}`, inline: true },
            { name: "🛡️ عدد رتب الدعم",        value: `${config.supportRoleIds.length}`, inline: true },
            { name: "🔐 نظام القنوات المزدوجة", value: config.adminCategoryId ? "✅ مفعّل" : "❌ معطّل", inline: true },
            { name: "📌 للمساعدة",             value: "`/helpt`", inline: true },
          )
          .setFooter({ text: "FX9 • Setup Wizard" })
          .setTimestamp(),
      ],
      ephemeral: true,
    });

  } else if (sub === "panel_channel") {
    const ch      = interaction.options.getChannel("channel", true);
    const sendNow = interaction.options.getBoolean("send_now") ?? false;
    config.panelChannelId = ch.id;
    saveGuildConfig(config);

    if (sendNow) {
      const tc = interaction.guild.channels.cache.get(ch.id);
      await tc?.send({ embeds: [panelEmbed()], components: [panelMenu()] });
    }
    await interaction.reply({ embeds: [successEmbed(`قناة البنل: <#${ch.id}>${sendNow ? "\n✅ تم إرسال البنل فيها." : ""}`)], ephemeral: true });

  } else if (sub === "ticket_category") {
    const ch = interaction.options.getChannel("category", true);
    config.ticketCategoryId = ch.id;
    saveGuildConfig(config);
    await interaction.reply({ embeds: [successEmbed(`فئة تكتات الأعضاء: **${ch.name}**`)], ephemeral: true });

  } else if (sub === "admin_category") {
    const disable = interaction.options.getBoolean("disable") ?? false;
    if (disable) {
      config.adminCategoryId = undefined;
      saveGuildConfig(config);
      await interaction.reply({ embeds: [successEmbed("✅ تم تعطيل نظام القنوات المزدوجة.")], ephemeral: true });
      return;
    }
    const ch = interaction.options.getChannel("category");
    if (!ch) {
      const status = config.adminCategoryId
        ? `✅ مفعّل — الفئة: <#${config.adminCategoryId}>`
        : "❌ معطّل — حدد فئة لتفعيله.";
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.purple).setTitle("🔐 نظام القنوات المزدوجة").setDescription([
        "**كيف يعمل؟**",
        "عند فتح تكت يُنشأ **قناتان**:",
        "1️⃣ **قناة العضو** — يتحدث فيها العضو، ويرى ردود الإداري من البوت.",
        "2️⃣ **قناة الإدارة** — يكتب فيها الإداري، ويرى رسائل العضو.",
        "**البوت يُرحّل الرسائل تلقائياً بين القناتين.**",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        `الحالة الحالية: ${status}`,
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "لتفعيله: `/configt admin_category category:[الفئة]`",
        "لتعطيله: `/configt admin_category disable:true`",
      ].join("\n")).setFooter({ text: "FX9 • Dual Channel Relay" })], ephemeral: true });
      return;
    }
    config.adminCategoryId = ch.id;
    saveGuildConfig(config);
    await interaction.reply({
      embeds: [successEmbed([
        `🔐 فئة الإدارة: **${ch.name}**`,
        "",
        "✅ **نظام القنوات المزدوجة مفعّل!**",
        "عند فتح كل تكت سيُنشأ تلقائياً:",
        "• قناة للعضو في فئة التكتات",
        "• قناة للإداري في هذه الفئة",
        "• الرسائل تُنقل بينهما تلقائياً",
      ].join("\n"))],
      ephemeral: true,
    });

  } else if (sub === "support_role") {
    const action = interaction.options.getString("action", true);
    const role   = interaction.options.getRole("role");

    if (action === "list") {
      const roles = config.supportRoleIds;
      if (!roles.length) {
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.orange).setTitle("🛡️ رتب فريق الدعم").setDescription("❌ لا توجد رتب مضافة حتى الآن.\nاستخدم `/configt support_role action:إضافة role:[الرتبة]`")], ephemeral: true });
        return;
      }
      const rows = roles.map((id, i) => `${i + 1}. <@&${id}> \`(${id})\``);
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(COLOR.blue).setTitle(`🛡️ رتب فريق الدعم — ${roles.length}`).setDescription(rows.join("\n")).setFooter({ text: "FX9 • Support Roles" }).setTimestamp()],
        ephemeral: true,
      });

    } else if (action === "add") {
      if (!role) { await interaction.reply({ embeds: [errorEmbed("يجب تحديد رتبة للإضافة.")], ephemeral: true }); return; }
      if (config.supportRoleIds.includes(role.id)) {
        await interaction.reply({ embeds: [errorEmbed(`<@&${role.id}> مضافة بالفعل.`)], ephemeral: true }); return;
      }
      config.supportRoleIds.push(role.id);
      saveGuildConfig(config);
      await interaction.reply({ embeds: [successEmbed(`✅ تمت إضافة <@&${role.id}> لرتب فريق الدعم.\n**المجموع: ${config.supportRoleIds.length} رتبة**`)], ephemeral: true });

    } else if (action === "remove") {
      if (!role) { await interaction.reply({ embeds: [errorEmbed("يجب تحديد رتبة للإزالة.")], ephemeral: true }); return; }
      if (!config.supportRoleIds.includes(role.id)) {
        await interaction.reply({ embeds: [errorEmbed(`<@&${role.id}> غير موجودة في القائمة.`)], ephemeral: true }); return;
      }
      config.supportRoleIds = config.supportRoleIds.filter((id) => id !== role.id);
      saveGuildConfig(config);
      await interaction.reply({ embeds: [successEmbed(`✅ تمت إزالة <@&${role.id}>.\n**المتبقية: ${config.supportRoleIds.length} رتبة**`)], ephemeral: true });

    } else if (action === "clear") {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ embeds: [errorEmbed("يتطلب صلاحية **Administrator**.")], ephemeral: true }); return;
      }
      const count = config.supportRoleIds.length;
      config.supportRoleIds = [];
      saveGuildConfig(config);
      await interaction.reply({ embeds: [successEmbed(`✅ تم مسح جميع الرتب (${count} رتبة).`)], ephemeral: true });
    }

  } else if (sub === "log_channel") {
    const ch = interaction.options.getChannel("channel", true);
    config.logChannelId = ch.id;
    saveGuildConfig(config);
    await interaction.reply({ embeds: [successEmbed(`قناة السجلات: <#${ch.id}>`)], ephemeral: true });

  } else if (sub === "show") {
    const rolesText = config.supportRoleIds.length
      ? config.supportRoleIds.map((id) => `<@&${id}>`).join(", ")
      : "❌ لا توجد رتب";

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.blue)
          .setTitle("⚙️ إعدادات FX9 Ticket System")
          .setDescription("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
          .addFields(
            { name: "📣 قناة البنل",             value: config.panelChannelId    ? `<#${config.panelChannelId}>`    : "❌", inline: true },
            { name: "📁 فئة تكتات الأعضاء",     value: config.ticketCategoryId  ? `<#${config.ticketCategoryId}>`  : "❌", inline: true },
            { name: "🔐 فئة قنوات الإدارة",     value: config.adminCategoryId   ? `<#${config.adminCategoryId}>`   : "❌ معطّل", inline: true },
            { name: "📋 قناة السجلات",           value: config.logChannelId      ? `<#${config.logChannelId}>`      : "❌", inline: true },
            { name: "🔢 عداد التكتات",           value: `${config.ticketCounter ?? 0}`, inline: true },
            { name: "🟢 حالة النظام",            value: config.ticketCategoryId && config.supportRoleIds.length > 0 ? "✅ جاهز" : "⚠️ يحتاج إعداداً", inline: true },
            { name: "🔐 نظام الريلاي المزدوج",  value: config.adminCategoryId ? "✅ مفعّل" : "❌ معطّل", inline: true },
            { name: `🛡️ رتب الدعم (${config.supportRoleIds.length})`, value: rolesText },
            { name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n💡 أوامر مفيدة", value: [
              "`/configt setup` — معالج الإعداد",
              "`/configt support_role action:إضافة` — إضافة رتبة دعم",
              "`/configt admin_category` — معلومات الريلاي",
              "`/panel` — إرسال البنل | `/helpt` — دليل الأوامر",
            ].join("\n") },
          )
          .setFooter({ text: "FX9 • Configuration" })
          .setTimestamp(),
      ],
      ephemeral: true,
    });

  } else if (sub === "reset") {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ embeds: [errorEmbed("يلزم صلاحية **Administrator**.")], ephemeral: true }); return;
    }
    config.panelChannelId   = undefined;
    config.ticketCategoryId = undefined;
    config.adminCategoryId  = undefined;
    config.supportRoleIds   = [];
    config.logChannelId     = undefined;
    saveGuildConfig(config);
    await interaction.reply({
      embeds: [new EmbedBuilder().setColor(COLOR.red).setTitle("🔄 تم مسح الإعدادات").setDescription("تم مسح جميع الإعدادات.\nاستخدم `/configt setup` لإعادة الإعداد.").setFooter({ text: `بواسطة: ${interaction.user.username}` }).setTimestamp()],
      ephemeral: true,
    });
  }
}
