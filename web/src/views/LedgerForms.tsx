// 台帳の入力：選択 → レシート／車／受け取り・支払い。＋ 明細の確認と削除
import { useState } from 'preact/hooks';
import { families, today, contests, destinations, cars, settings, saveLedger, deleteLedger, saveDestination, saveSetting } from '../store';
import { famJa, num, yen, uid, shareItems, sumItems, fmtMD, fmtDow, itemsOf, owedOf, daysUntil } from '../model';
import type { Ledger, LedgerItem, Destination } from '../types';
import { Sheet, Field, Seg, Icon, Glass, WhoPicker, OnePicker, Pill, Avatar } from '../ui';
import { openModal, replaceModal, closeModal, lastPayer, rememberPayer } from '../modal';

function nearContests() {
  return contests.value
    .filter((c) => c.開催日 && Math.abs(daysUntil(c.開催日, today.value)) <= 120 && !c.キャンセル)
    .sort((a, b) => Math.abs(daysUntil(a.開催日, today.value)) - Math.abs(daysUntil(b.開催日, today.value)));
}

export function LedgerChooser({ contestId }: { contestId?: string }) {
  return (
    <Sheet title="なにを記録する？" onClose={closeModal} left={<span class="cancel" />} right={<button class="cancel right" onClick={closeModal}>閉じる</button>}>
      <Glass className="list">
        <button class="row" style="padding:14px 0" onClick={() => (replaceModal({ type: 'receipt', contestId }))}><span class="tile t-red"><Icon name="receipt_long" /></span><div class="t">レシート<small>ご飯・チケット・衣装など。1行ずつ誰の分か決める</small></div><Icon name="chevron_right" style="color:var(--mu2)" /></button>
        <button class="row" style="padding:14px 0" onClick={() => (replaceModal({ type: 'car', contestId }))}><span class="tile t-teal"><Icon name="directions_car" /></span><div class="t">車<small>運転者と行き先を選ぶだけ。高速・ガソリン・駐車場を計算</small></div><Icon name="chevron_right" style="color:var(--mu2)" /></button>
        <button class="row" style="padding:14px 0" onClick={() => (replaceModal({ type: 'settle' }))}><span class="tile t-green"><Icon name="swap_horiz" /></span><div class="t">受け取り・支払い<small>現金やPayPayで精算したとき</small></div><Icon name="chevron_right" style="color:var(--mu2)" /></button>
      </Glass>
    </Sheet>
  );
}

