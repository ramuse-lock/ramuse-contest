import { signal, effect } from '@preact/signals';
import { IS_KID } from '../api';
import { calendar, ensureMonth, monthKey, today, contests } from '../store';
import { pad, evColor, evTime, evTitle, isNotice, fmtLong, bool } from '../model';
import type { CalEvent } from '../types';
import { Icon, Glass } from '../ui';
import { go } from '../router';

const now = new Date();
const ym = signal({ y: now.getFullYear(), m: now.getMonth() + 1 });
const sel = signal<string>(today.value);

effect(() => { ensureMonth(ym.value.y, ym.value.m); });

function shift(n: number) {
  const d = new Date(ym.value.y, ym.value.m - 1 + n, 1);
  ym.value = { y: d.getFullYear(), m: d.getMonth() + 1 };
}

export function Calendar() {
  const { y, m } = ym.value;
  const events = (calendar.value[monthKey(y, m)] || []).filter((e) => !IS_KID || !isNotice(e));
  const first = new Date(y, m - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // 月曜始まり
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: { date: string; day: number; other: boolean }[] = [];
  for (let i = 0; i < startOffset; i++) {
    const d = new Date(y, m - 1, 1 - (startOffset - i));
    cells.push({ date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, day: d.getDate(), other: true });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: `${y}-${pad(m)}-${pad(d)}`, day: d, other: false });
  while (cells.length % 7) {
    const d = new Date(y, m, cells.length - startOffset - daysInMonth + 1);
    cells.push({ date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, day: d.getDate(), other: true });
  }
  const byDate = new Map<string, CalEvent[]>();
  events.forEach((e) => { const a = byDate.get(e.start) || []; a.push(e); byDate.set(e.start, a); });
  // 大会はアプリ側のデータから描くので、カレンダー側の同じ予定は二重に出さない。
  // isContest が付かない場合（新しく足した大会など）に備えて、名前でも照合する
  const isContestEvent = (e: CalEvent) =>
    bool(e.isContest) || contests.value.some((c) => c.開催日 === e.start && c.コンテスト名 && e.title.includes(c.コンテスト名));
  const selEvents = (byDate.get(sel.value) || []).slice().sort((a, b) => (evTime(a) === '終日' ? '' : evTime(a)).localeCompare(evTime(b) === '終日' ? '' : evTime(b)));
  const selContests = contests.value.filter((c) => c.開催日 === sel.value && !c.キャンセル);

  return (
    <>
      <div class="calhd">
        <button class="icnbtn" onClick={() => shift(-1)} aria-label="前の月"><Icon name="chevron_left" /></button>
        <span class="m">{m}月<small>{y}</small></span>
        <button class="icnbtn" onClick={() => shift(1)} aria-label="次の月"><Icon name="chevron_right" /></button>
      </div>
      <Glass style="padding:8px 6px 6px">
        <div class="dow"><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span>日</span></div>
        <div class="grid">
          {cells.map((c) => {
            const evs = byDate.get(c.date) || [];
            const hasContest = contests.value.some((x) => x.開催日 === c.date && !x.キャンセル);
            const colors = Array.from(new Set([...(hasContest ? ['acc'] : []), ...evs.filter((e) => !isContestEvent(e)).map(evColor)])).slice(0, 4);
            return (
              <button class={`cell${c.other ? ' o' : ''}${c.date === today.value ? ' today' : ''}${c.date === sel.value ? ' sel' : ''}`} onClick={() => { sel.value = c.date; if (c.other) { const d = new Date(c.date); ym.value = { y: d.getFullYear(), m: d.getMonth() + 1 }; } }}>
                <span>{c.day}</span>
                <span class="cdots">{colors.map((k) => <i class={`c-${k}`} />)}</span>
              </button>
            );
          })}
        </div>
      </Glass>
      <Glass className="daysheet">
        <div class="kicker"><span>{fmtLong(sel.value)}</span><span>{selContests.length + selEvents.filter((e) => !isContestEvent(e)).length}件</span></div>
        {selContests.map((c) => (
          <button class="evi" style="margin-top:6px" onClick={() => go(`/contest/${encodeURIComponent(c.ID)}`)}>
            <i class="c-acc" /><span class="tm">{c.集合時間 || c.開始時間 || '大会'}</span>
            <span class="tt"><b>{c.コンテスト名}</b>{c.会場 && <small>{c.会場}</small>}</span>
            <Icon name="chevron_right" style="color:var(--mu)" />
          </button>
        ))}
        {selEvents.filter((e) => !isContestEvent(e)).map((e) => (
          <div class="evi">
            <i class={`c-${evColor(e)}`} /><span class="tm">{evTime(e)}</span>
            <span class="tt">{evTitle(e)}{e.location && <small>{e.location.split(',')[0]}</small>}</span>
          </div>
        ))}
        {selContests.length + selEvents.length === 0 && <div class="empty" style="padding:14px 0 8px">予定はありません</div>}
      </Glass>
      <div class="legend">
        <span><i class="c-acc" />大会</span>
        <span><i class="c-orange" />自主練</span>
        <span><i class="c-teal" />レッスン・イベント</span>
        {!IS_KID && <span><i class="c-green" />お知らせ・締切</span>}
        <span><i class="c-violet" />集まり</span>
        <span><i class="c-mu" />学校など</span>
      </div>
    </>
  );
}
