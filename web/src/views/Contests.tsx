import { signal } from '@preact/signals';
import { IS_KID } from '../api';
import { upcoming, past, tasks, today } from '../store';
import { tasksOf, progress, nearestDeadline, daysUntil, fmtDay, fmtDow, parseDate, MONEY_KINDS, yen, taskAmount, roundClass } from '../model';
import type { Contest } from '../types';
import { Icon, Pill, TypeBadge, Glass } from '../ui';
import { go } from '../router';

const seg = signal<'up' | 'past'>('up');

export function Contests() {
  const list = seg.value === 'up' ? upcoming.value : past.value;
  const groups: { key: string; label: string; items: Contest[] }[] = [];
  list.forEach((c) => {
    const d = parseDate(c.開催日)!;
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    const thisYear = new Date().getFullYear();
    const label = d.getFullYear() === thisYear ? `${d.getMonth() + 1}月` : `${d.getFullYear()}年${d.getMonth() + 1}月`;
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, label, items: [] }; groups.push(g); }
    g.items.push(c);
  });
  return (
    <>
      <div class="hd"><span class="title">大会</span></div>
      <div class="seg">
        <button class={seg.value === 'up' ? 'on' : ''} onClick={() => (seg.value = 'up')}>{IS_KID ? 'これから' : '開催予定'} <span class="n">{upcoming.value.length}</span></button>
        <button class={seg.value === 'past' ? 'on' : ''} onClick={() => (seg.value = 'past')}>{IS_KID ? 'おわった' : '過去'} <span class="n">{past.value.length}</span></button>
      </div>
      {seg.value === 'past' && <YearStats />}
      {groups.map((g) => (
        <>
          <div class="month">{g.label}</div>
          {g.items.map((c) => <Card c={c} pastMode={seg.value === 'past'} />)}
        </>
      ))}
      {list.length === 0 && <div class="empty">大会がありません</div>}
      {!IS_KID && <button class="fab" aria-label="大会を追加" onClick={() => alert('大会の追加はフェーズ3で実装します')}><Icon name="add" /></button>}
    </>
  );
}

function Card({ c, pastMode }: { c: Contest; pastMode: boolean }) {
  const ts = tasksOf(tasks.value, c.ID);
  const pg = progress(ts);
  const near = nearestDeadline(ts, today.value);
  const dayItem = ts.find((t) => t.当日 && !t.済 && t.種別 === 'backup_cd');
  const fee = ts.find((t) => t.種別 === 'entry_fee' && t.当日 && !t.済);
  const finalLink = c.ラウンド === '予選' && c.シリーズ名 ? findFinal(c) : null;
  return (
    <button class="ccard glass" onClick={() => go(`/contest/${encodeURIComponent(c.ID)}`)}>
      <div class={`dtile ${tileTone(c.ラウンド)}`}><b>{fmtDay(c.開催日)}</b><small>{fmtDow(c.開催日)}</small></div>
      <div class="cb">
        <div class="cn">{c.コンテスト名}</div>
        <div class="cm"><TypeBadge round={c.ラウンド} />{c.会場 && <><Icon name="location_on" />{c.会場}</>}{!c.会場 && c.開始時間 && <><Icon name="schedule" />{c.開始時間}{c.終了時間 && ` – ${c.終了時間}`}</>}</div>
        {pastMode ? (
          <div class="prog">
            {c.結果 ? <Pill tone={/入賞|優勝/.test(c.結果) ? 'p-acc' : /通過|進出/.test(c.結果) ? 'p-ok' : 'p-mu'} icon={/入賞|優勝/.test(c.結果) ? 'emoji_events' : undefined}>{resultText(c)}</Pill> : <Pill tone="p-mu">結果 未入力{c.総組数 ? ` · ${c.総組数}組` : ''}</Pill>}
            {finalLink && <span class="pill p-acc" style="margin-left:auto"><Icon name="arrow_forward" />{fmtDay(finalLink.開催日) ? `${parseDate(finalLink.開催日)!.getMonth() + 1}/${fmtDay(finalLink.開催日)} 決勝` : '決勝'}</span>}
          </div>
        ) : (
          <div class="prog">
            {!IS_KID && pg.total > 0 && <><span class="dots">{ts.map((t) => <i class={t.済 ? 'on' : ''} />)}</span><small>{pg.done}/{pg.total}</small></>}
            {IS_KID && c.集合時間 && <small>集合 {c.集合時間}</small>}
            {orderText(c) && <Pill tone="p-blue" icon="format_list_numbered">{orderText(c)}</Pill>}
            {!IS_KID && near && daysUntil(near.期限日, today.value) <= 14
              ? <Pill tone="p-wn" icon="alarm">{fmtMonthDay(near.期限日)} {shortName(near.名前)}</Pill>
              : dayItem ? <Pill tone="p-violet" icon="album">当日CD</Pill>
              : (!IS_KID && fee) ? <Pill tone="p-mu">{yen(taskAmount(fee) / (Number(fee.数量) || 1))} 当日</Pill>
              : null}
          </div>
        )}
      </div>
    </button>
  );
}

// 「32組中1番」／「35組中5位（予選通過）」の表記
function orderText(c: Contest): string {
  const n = Number(c.総組数) || 0, o = Number(c.出演順) || 0;
  if (o && n) return `${n}組中${o}番`;
  if (o) return `${o}番目`;
  if (n) return `${n}組`;
  return '';
}
function resultText(c: Contest): string {
  const n = Number(c.総組数) || 0;
  const detail = String(c.結果詳細 || '').trim();
  if (detail && n) return `${n}組中${detail}（${c.結果}）`;
  if (detail) return `${detail}（${c.結果}）`;
  if (n) return `${c.結果} · ${n}組`;
  return c.結果;
}

function findFinal(c: Contest) {
  const all = [...upcoming.value, ...past.value];
  return all.find((x) => x.ラウンド === '決勝' && x.シリーズ名 === c.シリーズ名) || null;
}
function tileTone(round: string) { return round === '決勝' ? 't-acc' : round === '予選' ? 't-violet' : 't-blue'; }
function fmtMonthDay(s: string) { const d = parseDate(s); return d ? `${d.getMonth() + 1}/${d.getDate()}` : ''; }
function shortName(s: string) { return s.replace(/ (事前振込|振込|事前|持参)$/, ''); }

function YearStats() {
  const y = new Date().getFullYear();
  const list = past.value.filter((c) => c.開催日.startsWith(String(y)));
  const prize = list.filter((c) => /入賞|優勝/.test(c.結果)).length;
  const pass = list.filter((c) => /通過|進出/.test(c.結果)).length;
  return (
    <Glass className="result" style="margin-bottom:10px;background:radial-gradient(120% 120% at 100% 0%,rgba(242,210,76,.35),transparent 60%),var(--sfc)">
      <div style="flex:1">
        <div class="kicker">{y}年の結果</div>
        <div class="stats3">
          <div><span class="big">{prize}</span><small>入賞</small></div>
          <div><span class="big">{pass}</span><small>予選通過</small></div>
          <div><span class="big">{list.length}</span><small>出場</small></div>
        </div>
      </div>
      <Icon name="emoji_events" fill style="font-size:44px;color:var(--acc);opacity:.6" />
    </Glass>
  );
}
export { roundClass, MONEY_KINDS };
