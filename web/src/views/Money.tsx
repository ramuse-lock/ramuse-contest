import { signal } from '@preact/signals';
import { ledger, families, contests } from '../store';
import { computeBalance, yen, fmtMD, fmtDow, famJa, itemsOf, owedOf, ledgerIcon, parseDate, num } from '../model';
import type { Ledger } from '../types';
import { Icon, Glass, Avatar, WhoChips, SectionHead, Pill } from '../ui';
import { openModal } from '../modal';
import { go } from '../router';

const limit = signal(40);
const showSettle = signal(false);
const expanded = signal<Record<string, boolean>>({});

// 「精算 Airi → Rinka（NUMBER 2026）」のような内容の英名を日本語に
function jaNames(s: string, fams: string[]) {
  return fams.reduce((acc, f) => acc.replace(new RegExp(f, 'g'), famJa(f)), s);
}

type Entry = { kind: 'row'; l: Ledger } | { kind: 'settle'; date: string; rows: Ledger[] };
type Group = { key: string; label: string; entries: Entry[] };

// 日付の新しい順に月で区切る。同じ日の精算はひとまとめ（移行分の精算で埋まらないように）
function buildGroups(rows: Ledger[]): Group[] {
  const sorted = rows.slice().sort((a, b) => (a.日付 > b.日付 ? -1 : a.日付 < b.日付 ? 1 : 0));
  const groups: Group[] = [];
  const thisYear = new Date().getFullYear();
  sorted.forEach((l) => {
    const d = parseDate(l.日付);
    const key = d ? `${d.getFullYear()}-${d.getMonth() + 1}` : '—';
    const label = !d ? '日付なし' : d.getFullYear() === thisYear ? `${d.getMonth() + 1}月` : `${d.getFullYear()}年${d.getMonth() + 1}月`;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, label, entries: [] }; groups.push(g); }
    if (l.種別 !== 'settle') { g.entries.push({ kind: 'row', l }); return; }
    // 同じ日の精算は、間に立替がはさまっていても1つにまとめる
    const found = g.entries.find((e) => e.kind === 'settle' && e.date === l.日付);
    if (found && found.kind === 'settle') found.rows.push(l);
    else g.entries.push({ kind: 'settle', date: l.日付, rows: [l] });
  });
  return groups;
}

