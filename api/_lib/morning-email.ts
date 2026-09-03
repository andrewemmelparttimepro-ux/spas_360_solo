/**
 * The emailed Morning Summary. Same numbers as the dashboard panel, laid out
 * for an inbox: headline, Ari's read, everyone's day, then deals / service /
 * activity. Table-based HTML so it holds up in Gmail and Apple Mail.
 */
export interface EmailSummary {
  day: string;
  staff: {
    name: string;
    punches: { clock_in: string; clock_out: string | null; reason: string | null; acknowledged_incomplete_count: number; acknowledged_titles: string[]; owner_adjusted: boolean }[];
    minutes_total: number;
    delegated_completed: { title: string }[];
    delegated_open: { title: string; due_at: string | null; overdue: boolean }[];
    delegated_sent: number;
  }[];
  delegated: { created: number; completed: number; open: number; overdue: number };
  deals: { created: { title: string; amount: number | null; owner: string }[]; won: { title: string; amount: number | null; owner: string }[]; lost: { title: string; amount: number | null; reason: string | null }[]; stage_changes: number };
  jobs: { completed: { title: string; job_type: string }[]; created: number; scheduled_today: { title: string; job_type: string; scheduled_at: string; all_day: boolean }[] };
  activity: { new_customers: number; inbound_texts: number; suggestions: number; fix_it_posts: number; clocked_in_count: number; incomplete_clock_outs: number };
}

const TZ = 'America/Chicago';
const esc = (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const time = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '—';
const money = (value: number | null) => value == null ? '—' : `$${Math.round(value).toLocaleString('en-US')}`;
const hours = (minutes: number) => minutes > 0 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m` : '—';

export function summaryDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function summaryHeadline(summary: EmailSummary): string {
  const won = summary.deals.won.length;
  const parts = [
    `${summary.activity.clocked_in_count} clocked in`,
    `${summary.delegated.completed} task${summary.delegated.completed === 1 ? '' : 's'} done`,
    `${summary.delegated.open} still open`,
    `${won} deal${won === 1 ? '' : 's'} won`,
  ];
  if (summary.activity.incomplete_clock_outs > 0) parts.push(`${summary.activity.incomplete_clock_outs} clocked out with open tasks`);
  return parts.join(' · ');
}

export function morningEmailSubject(summary: EmailSummary): string {
  return `Morning Summary — ${summaryDayLabel(summary.day)}: ${summaryHeadline(summary)}`;
}

export function morningEmailText(summary: EmailSummary, narration: string | null, appUrl: string): string {
  const lines = [`Morning Summary for ${summaryDayLabel(summary.day)}`, summaryHeadline(summary), ''];
  if (narration) lines.push(`Ari's read: ${narration}`, '');
  lines.push("Everyone's day");
  for (const person of summary.staff) {
    const punches = person.punches.length ? person.punches.map(p => `${time(p.clock_in)}–${time(p.clock_out)}`).join(', ') : 'no punch';
    const flags = person.punches.filter(p => p.acknowledged_incomplete_count > 0).length ? ' · clocked out with open tasks' : '';
    lines.push(`- ${person.name}: ${punches} · ${hours(person.minutes_total)} · ${person.delegated_completed.length} done · ${person.delegated_open.length} open${flags}`);
  }
  lines.push('', `Deals: ${summary.deals.won.length} won, ${summary.deals.lost.length} lost, ${summary.deals.created.length} new, ${summary.deals.stage_changes} stage moves`);
  lines.push(`Service: ${summary.jobs.completed.length} completed, ${summary.jobs.scheduled_today.length} on the board today`);
  lines.push(`Activity: ${summary.activity.new_customers} new customers, ${summary.activity.inbound_texts} inbound texts, ${summary.activity.suggestions} suggestions`);
  lines.push('', `Open the full summary: ${appUrl}/dashboard?summary=open`);
  return lines.join('\n');
}

