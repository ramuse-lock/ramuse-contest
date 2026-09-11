import { signal } from '@preact/signals';
import { ledger, families, contests } from '../store';
import { computeBalance, yen, fmtMD, fmtDow, famJa, itemsOf, owedOf, ledgerIcon } from '../model';
import type { Ledger } from '../types';
import { Icon, Glass, Avatar, WhoChips, SectionHead, Pill } from '../ui';

const limit = signal(30);
const showSettle = signal(false);

// 「精算 Airi → Rinka（NUMBER 2026）」のような内容の英名を日本語に
function jaNames(s: string, fams: string[]) {
  return fams.reduce((acc, f) => acc.replace(new RegExp(f, 'g'), famJa(f)), s);
}

export function Money() {
  const fams = families.value;
  const bal = computeBalance(ledger.value, fams);
  const rows = ledger.value
    .filter((l) => showSettle.value || l.種別 !== 'settle')
    .slice().sort((a, b) => (a.日付 > b.日付 ? -1 : a.日付 < b.日付 ? 1 : 0));
  const y = new Date().getFullYear();
  const yearTotal = rows.filter((l) => l.日付.startsWith(String(y)) && l.種別 !== 'settle').reduce((s, l) => s + Number(l.合計 || 0), 0);
  const receivers = fams.filter((f) => bal.net[f] > 0);
  return (
    <>
      <div class="hd"><span class="title">お金</span></div>
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
                <button class="btn" onClick={() => alert('消し込みはフェーズ3で実装します')}><Icon name="check" />受け取った</button>
              </div>
            ))}
          </>
        )}
      </Glass>
      <div class="sec">
        <SectionHead title="台帳" more={`今年 ${yen(yearTotal)}`} />
        <div style="display:flex;gap:6px;margin:0 2px 8px">
          <button class={`pill ${showSettle.value ? 'p-mu' : 'p-blue'}`} style="padding:5px 11px;font-size:11.5px" onClick={() => (showSettle.value = false)}>立替だけ</button>
          <button class={`pill ${showSettle.value ? 'p-blue' : 'p-mu'}`} style="padding:5px 11px;font-size:11.5px" onClick={() => (showSettle.value = true)}>精算も表示</button>
        </div>
        <Glass className="list">
          {rows.slice(0, limit.value).map((l) => <LedgerRow l={l} />)}
          {rows.length > limit.value && <button class="row" style="justify-content:center;color:var(--acc-ink);font-weight:600" onClick={() => (limit.value += 50)}>もっと見る（残り{rows.length - limit.value}件）</button>}
          {rows.length === 0 && <div class="empty">台帳は空です</div>}
        </Glass>
      </div>
      <button class="fab" aria-label="記録する" onClick={() => alert('台帳の入力はフェーズ3で実装します')}><Icon name="add" /></button>
    </>
  );
}

function LedgerRow({ l }: { l: Ledger }) {
  const { icon, tile } = ledgerIcon(l);
  const items = itemsOf(l);
  const owed = owedOf(l);
  const targets = Object.keys(owed).filter((f) => owed[f] > 0);
  const c = l.大会ID ? contests.value.find((x) => x.ID === l.大会ID) : null;
  const isSettle = l.種別 === 'settle';
  const sub = isSettle
    ? `${fmtMD(l.日付)} ${fmtDow(l.日付)}`
    : `${fmtMD(l.日付)} ${fmtDow(l.日付)} · ${famJa(l.支払者)}払${items.length > 1 ? ` · ${items.length}点` : ''}${c && !l.内容.includes(c.コンテスト名) ? ` · ${c.コンテスト名}` : ''}`;
  return (
    <div class="row">
      <span class={`tile ${tile}`}><Icon name={icon} /></span>
      <div class="t">{isSettle ? jaNames(l.内容, families.value) : l.内容}<small>{sub}</small></div>
      {!isSettle && targets.length > 0 && <WhoChips fams={targets} />}
      {isSettle ? <Pill tone="p-ok">済</Pill> : <div class="v">{yen(l.合計)}</div>}
    </div>
  );
}
