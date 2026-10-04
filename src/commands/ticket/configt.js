import { SlashCommandBuilder, PermissionsBitField, ChannelType } from 'discord.js';
import { getGuildConfig, saveGuildConfig } from '../../data/ticketDB.js';
import { C, EPHEMERAL, fail, field, notice, ok, panelPayload } from '../../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('configt')
  .setDescription('⚙️ Configure the ticket system')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)

  .addSubcommand((s) => s.setName('setup').setDescription('🚀 Show what is configured and what is missing'))

  .addSubcommand((s) =>
    s.setName('panel_channel').setDescription('📣 Set the channel the ticket panel is posted in')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addBooleanOption((o) => o.setName('send_now').setDescription('Post the panel immediately?').setRequired(false)))

  .addSubcommand((s) =>
    s.setName('ticket_category').setDescription('📁 Set the category where member tickets are created')
      .addChannelOption((o) => o.setName('category').setDescription('Category').addChannelTypes(ChannelType.GuildCategory).setRequired(true)))

  .addSubcommand((s) =>
    s.setName('admin_category').setDescription('🔐 Set or disable the staff channel relay')
      .addChannelOption((o) => o.setName('category').setDescription('Category, staff-only').addChannelTypes(ChannelType.GuildCategory).setRequired(false))
      .addBooleanOption((o) => o.setName('disable').setDescription('Turn the two-channel relay off').setRequired(false)))

  .addSubcommand((s) =>
    s.setName('support_role').setDescription('🛡️ Manage which roles count as support')
      .addStringOption((o) =>
        o.setName('action').setDescription('Action').setRequired(true)
          .addChoices(
            { name: '➕ Add a role', value: 'add' },
            { name: '➖ Remove a role', value: 'remove' },
            { name: '📋 List roles', value: 'list' },
            { name: '🗑️ Remove all', value: 'clear' }))
      .addRoleOption((o) => o.setName('role').setDescription('Role — required for add and remove').setRequired(false)))

  .addSubcommand((s) =>
    s.setName('log_channel').setDescription('📋 Set the ticket archive channel')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))

  .addSubcommand((s) => s.setName('show').setDescription('👁️ Show every current setting'))

  .addSubcommand((s) => s.setName('reset').setDescription('⚠️ Clear all settings — requires Administrator'));

const UNSET = '❌ not set';

/** Renders an id as a channel mention, or a clear "not set" marker. */
const channel = (id) => (id ? `<#${id}>` : UNSET);