// ---- レシート ----
type Line = { amount: string; label: string; targets: string[] };
export function ReceiptForm({ contestId: initContest }: { contestId?: string }) {
  const fams = families.value;
  const initC = initContest ? contests.value.find((x) => x.ID === initContest) : null;
  const [date, setDate] = useState(initC?.開催日 || today.value);
  const [title, setTitle] = useState(initC?.コンテスト名 || '');
  const [payer, setPayer] = useState(lastPayer('Rinka'));
  const [contestId, setContestId] = useState(initContest || '');
  const [lines, setLines] = useState<Line[]>([{ amount: '', label: '', targets: [] }]);
  const [busy, setBusy] = useState(false);
  const items: LedgerItem[] = lines.filter((l) => num(l.amount) > 0 && l.targets.length).map((l) => ({ label: l.label || 'その他', amount: Math.round(num(l.amount)), targets: l.targets }));
  const total = sumItems(items);
  const owed = shareItems(items, fams, payer);
  const canSave = items.length > 0 && title.trim().length > 0;
  const upd = (i: number, p: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      rememberPayer(payer);
      await saveLedger({ ID: uid('l'), 日付: date, 内容: title.trim(), 種別: 'receipt', 合計: total, 支払者: payer, 大会ID: contestId, 明細JSON: items, 負担JSON: owed, 車JSON: '', メモ: '', 作成日時: '' });
      closeModal();
    } catch { /* */ } finally { setBusy(false); }
  }
  return (
    <Sheet title="レシート" onClose={closeModal} footer={<button class="save" disabled={!canSave || busy} onClick={save}><Icon name="check" />保存する {total ? yen(total) : ''}</button>}>
      <Glass className="fgrp">
        <Field label="払った人"><OnePicker fams={fams} value={payer} onChange={setPayer} /><span class="unit">{famJa(payer)}の財布から</span></Field>
        <Field label="日付"><input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} /></Field>
        <Field label="内容"><input value={title} placeholder="ROOKIES 昼ごはん" onInput={(e) => setTitle((e.target as HTMLInputElement).value)} /></Field>
        <Field label="大会"><ContestSelect value={contestId} onChange={(id) => { setContestId(id); const c = contests.value.find((x) => x.ID === id); if (c && !title) setTitle(c.コンテスト名); }} /></Field>
      </Glass>
      <div class="sec"><div class="sec-hd"><span class="kicker">明細 · {items.length}行</span><span class="kicker" style="text-transform:none;letter-spacing:0">金額 → 誰の分をタップ</span></div>
        <Glass className="fgrp">
          {lines.map((l, i) => (
            <div class="rline">
              <input class="amt" type="number" inputMode="numeric" placeholder="¥" value={l.amount} onInput={(e) => upd(i, { amount: (e.target as HTMLInputElement).value })} />
              <input class="nm" placeholder="オムライス" value={l.label} onInput={(e) => upd(i, { label: (e.target as HTMLInputElement).value })} />
              <WhoPicker small fams={fams} value={l.targets} onChange={(v) => upd(i, { targets: v })} />
              {lines.length > 1 && <button class="del" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="行を削除"><Icon name="close" /></button>}
            </div>
          ))}
          <button class="row" style="justify-content:center;color:var(--acc-ink);font-weight:600;font-size:13px" onClick={() => setLines([...lines, { amount: '', label: '', targets: [] }])}><Icon name="add" />行を追加</button>
          <div class="rtotal"><span class="kicker">合計</span><span class="big">{yen(total)}</span></div>
          <div class="split">{fams.map((f) => <div><Avatar fam={f} small on /><div><span class="n">{yen(owed[f])}</span><small>{famJa(f)}{f === payer ? ' · 払' : ''}</small></div></div>)}</div>
        </Glass>
      </div>
    </Sheet>
  );
}

function ContestSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
      <option value="">紐づけない</option>
      {nearContests().map((c) => <option value={c.ID}>{fmtMD(c.開催日)} {c.コンテスト名}</option>)}
    </select>
  );
}