export function morningEmailHtml(summary: EmailSummary, narration: string | null, appUrl: string): string {
  const staffRows = summary.staff.map(person => {
    const punches = person.punches.length === 0
      ? '<span style="color:#8a94a6">No punch</span>'
      : person.punches.map(p => `${time(p.clock_in)} – ${time(p.clock_out)}${p.reason === 'lunch' ? ' (lunch)' : ''}`).join('<br>');
    const done = person.delegated_completed.length === 0 ? '<span style="color:#8a94a6">—</span>' : person.delegated_completed.map(t => `✓ ${esc(t.title)}`).join('<br>');
    const open = person.delegated_open.length === 0 ? '<span style="color:#8a94a6">—</span>' : person.delegated_open.map(t => `<span style="${t.overdue ? 'color:#b42318;font-weight:600' : ''}">${esc(t.title)}</span>`).join('<br>');
    const flagged = person.punches.filter(p => p.acknowledged_incomplete_count > 0);
    const flags = [
      flagged.length ? `<span style="color:#b7791f;font-weight:600">Clocked out with open tasks</span>` : '',
      ...flagged.map(p => `<span style="color:#8a94a6">Left open: ${esc(p.acknowledged_titles.join(', '))}</span>`),
      person.delegated_open.some(t => t.overdue) ? '<span style="color:#b42318;font-weight:600">Overdue work</span>' : '',
      person.punches.some(p => p.owner_adjusted) ? '<span style="color:#8a94a6">Time card adjusted</span>' : '',
    ].filter(Boolean).join('<br>') || '<span style="color:#1f8a5b">Clear</span>';
    return `<tr>
      <td style="padding:8px 10px;border-top:1px solid #e3e8ef;font-weight:600">${esc(person.name)}</td>
      <td style="padding:8px 10px;border-top:1px solid #e3e8ef;font-size:12px">${punches}</td>
      <td style="padding:8px 10px;border-top:1px solid #e3e8ef">${hours(person.minutes_total)}</td>
      <td style="padding:8px 10px;border-top:1px solid #e3e8ef;font-size:12px">${done}</td>
      <td style="padding:8px 10px;border-top:1px solid #e3e8ef;font-size:12px">${open}</td>
      <td style="padding:8px 10px;border-top:1px solid #e3e8ef;font-size:12px">${flags}</td>
    </tr>`;
  }).join('');

  const list = (items: string[], empty: string) => items.length ? `<ul style="margin:6px 0 0;padding-left:18px">${items.map(i => `<li style="margin:2px 0">${i}</li>`).join('')}</ul>` : `<p style="margin:6px 0 0;color:#8a94a6">${empty}</p>`;
  const deals = list([
    ...summary.deals.won.map(d => `<b style="color:#1f8a5b">Won</b> ${esc(d.title)} · ${money(d.amount)}${d.owner ? ` · ${esc(d.owner)}` : ''}`),
    ...summary.deals.lost.map(d => `<b style="color:#b42318">Lost</b> ${esc(d.title)}${d.reason ? ` · ${esc(d.reason)}` : ''}`),
    ...summary.deals.created.map(d => `<b>New</b> ${esc(d.title)}${d.owner ? ` · ${esc(d.owner)}` : ''}`),
  ], 'No deal activity.') + `<p style="margin:6px 0 0;font-size:12px;color:#8a94a6">${summary.deals.stage_changes} stage move${summary.deals.stage_changes === 1 ? '' : 's'}</p>`;
  const service = list(summary.jobs.completed.map(j => `<b style="color:#1f8a5b">Done</b> ${esc(j.title)} · ${esc(j.job_type)}`), 'No jobs completed.')
    + `<p style="margin:10px 0 0;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a94a6">On the board today</p>`
    + list(summary.jobs.scheduled_today.map(j => `${j.all_day ? 'All day' : time(j.scheduled_at)} · ${esc(j.title)} · ${esc(j.job_type)}`), 'Nothing scheduled.');
  const activity = list([
    `${summary.activity.new_customers} new customer${summary.activity.new_customers === 1 ? '' : 's'}`,
    `${summary.activity.inbound_texts} inbound text${summary.activity.inbound_texts === 1 ? '' : 's'}`,
    `${summary.delegated.created} task${summary.delegated.created === 1 ? '' : 's'} delegated`,
    `${summary.jobs.created} job${summary.jobs.created === 1 ? '' : 's'} created`,
    `${summary.activity.suggestions} suggestion${summary.activity.suggestions === 1 ? '' : 's'} · ${summary.activity.fix_it_posts} Fix-It post${summary.activity.fix_it_posts === 1 ? '' : 's'}`,
  ], '');
  const stat = (label: string, value: string | number, sub?: string) => `<td style="padding:10px 12px;border:1px solid #e3e8ef;border-radius:8px;background:#ffffff;vertical-align:top;width:25%"><div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8a94a6">${label}</div><div style="font-size:22px;font-weight:700;color:#101827;margin-top:2px">${value}</div>${sub ? `<div style="font-size:12px;color:#8a94a6">${sub}</div>` : ''}</td>`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(morningEmailSubject(summary))}</title></head>
