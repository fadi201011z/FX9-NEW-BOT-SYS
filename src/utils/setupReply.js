/**
 * setupReply.js — the confirmation shape shared by the six `/setup-*` commands.
 *
 * Five of them do the same thing: store one or more channel IDs, then confirm.
 * Keeping the wording and layout in one place is what stops the set drifting
 * apart — the old versions had six different titles and three different footers
 * for what a reader experiences as one action.
 */

import { notice, field, C, EPHEMERAL } from './embeds.js';

/**
 * @param {object}   opts
 * @param {string}   opts.title       headline, e.g. '📋 Server log'
 * @param {string}   opts.emoji
 * @param {Array<{label:string, mention:string, id:string}>} opts.channels
 *        what was configured, in display order
 * @param {string}   [opts.records]   what gets written to that channel
 * @param {string}   [opts.tip]       where the related setting lives
 * @returns an interaction.reply() payload
 */
export function channelSetReply({ title, emoji, channels, records, tip }) {
  const fields = channels.map((c) => field(c.label, `${c.mention}\n\`${c.id}\``));

  if (records) fields.push(field('📋 What gets logged', `> ${records}`, false));
  if (tip) fields.push(field('💡 Related', `> ${tip}`, false));

  return {
    embeds: [notice({
      title: `${emoji} ${title}`,
      color: C.ok,
      fields,
      footer: 'Kratos System • Setup',
      timestamp: true,
    })],
    flags: EPHEMERAL,
  };
}