// ---- 車 ----
export function CarForm({ contestId: initContest }: { contestId?: string }) {
  const fams = families.value;
  const dests = destinations.value;
  const initC = initContest ? contests.value.find((x) => x.ID === initContest) : null;
  const [contestId, setContestId] = useState(initContest || '');
  const [date, setDate] = useState(initC?.開催日 || today.value);
  const [destId, setDestId] = useState(() => (initC ? (destinations.value.find((d) => d.名前 === initC.会場)?.ID || '') : ''));
  const [newDest, setNewDest] = useState<Destination>({ ID: '', 名前: '', 片道距離: 0, 行き高速代: 0, 帰り高速代: 0, メモ: '' });
  const [driver, setDriver] = useState(lastPayer('Rinka'));
  const [riders, setRiders] = useState<string[]>(fams);
  const [roundTrip, setRoundTrip] = useState(true);
  // 行き・帰りそれぞれ「高速か下道か」と、その日の実額（初期値は行き先マスタ）
  const [goToll, setGoToll] = useState(true);
  const [backToll, setBackToll] = useState(true);
  const [goFare, setGoFare] = useState('');
  const [backFare, setBackFare] = useState('');
  const [parking, setParking] = useState('');
  const [gasUnit, setGasUnit] = useState(String(settings.value['ガソリン単価'] || 165));
  const [busy, setBusy] = useState(false);

  const dest = destId === 'new' ? newDest : dests.find((d) => d.ID === destId) || null;
  const car = cars.value.find((c) => c.家族 === driver);
  const fe = num(car?.燃費) || 15;
  const dist = dest ? num(dest.片道距離) * (roundTrip ? 2 : 1) : 0;
  const gas = dist > 0 && num(gasUnit) > 0 ? Math.floor(num(gasUnit) * dist / fe) : 0;
  const goAmt = goToll ? Math.round(num(goFare)) : 0;
  const backAmt = roundTrip && backToll ? Math.round(num(backFare)) : 0;
  const highway = goAmt + backAmt;
  const park = Math.round(num(parking));
  const items: LedgerItem[] = [];
  if (gas > 0) items.push({ label: 'ガソリン', amount: gas, targets: riders });
  if (highway > 0) items.push({ label: goAmt && backAmt ? '高速（往復）' : goAmt ? '高速（行きのみ）' : '高速（帰りのみ）', amount: highway, targets: riders });
  if (park > 0) items.push({ label: '駐車場', amount: park, targets: riders });
  const total = sumItems(items);
  const per = riders.length ? Math.round(total / riders.length / 10) * 10 : 0;
  const canSave = items.length > 0 && riders.length > 0 && !!dest && !!dest.名前;
  const contest = contests.value.find((c) => c.ID === contestId);

  function pickDest(id: string) {
    setDestId(id);
    const d = id === 'new' ? null : dests.find((x) => x.ID === id);
    setGoFare(d ? String(d.行き高速代 || '') : '');
    setBackFare(d ? String(d.帰り高速代 || '') : '');
    setGoToll(!d || num(d.行き高速代) > 0);
    setBackToll(!d || num(d.帰り高速代) > 0);
  }
  function pickContest(id: string) {
    setContestId(id);
    const c = contests.value.find((x) => x.ID === id);
    if (!c) return;
    setDate(c.開催日);
    const d = dests.find((x) => x.名前 === c.会場);
    if (d) pickDest(d.ID);
    else if (c.会場) { pickDest('new'); setNewDest({ ...newDest, 名前: c.会場 }); }
  }
  async function save() {
    if (!canSave || busy || !dest) return;
    setBusy(true);
    try {
      let d = dest;
      if (destId === 'new') d = await saveDestination({ ...newDest, 片道距離: num(newDest.片道距離), 行き高速代: num(newDest.行き高速代), 帰り高速代: num(newDest.帰り高速代) });
      if (String(settings.value['ガソリン単価']) !== String(gasUnit)) await saveSetting('ガソリン単価', num(gasUnit));
      rememberPayer(driver);
      await saveLedger({
        ID: uid('l'), 日付: date, 内容: `${contest ? contest.コンテスト名 : d.名前} 車`, 種別: 'car', 合計: total, 支払者: driver, 大会ID: contestId,
        明細JSON: items, 負担JSON: shareItems(items, fams, driver),
        車JSON: { 行き先: d.名前, 行き先ID: d.ID, 運転者: driver, 往復: roundTrip, 距離: dist, 燃費: fe, 単価: num(gasUnit), 駐車場: park, 行き高速: goAmt, 帰り高速: backAmt, 行き: goToll ? '高速' : '下道', 帰り: roundTrip ? (backToll ? '高速' : '下道') : '—' },
        メモ: '', 作成日時: '',
      });
      closeModal();
    } catch { /* */ } finally { setBusy(false); }
  }
  return (
    <Sheet title="車" onClose={closeModal} footer={<button class="save" disabled={!canSave || busy} onClick={save}><Icon name="check" />台帳に1行 {total ? yen(total) : ''}</button>}>
      <Glass className="fgrp">
        <Field label="運転者"><OnePicker fams={fams} value={driver} onChange={setDriver} /><span class="unit">{car ? `${car.車名} · ${fe} km/L` : ''}</span></Field>
        <Field label="大会"><ContestSelect value={contestId} onChange={pickContest} /></Field>
        <Field label="日付"><input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} /></Field>
        <Field label="行き先">
          <select value={destId} onChange={(e) => pickDest((e.target as HTMLSelectElement).value)}>
            <option value="">選ぶ</option>
            {dests.map((d) => <option value={d.ID}>{d.名前}（{d.片道距離}km）</option>)}
            <option value="new">＋ 新しい行き先</option>
          </select>
        </Field>
        {destId === 'new' && (
          <>
            <Field label="名前"><input value={newDest.名前} placeholder="会場名" onInput={(e) => setNewDest({ ...newDest, 名前: (e.target as HTMLInputElement).value })} /></Field>
            <Field label="片道"><input class="n" type="number" inputMode="decimal" value={String(newDest.片道距離 || '')} placeholder="km" onInput={(e) => setNewDest({ ...newDest, 片道距離: num((e.target as HTMLInputElement).value) })} /><span class="unit">km</span></Field>
            <Field label="高速代"><input class="n" type="number" inputMode="numeric" value={String(newDest.行き高速代 || '')} placeholder="行き" onInput={(e) => { const v = (e.target as HTMLInputElement).value; setNewDest({ ...newDest, 行き高速代: num(v) }); setGoFare(v); setGoToll(num(v) > 0); }} /><span class="unit">行き</span><input class="n" type="number" inputMode="numeric" value={String(newDest.帰り高速代 || '')} placeholder="帰り" onInput={(e) => { const v = (e.target as HTMLInputElement).value; setNewDest({ ...newDest, 帰り高速代: num(v) }); setBackFare(v); setBackToll(num(v) > 0); }} /><span class="unit">帰り</span></Field>
          </>
        )}
        <Field label="乗った人"><WhoPicker fams={fams} value={riders} onChange={setRiders} /><span class="unit">{riders.length}人で割る</span></Field>
        <Field label="往復"><Seg small options={[{ v: 'rt', label: '往復' }, { v: 'ow', label: '片道' }]} value={roundTrip ? 'rt' : 'ow'} onChange={(v) => setRoundTrip(v === 'rt')} /><span class="unit">駐車場</span><input class="amt-in" type="number" inputMode="numeric" placeholder="¥" value={parking} onInput={(e) => setParking((e.target as HTMLInputElement).value)} /></Field>
        {dest && (
          <>
            <Field label="行き"><Seg small options={[{ v: 'toll', label: '高速' }, { v: 'free', label: '下道' }]} value={goToll ? 'toll' : 'free'} onChange={(v) => setGoToll(v === 'toll')} />{goToll && <input class="amt-in" type="number" inputMode="numeric" placeholder="¥" value={goFare} onInput={(e) => setGoFare((e.target as HTMLInputElement).value)} />}</Field>
            {roundTrip && <Field label="帰り"><Seg small options={[{ v: 'toll', label: '高速' }, { v: 'free', label: '下道' }]} value={backToll ? 'toll' : 'free'} onChange={(v) => setBackToll(v === 'toll')} />{backToll && <input class="amt-in" type="number" inputMode="numeric" placeholder="¥" value={backFare} onInput={(e) => setBackFare((e.target as HTMLInputElement).value)} />}</Field>}
          </>
        )}
      </Glass>
      <Glass className="calc" style="margin-top:10px">
        <div class="kicker" style="margin-bottom:4px">計算</div>
        <div class="crow"><span class="lb"><Icon name="route" style="font-size:16px" />距離 <small>{dest ? `${dest.片道距離} km ${roundTrip ? '× 2' : ''}` : ''}</small></span><span class="v">{dist} km</span></div>
        <div class="crow"><span class="lb"><Icon name="local_gas_station" style="font-size:16px" />ガソリン <small>{dist} ÷ {fe} × ¥</small><input class="amt-in" style="width:70px;padding:3px 8px" type="number" inputMode="numeric" value={gasUnit} onInput={(e) => setGasUnit((e.target as HTMLInputElement).value)} /></span><span class="v">{yen(gas)}</span></div>
        <div class="crow"><span class="lb"><Icon name="add_road" style="font-size:16px" />高速 <small>{dest ? `行き ${goToll ? yen(goAmt) : '下道'}${roundTrip ? ` · 帰り ${backToll ? yen(backAmt) : '下道'}` : ''}` : ''}</small></span><span class="v">{yen(highway)}</span></div>
        <div class="crow"><span class="lb"><Icon name="local_parking" style="font-size:16px" />駐車場</span><span class="v">{yen(park)}</span></div>
        <div class="crow tot"><span class="lb" style="color:var(--ink);font-weight:600">合計 <small>1人 {yen(per)}</small></span><span class="v">{yen(total)}</span></div>
      </Glass>
    </Sheet>
  );
}