<body style="margin:0;background:#eef3f8;font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;color:#101827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f8"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%">
  <tr><td style="background:#0f172a;color:#e6edf5;border-radius:12px;padding:18px 22px">
    <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8fb8dc">SPAS 360 · Magic City Home Leisure</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px">Morning Summary — ${esc(summaryDayLabel(summary.day))}</div>
    <div style="font-size:13px;color:#b9c6d6;margin-top:4px">${esc(summaryHeadline(summary))}</div>
  </td></tr>
  ${narration ? `<tr><td style="padding:14px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#e1eef8;border:1px solid #b6d3ea;border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.5"><span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1075b8;margin-right:6px">Ari's read</span>${esc(narration)}</td></tr></table></td></tr>` : ''}
  <tr><td style="padding:14px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
    ${stat('Clocked in', summary.activity.clocked_in_count)}
    ${stat('Tasks completed', summary.delegated.completed)}
    ${stat('Tasks still open', summary.delegated.open, summary.delegated.overdue > 0 ? `<span style="color:#b42318;font-weight:600">${summary.delegated.overdue} overdue</span>` : undefined)}
    ${stat('Deals won', summary.deals.won.length, money(summary.deals.won.reduce((total, d) => total + (d.amount ?? 0), 0)))}
  </tr></table></td></tr>
  <tr><td style="padding:16px 0 0">
    <div style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7a90;margin-bottom:6px">Everyone's day</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e3e8ef;border-radius:8px;font-size:13px;border-collapse:separate">
      <tr style="background:#f4f7fb;color:#6b7a90;font-size:10px;letter-spacing:.08em;text-transform:uppercase"><th align="left" style="padding:8px 10px">Teammate</th><th align="left" style="padding:8px 10px">Clock</th><th align="left" style="padding:8px 10px">Hours</th><th align="left" style="padding:8px 10px">Done</th><th align="left" style="padding:8px 10px">Still open</th><th align="left" style="padding:8px 10px">Flags</th></tr>
      ${staffRows}
    </table>
  </td></tr>
  <tr><td style="padding:16px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="6"><tr>
    <td style="background:#ffffff;border:1px solid #e3e8ef;border-radius:8px;padding:10px 12px;vertical-align:top;font-size:13px;width:33%"><div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1075b8">Deals</div>${deals}</td>
    <td style="background:#ffffff;border:1px solid #e3e8ef;border-radius:8px;padding:10px 12px;vertical-align:top;font-size:13px;width:33%"><div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1f8a5b">Service</div>${service}</td>
    <td style="background:#ffffff;border:1px solid #e3e8ef;border-radius:8px;padding:10px 12px;vertical-align:top;font-size:13px;width:33%"><div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6d4fc2">Activity</div>${activity}</td>
  </tr></table></td></tr>
  <tr><td align="center" style="padding:18px 0 6px"><a href="${esc(appUrl)}/dashboard?summary=open" style="display:inline-block;background:#1075b8;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:8px">Open the full summary in SPAS 360</a></td></tr>
  <tr><td style="padding:8px 0 0;font-size:11px;color:#8a94a6;text-align:center">Sent by Ari at 7:35 AM Central. Covers ${esc(summaryDayLabel(summary.day))} in Minot time.</td></tr>
</table></td></tr></table></body></html>`;
}
