import { useMemo } from 'react';
import { TrendingUp, Trophy, CalendarClock, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deal, PipelineStage } from '@/types/database';

/**
 * The live sales board — the modern version of the whiteboard in the old
 * dealership sales meeting. Big scoreboard numerals, fed by the same realtime
 * subscription as the kanban: a card moves, the board moves.
 */

const money = (v: number) => v >= 10000 ? `$${Math.round(v / 1000)}k` : `$${v.toLocaleString()}`;

export default function SalesBoard({ deals, stages }: { deals: Deal[]; stages: PipelineStage[] }) {
  const board = useMemo(() => {
    const wonId = stages.find(s => s.name === 'Closed - Won')?.id;
    const lostId = stages.find(s => s.name === 'Closed - Lost')?.id;
    const open = deals.filter(d => d.stage_id !== wonId && d.stage_id !== lostId);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const in7 = new Date(now); in7.setDate(in7.getDate() + 7);

    const won = deals.filter(d => d.stage_id === wonId && new Date(d.updated_at) >= monthStart);
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cold = open.filter(d => new Date(d.updated_at) < sevenDaysAgo);
    const closing = open.filter(d => d.expected_close_date && new Date(d.expected_close_date) <= in7);
    const hot = open.filter(d => d.priority === 'High');
    const sum = (arr: Deal[]) => arr.reduce((s, d) => s + (Number(d.amount) || 0), 0);

    return {
      pipeline: { value: sum(open), count: open.length },
      cold: { value: sum(cold), count: cold.length },
      won: { value: sum(won), count: won.length },
      closing: { value: sum(closing), count: closing.length },
      hot: { count: hot.length },
    };
  }, [deals, stages]);

  const tiles = [
    {
      icon: TrendingUp, label: 'Active Deals', big: money(board.pipeline.value), featured: true,
      sub: board.cold.count > 0
        ? `${board.pipeline.count} active · ${money(board.cold.value)} sitting idle 7d+`
        : `${board.pipeline.count} active deal${board.pipeline.count === 1 ? '' : 's'}`,
    },
    { icon: Trophy, label: 'Won This Month', big: money(board.won.value), sub: `${board.won.count} closed`, accent: 'text-emerald-400' },
    { icon: CalendarClock, label: 'Overdue Sales Tasks', big: String(board.closing.count), sub: board.closing.value > 0 ? `${money(board.closing.value)} on the line` : 'expected closes', accent: 'text-amber-400' },
    { icon: Flame, label: 'Hot Leads', big: String(board.hot.count), sub: 'close within a week', accent: 'text-red-400' },
  ];

  return (
    <div className="mb-5 shrink-0">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
        <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-ink-400 font-mono">Live Sales Board</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={cn(
              'rounded-xl border p-4 flex flex-col justify-between min-h-[104px]',
              t.featured
                ? 'border-brand-500/40 bg-brand-500/[0.08] shadow-sm'
                : 'border-ink-700 bg-ink-900'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">{t.label}</span>
              <t.icon className={cn('w-4 h-4 shrink-0', t.featured ? 'text-brand-400' : t.accent ?? 'text-ink-500')} />
            </div>
            <div>
              <div className={cn('font-mono font-bold tracking-tight leading-none', t.featured ? 'text-[30px] text-brand-300' : 'text-[26px] text-ink-100')}>
                {t.big}
              </div>
              <div className="text-[11px] text-ink-500 mt-1.5 truncate">{t.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