// ---- 受け取り・支払い（精算） ----
export function SettleForm({ from: f0, to: t0, amount: a0 }: { from?: string; to?: string; amount?: number }) {
  const fams = families.value;
  const [from, setFrom] = useState(f0 || fams.find((f) => f !== 'Rinka') || fams[0]);
  const [to, setTo] = useState(t0 || 'Rinka');
  const [amount, setAmount] = useState(a0 ? String(a0) : '');
  const [date, setDate] = useState(today.value);
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const canSave = num(amount) > 0 && from !== to;
  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const amt = Math.round(num(amount));
      await saveLedger({ ID: uid('l'), 日付: date, 内容: `精算 ${famJa(from)} → ${famJa(to)}`, 種別: 'settle', 合計: amt, 支払者: from, 大会ID: '', 明細JSON: [{ label: '精算', amount: amt, targets: [to] }], 負担JSON: {}, 車JSON: '', メモ: memo, 作成日時: '' });
      closeModal();
    } catch { /* */ } finally { setBusy(false); }
  }
  return (
    <Sheet title="受け取り・支払い" onClose={closeModal} footer={<button class="save" disabled={!canSave || busy} onClick={save}><Icon name="check" />記録する</button>}>
      <Glass className="fgrp">
        <Field label="払った人"><OnePicker fams={fams} value={from} onChange={setFrom} /></Field>
        <Field label="受け取った人"><OnePicker fams={fams} value={to} onChange={setTo} /></Field>
        <Field label="金額"><input class="n" type="number" inputMode="numeric" value={amount} placeholder="¥" onInput={(e) => setAmount((e.target as HTMLInputElement).value)} /></Field>
        <Field label="日付"><input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} /></Field>
        <Field label="メモ"><input value={memo} placeholder="PayPay など" onInput={(e) => setMemo((e.target as HTMLInputElement).value)} /></Field>
      </Glass>
      <div class="empty" style="text-align:left;padding:14px 4px">{famJa(from)} が {famJa(to)} に {yen(num(amount))} 払った、として残高から差し引きます。</div>
    </Sheet>
  );
}