export function Money() {
  const fams = families.value;
  const bal = computeBalance(ledger.value, fams);
  const all = ledger.value.filter((l) => showSettle.value || l.種別 !== 'settle');
  const groups = buildGroups(all);
  const y = new Date().getFullYear();
  const yearTotal = ledger.value.filter((l) => String(l.日付).startsWith(String(y)) && l.種別 !== 'settle').reduce((s, l) => s + num(l.合計), 0);
  const receivers = fams.filter((f) => bal.net[f] > 0);
  let shown = 0;
  return (
    <>
      <div class="hd"><span class="title">お金</span><button class="icnbtn" aria-label="設定" onClick={() => go('/settings')}><Icon name="settings" /></button></div>
      <Glass className="balcard">
        {bal.transfers.length === 0 ? (
          <>
            <div class="kicker">貸し借り</div>
            <div style="padding:6px 0 4px;font-size:16px;font-weight:700;color:var(--green)">全員精算済み</div>
          </>
        ) : (
          <>
            <div class="kicker">受け取る（{receivers.map(famJa).join('・')}）</div>
            <div style="padding:2px 0 8px"><span class="big"><small>¥</small>{receivers.reduce((s, f) => s + bal.net[f], 0).toLocaleString('ja-JP')}</span></div>
            {bal.transfers.map((t) => (
              <div class="row">
                <Avatar fam={t.from} />
                <div class="t">{famJa(t.from)}<small>→ {famJa(t.to)} へ</small></div>
                <div class="v">{yen(t.amount)}</div>
                <button class="btn" onClick={() => openModal({ type: 'settle', from: t.from, to: t.to, amount: t.amount })}><Icon name="check" />受け取った</button>
              </div>
            ))}
          </>
        )}
      </Glass>
      <div class="sec">
        <SectionHead title="台帳" more={`今年 ${yen(yearTotal)}`} />
        <div style="display:flex;gap:6px;margin:0 2px 8px">
          <button class={`pill ${showSettle.value ? 'p-mu' : 'p-blue'}`} style="padding:5px 11px;font-size:11.5px" onClick={() => (showSettle.value = false)}>立替だけ</button>
          <button class={`pill ${showSettle.value ? 'p-blue' : 'p-mu'}`} style="padding:5px 11px;font-size:11.5px" onClick={() => (showSettle.value = true)}>精算もふくめる</button>
        </div>
        {groups.map((g) => {
          if (shown >= limit.value) return null;
          const entries = g.entries.filter(() => shown++ < limit.value);
          if (!entries.length) return null;
          return (
            <>
              <div class="month">{g.label}</div>
              <Glass className="list">
                {entries.map((e) => e.kind === 'row' ? <LedgerRow l={e.l} /> : <SettleGroup date={e.date} rows={e.rows} />)}
              </Glass>
            </>
          );
        })}
        {shown >= limit.value && <button class="row glass" style="justify-content:center;color:var(--acc-ink);font-weight:600;margin-top:8px;padding:12px" onClick={() => (limit.value += 60)}>もっと見る</button>}
        {groups.length === 0 && <Glass className="list"><div class="empty">まだ記録がありません</div></Glass>}
      </div>
      <button class="fab" aria-label="記録する" onClick={() => openModal({ type: 'ledger-choose' })}><Icon name="add" /></button>
    </>
  );
}

function SettleGroup({ date, rows }: { date: string; rows: Ledger[] }) {
  const open = !!expanded.value[date];
  const total = rows.reduce((s, l) => s + num(l.合計), 0);
  if (rows.length === 1) return <LedgerRow l={rows[0]} />;
  return (
    <>
      <button class="settle-group" onClick={() => (expanded.value = { ...expanded.value, [date]: !open })}>
        <span class="tile t-green"><Icon name="swap_horiz" /></span>
        <div class="t" style="color:var(--ink)">精算 {rows.length}件<small>{fmtMD(date)} {fmtDow(date)} · まとめて表示</small></div>
        <span class="v">{yen(total)}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} style="color:var(--mu2)" />
      </button>
      {open && rows.map((l) => <LedgerRow l={l} sub />)}
    </>
  );
}

function LedgerRow({ l, sub }: { l: Ledger; sub?: boolean }) {
  const { icon, tile } = ledgerIcon(l);
  const items = itemsOf(l);
  const owed = owedOf(l);
  const targets = Object.keys(owed).filter((f) => owed[f] > 0);
  const c = l.大会ID ? contests.value.find((x) => x.ID === l.大会ID) : null;
  const isSettle = l.種別 === 'settle';
  const detail = isSettle ? '' : `${famJa(l.支払者)}払${items.length > 1 ? ` · ${items.length}点` : ''}${c && !l.内容.includes(c.コンテスト名) ? ` · ${c.コンテスト名}` : ''}`;
  return (
    <button class={`row${sub ? ' sub-row' : ''}`} onClick={() => openModal({ type: 'ledger-detail', ledger: l })}>
      {!sub && <span class={`tile ${tile}`}><Icon name={icon} /></span>}
      <div class="t"><span class="nm">{isSettle ? jaNames(l.内容, families.value) : l.内容}</span><small>{`${fmtMD(l.日付)} ${fmtDow(l.日付)}`}{detail && ` · ${detail}`}</small></div>
      {!isSettle && targets.length > 0 && <WhoChips fams={targets} />}
      <div class="v" style={isSettle ? 'color:var(--green)' : ''}>{yen(l.合計)}</div>
      {isSettle && !sub && <Pill tone="p-ok">済</Pill>}
    </button>
  );
}
