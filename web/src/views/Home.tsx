import { signal } from '@preact/signals';
import { IS_KID } from '../api';
import { upcoming, tasks, today, eventsOn, contests } from '../store';
import { tasksOf, daysUntil, fmtMD, fmtDow, fmtLong, progress, addDays, fmtDay, evColor, evTime, evTitle, isNotice, taskAmount, yen, MONEY_KINDS, participation, PARTICIPATION_LABEL } from '../model';
import type { Contest, Task } from '../types';
import { Icon, Pill, TypeBadge, SectionHead, Empty } from '../ui';
import { go } from '../router';

export function Home() {
  const ups = upcoming.value.slice(0, 4);
  return (
    <>
      <div class="hd">
        <span class="logo">
          <picture>
            <source srcset="./logo-w.png" media="(prefers-color-scheme: dark)" />
            <img src="./logo.png" alt="RAMUSE" class="wordmark" />
          </picture>
          {IS_KID && <span class="tag">KIDS</span>}
        </span>
        <span class="date">{fmtLong(today.value)}</span>
      </div>
      {ups.length ? <Tickets list={ups} /> : <Empty>予定している大会はありません</Empty>}
      <Week />
    </>
  );
}

const activeIdx = signal(0);
function Tickets({ list }: { list: Contest[] }) {
  const onScroll = (e: Event) => {
    const el = e.currentTarget as HTMLElement;
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return;
    const step = first.offsetWidth + 12;
    activeIdx.value = Math.min(list.length - 1, Math.max(0, Math.round(el.scrollLeft / step)));
  };
  return (
    <>
      <div class="carousel" onScroll={onScroll}>
        {list.map((c, i) => <Ticket c={c} first={i === 0} />)}
      </div>
      {list.length > 1 && <div class="pager">{list.map((_, i) => <i class={i === activeIdx.value ? 'on' : ''} />)}</div>}
    </>
  );
}

function Ticket({ c, first }: { c: Contest; first: boolean }) {
  const ts = tasksOf(tasks.value, c.ID);
  const d = daysUntil(c.開催日, today.value);
  const pg = progress(ts);
  const dayItems = ts.filter((t) => t.当日 && !t.済 && (!IS_KID || !MONEY_KINDS.includes(t.種別)));
  const tone = c.ラウンド === '決勝' ? '' : c.ラウンド === '予選' ? ' q' : ' s';
  const part = participation(c, ts);
  return (
    <button class={`ticket glass${first ? '' : tone}${part !== 'confirmed' ? ' tentative' : ''}`} onClick={() => go(`/contest/${encodeURIComponent(c.ID)}`)}>
      {first && <Icon name="emoji_events" className="bgmark" fill />}
      <div class="row1"><TypeBadge round={c.ラウンド} /><span class="kicker">{first ? '次の大会' : 'その次'}</span>
        {c.決勝ステータス === '進出決定' && <Pill tone="p-ok" icon="check_circle">進出決定</Pill>}
        {part !== 'confirmed' && <Pill tone="p-mu" icon={part === 'unentered' ? 'edit_note' : 'hourglass_empty'}>{PARTICIPATION_LABEL[part]}</Pill>}</div>
      <div class="name">{c.コンテスト名}</div>
      <div class="cd">
        {d === 0 ? <span class="big" style="font-size:40px">今日</span> : d === 1 ? <span class="big" style="font-size:40px">明日</span> : <><span class="lbl">あと</span><span class="big">{d}</span><span class="u">日</span></>}
        <span class="dt n">{fmtMD(c.開催日)}<small>{fmtDow(c.開催日)}</small></span>
      </div>
      <div class="tinfo">
        <div><span class="kicker">集合</span><span class="n">{c.集合時間 || '—'}</span></div>
        <div><span class="kicker">開始</span><span class="n">{c.開始時間 || '—'}</span></div>
        {IS_KID
          ? <div><span class="kicker">終了</span><span class="n">{c.終了時間 || '—'}</span></div>
          : <div><span class="kicker">やること</span><span class="n">{pg.done}<small>/{pg.total}</small></span></div>}
      </div>
      {c.会場 && <div class="tvenue"><Icon name="location_on" /><b>{c.会場}</b></div>}
      {dayItems.length > 0 && (
        <div class="tfoot">
          {dayItems.slice(0, 3).map((t) => <Pill tone="p-violet" icon={t.種別 === 'backup_cd' ? 'album' : 'currency_yen'}>{t.名前}{t.単価 ? ` ${yen(t.単価)}` : ''}</Pill>)}
        </div>
      )}
    </button>
  );
}

// 今週：今日から7日分。Googleカレンダーの予定＋大会＋（大人）締切
function Week() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today.value, i));
  const rows = days.map((d) => {
    const evs = eventsOn(d).filter((e) => !IS_KID || !isNotice(e));
    const cs = contests.value.filter((c) => c.開催日 === d && !c.キャンセル);
    // 大会はGoogleカレンダーにも同期されているので、カレンダー側の大会イベントは落とす
    const evsNoContest = evs.filter((e) => !(String(e.isContest) === 'true') && !cs.some((c) => e.title.includes(c.コンテスト名)));
    const dl: Task[] = IS_KID ? [] : tasks.value.filter((t) => !t.済 && !t.当日 && t.期限日 === d);
    return { d, evs: evsNoContest, cs, dl };
  }).filter((r) => r.evs.length || r.cs.length || r.dl.length);

  return (
    <div class="sec">
      <SectionHead title="今週" more="カレンダー" onMore={() => go('/calendar')} />
      <div class="glass" style="padding:6px 14px 8px">
        {rows.length === 0 && <Empty>この1週間に予定はありません</Empty>}
        {rows.map((r) => (
          <div class={`day${r.d === today.value ? ' today' : ''}`}>
            <div class="dcol"><b>{fmtDay(r.d)}</b><small>{r.d === today.value ? '今日' : fmtDow(r.d)}</small></div>
            <div class="ev">
              {r.cs.map((c) => (
                <button class="evi" onClick={() => go(`/contest/${encodeURIComponent(c.ID)}`)}>
                  <i class="c-acc" /><span class="tm">{c.集合時間 || c.開始時間 || '大会'}</span>
                  <span class="tt"><b>{c.コンテスト名}</b>{c.会場 && <small>{c.会場}</small>}</span>
                </button>
              ))}
              {r.dl.map((t) => {
                const c = contests.value.find((x) => x.ID === t.大会ID);
                return (
                  <button class="evi" onClick={() => c && go(`/contest/${encodeURIComponent(c.ID)}`)}>
                    <i class="c-green" /><span class="tm">締切</span>
                    <span class="tt">{t.名前}{c && <small>{c.コンテスト名}</small>}</span>
                    {taskAmount(t) > 0 && <span class="amt">{yen(taskAmount(t))}</span>}
                  </button>
                );
              })}
              {r.evs.map((e) => (
                <div class="evi">
                  <i class={`c-${evColor(e)}`} /><span class="tm">{evTime(e)}</span>
                  <span class="tt">{evTitle(e)}{e.location && <small>{e.location.split(',')[0]}</small>}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