// ---- 台帳の1行を見る・消す ----
export function LedgerDetail({ ledger: l }: { ledger: Ledger }) {
  const items = itemsOf(l);
  const owed = owedOf(l);
  const fams = families.value;
  const [busy, setBusy] = useState(false);
  const c = l.大会ID ? contests.value.find((x) => x.ID === l.大会ID) : null;
  async function remove() {
    if (!confirm(`「${l.内容}」を削除しますか？残高も戻ります`)) return;
    setBusy(true);
    try { await deleteLedger(l.ID); closeModal(); } catch { /* */ } finally { setBusy(false); }
  }
  return (
    <Sheet title={l.内容} onClose={closeModal} left={<span class="cancel" />} right={<button class="cancel right" onClick={closeModal}>閉じる</button>}
      footer={<button class="save sub" style="color:var(--red)" disabled={busy} onClick={remove}><Icon name="delete" />削除</button>}>
      <div class="empty" style="text-align:left;padding:4px 4px 10px">{fmtMD(l.日付)} {fmtDow(l.日付)} · {famJa(l.支払者)}払{c ? ` · ${c.コンテスト名}` : ''}{l.メモ ? ` · ${l.メモ}` : ''}</div>
      <Glass className="list">
        {items.map((it) => <div class="row"><div class="t">{it.label}<small>{it.targets.map(famJa).join('・')}</small></div><div class="v">{yen(it.amount)}</div></div>)}
        <div class="rtotal"><span class="kicker">合計</span><span class="big">{yen(l.合計)}</span></div>
        <div class="split" style="margin-bottom:10px">{fams.map((f) => <div><Avatar fam={f} small on /><div><span class="n">{yen(owed[f] || 0)}</span><small>{famJa(f)}</small></div></div>)}</div>
      </Glass>
      {l.種別 === 'settle' && <div class="empty"><Pill tone="p-ok">精算の行</Pill></div>}
    </Sheet>
  );
}