export async function execute(interaction) {
  const config = getGuildConfig(interaction.guildId);
  const sub    = interaction.options.getSubcommand();
  const reply  = (payload) => interaction.reply({ flags: EPHEMERAL, ...payload });

  // ── setup ────────────────────────────────────────────────────────────────
  // A checklist the owner works through, so each row carries its own fix.
  if (sub === 'setup') {
    const roles = config.supportRoleIds ?? [];
    const checks = [
      { label: '📁 Ticket category',   done: !!config.ticketCategoryId, value: channel(config.ticketCategoryId), fix: '`/configt ticket_category`' },
      { label: '🛡️ Support roles',     done: roles.length > 0, value: roles.length ? roles.map((id) => `<@&${id}>`).join(', ') : null, fix: '`/configt support_role action:add`' },
      { label: '📣 Panel channel',     done: !!config.panelChannelId, value: channel(config.panelChannelId), fix: '`/configt panel_channel`' },
      { label: '📋 Archive channel',   done: !!config.logChannelId, value: channel(config.logChannelId), fix: '`/configt log_channel`' },
      { label: '🔐 Staff channel relay', done: !!config.adminCategoryId, value: channel(config.adminCategoryId), fix: '`/configt admin_category` *(optional)*' },
    ];

    const done = checks.filter((c) => c.done).length;
    const bar  = '█'.repeat(done) + '░'.repeat(checks.length - done);
    const rows = checks.map((c) => (c.done ? `✅ ${c.label}: ${c.value}` : `❌ ${c.label} — run ${c.fix}`));

    // Two of the five are enough to be usable; three is comfortable.
    const ready = done >= 3;
    const usable = done >= 2;

    return reply({
      embeds: [notice({
        title: '🚀 Ticket system — setup progress',
        color: ready ? C.ok : usable ? C.warn : C.error,
        description: `**${done} of ${checks.length} configured**  \`[${bar}]\`\n${rows.join('\n')}\n`
          + (ready
            ? '✅ Ready to use. Run `/panel` to post the panel.'
            : '⚠️ Finish the basics first — a ticket category and support roles.'),
        fields: [
          field('Tickets created', `${config.ticketCounter ?? 0}`),
          field('Support roles', `${roles.length}`),
          field('Two-channel relay', config.adminCategoryId ? '✅ Enabled' : '❌ Disabled'),
          field('Need more?', '`/helpt`'),
        ],
        footer: 'Kratos System • Setup',
        timestamp: true,
      })],
    });
  }

  // ── panel_channel ────────────────────────────────────────────────────────
  if (sub === 'panel_channel') {
    const ch      = interaction.options.getChannel('channel', true);
    const sendNow = interaction.options.getBoolean('send_now') ?? false;

    config.panelChannelId = ch.id;
    saveGuildConfig(config);

    if (sendNow) {
      const target = interaction.guild.channels.cache.get(ch.id);
      await target?.send(panelPayload(interaction.guildId));
    }

    return reply(ok(sendNow
      ? `Panel channel set to <#${ch.id}> — the panel has been posted.`
      : `Panel channel set to <#${ch.id}>.`));
  }

  // ── ticket_category ──────────────────────────────────────────────────────
  if (sub === 'ticket_category') {
    const ch = interaction.options.getChannel('category', true);
    config.ticketCategoryId = ch.id;
    saveGuildConfig(config);
    return reply(ok(`Ticket category set to **${ch.name}**.`));
  }

  // ── admin_category ───────────────────────────────────────────────────────
  if (sub === 'admin_category') {
    if (interaction.options.getBoolean('disable')) {
      config.adminCategoryId = undefined;
      saveGuildConfig(config);
      return reply(ok('Two-channel relay disabled.'));
    }

    const ch = interaction.options.getChannel('category');
    if (!ch) {
      return reply({
        embeds: [notice({
          title: '🔐 Two-channel relay',
          description: 'When enabled, every ticket gets **two** channels:',
          color: C.accent,
          fields: [
            field('1️⃣ Member channel', 'Created in the ticket category. The member writes here and sees staff replies relayed by the bot.', false),
            field('2️⃣ Staff channel', 'Created in the category you choose here. Staff write here and see the member’s messages relayed.', false),
            field('Status', config.adminCategoryId ? `✅ Enabled — <#${config.adminCategoryId}>` : '❌ Disabled', false),
          ],
          footer: 'Kratos System • Ticket relay',
          timestamp: true,
        })],
      });
    }

    config.adminCategoryId = ch.id;
    saveGuildConfig(config);

    return reply({
      embeds: [notice({
        title: '🔐 Two-channel relay enabled',
        description: 'Each ticket will now create:',
        color: C.ok,
        fields: [
          field('Member channel', `in <#${config.ticketCategoryId ?? '—'}>`, false),
          field('Staff channel', `in <#${ch.id}>`, false),
          field('Relaying', 'Messages are relayed between them automatically.', false),
        ],
        footer: 'Kratos System • Ticket relay',
        timestamp: true,
      })],
    });
  }

  // ── support_role ─────────────────────────────────────────────────────────
  if (sub === 'support_role') {
    const action = interaction.options.getString('action', true);
    const role   = interaction.options.getRole('role');
    const roles  = config.supportRoleIds ?? [];

    if (action === 'list') {
      if (roles.length === 0) {
        return reply(ok('No support roles configured yet.\n'
          + 'Add one with `/configt support_role action:add role:@role`.'));
      }

      return reply({
        embeds: [notice({
          title: `🛡️ Support roles — ${roles.length}`,
          color: C.info,
          fields: [field('Roles', roles
            .map((id, i) => `${i + 1}. <@&${id}> \`${id}\``)
            .join('\n'), false)],
          footer: 'Kratos System • Ticket system',
          timestamp: true,
        })],
      });
    }

    if (action === 'add') {
      if (!role) return reply(fail('Pick a role to add.'));
      if (roles.includes(role.id)) return reply(fail(`<@&${role.id}> is already a support role.`));

      roles.push(role.id);
      config.supportRoleIds = roles;
      saveGuildConfig(config);

      return reply(ok(`Added <@&${role.id}> to the support team. **${roles.length}** role${roles.length === 1 ? '' : 's'} now.`));
    }

    if (action === 'remove') {
      if (!role) return reply(fail('Pick a role to remove.'));
      if (!roles.includes(role.id)) return reply(fail(`<@&${role.id}> is not a support role.`));

      config.supportRoleIds = roles.filter((id) => id !== role.id);
      saveGuildConfig(config);

      return reply(ok(`Removed <@&${role.id}>. **${config.supportRoleIds.length}** role${config.supportRoleIds.length === 1 ? '' : 's'} left.`));
    }

    // clear
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return reply(fail('This requires the **Administrator** permission.'));
    }

    const count = roles.length;
    config.supportRoleIds = [];
    saveGuildConfig(config);

    return reply(ok(`Removed all support roles (${count} removed).`));
  }

  // ── log_channel ──────────────────────────────────────────────────────────
  if (sub === 'log_channel') {
    const ch = interaction.options.getChannel('channel', true);
    config.logChannelId = ch.id;
    saveGuildConfig(config);
    return reply(ok(`Ticket archive set to <#${ch.id}>.`));
  }

  // ── show ─────────────────────────────────────────────────────────────────
  if (sub === 'show') {
    const roles = config.supportRoleIds ?? [];
    const ready = config.ticketCategoryId && roles.length > 0;

    return reply({
      embeds: [notice({
        title: '⚙️ Ticket system — current settings',
        color: ready ? C.ok : C.warn,
        fields: [
          field('📣 Panel channel', channel(config.panelChannelId)),
          field('📁 Ticket category', channel(config.ticketCategoryId)),
          field('📋 Archive channel', channel(config.logChannelId)),
          field('🔐 Staff relay', config.adminCategoryId ? `<#${config.adminCategoryId}>` : '❌ Disabled'),
          field('🔢 Tickets created', `${config.ticketCounter ?? 0}`),
          field('🛡️ Support roles', roles.length ? roles.map((id) => `<@&${id}>`).join(', ') : UNSET),
          field('Status', ready ? '✅ Ready' : '⚠️ Needs setup'),
          field('Next step', '`/configt setup` — see exactly what is missing', false),
        ],
        footer: 'Kratos System • Ticket system',
        timestamp: true,
      })],
    });
  }

  // ── reset ────────────────────────────────────────────────────────────────
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return reply(fail('This requires the **Administrator** permission.'));
  }

  config.panelChannelId   = undefined;
  config.ticketCategoryId = undefined;
  config.adminCategoryId  = undefined;
  config.supportRoleIds   = [];
  config.logChannelId     = undefined;
  saveGuildConfig(config);

  return reply({
    embeds: [notice({
      title: '🔄 Ticket settings cleared',
      color: C.error,
      description: 'Every setting has been reset.\nRun `/configt setup` to configure it again.',
      footer: `Kratos System • by ${interaction.user.username}`,
      timestamp: true,
    })],
  });
}