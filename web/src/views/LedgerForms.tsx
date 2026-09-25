// 台帳の入力：選択 → レシート／車／受け取り・支払い。＋ 明細の確認と削除
import { useState } from 'preact/hooks';
import { families, today, contests, ledger, settings, saveLedger, deleteLedger, saveSetting } from '../store';
import { famJa, num, yen, uid, shareItems, sumItems, fmtMD, fmtDow, itemsOf, owedOf, daysUntil, parseJson } from '../model';
import type { Ledger, LedgerItem } from '../types';
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
        <button class="row" style="padding:14px 0" onClick={() => (replaceModal({ type: 'car', contestId }))}><span class="tile t-teal"><Icon name="directions_car" /></span><div class="t">車代<small>距離と燃費を入れるだけ。高速・駐車場も。2台でも1回で記録</small></div><Icon name="chevron_right" style="color:var(--mu2)" /></button>
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
// 車も行き先も登録しない。会場も出発地（各家）も毎回ちがうので、その場で「片道の距離・燃費・燃料・高速・駐車場」を入れる。
// 燃費と燃料だけは、その家族が前回入れた値を初期値にする（台帳の車の行から拾う）。
// 2台で行ったら「もう1台」で同じ記録にまとめ、2台分の合計を「割る人」で等分する。台帳には車1台につき1行（払う人＝運転者が違うため）
type Fuel = 'レギュラー' | 'ハイオク';
const FUELS: Fuel[] = ['レギュラー', 'ハイオク'];
const FUEL_KEY: Record<Fuel, string> = { レギュラー: 'ガソリン単価', ハイオク: 'ハイオク単価' };
type Legs = 'rt' | 'go' | 'back';
const LEGS: { v: Legs; label: string }[] = [{ v: 'rt', label: '往復' }, { v: 'go', label: '行きだけ' }, { v: 'back', label: '帰りだけ' }];
const legsLabel = (v: Legs) => LEGS.find((x) => x.v === v)?.label || '';
type CarLine = {
  key: number; driver: string; oneway: string; legs: Legs; fe: string; fuel: Fuel;
  goToll: boolean; goFare: string; backToll: boolean; backFare: string; parking: boolean; parkFare: string;
};
let carSeq = 0;

function lastCarOf(fam: string): { fe: string; fuel: Fuel } {
  const rows = ledger.value.filter((l) => l.種別 === 'car').sort((a, b) => (a.日付 > b.日付 ? -1 : a.日付 < b.日付 ? 1 : 0));
  for (const l of rows) {
    const j = parseJson(l.車JSON, {} as Record<string, unknown>);
    if (String(j.運転者 || l.支払者) !== fam || !(num(j.燃費) > 0)) continue;
    return { fe: String(j.燃費), fuel: j.燃料 === 'ハイオク' ? 'ハイオク' : 'レギュラー' };
  }
  return { fe: '', fuel: 'レギュラー' };
}
function newLine(driver: string): CarLine {
  const last = lastCarOf(driver);
  return { key: ++carSeq, driver, oneway: '', legs: 'rt', fe: last.fe, fuel: last.fuel, goToll: true, goFare: '', backToll: true, backFare: '', parking: false, parkFare: '' };
}

export function CarForm({ contestId: initContest }: { contestId?: string }) {
  const fams = families.value;
  const initC = initContest ? contests.value.find((x) => x.ID === initContest) : null;
  const [contestId, setContestId] = useState(initContest || '');
  const [date, setDate] = useState(initC?.開催日 || today.value);
  const [title, setTitle] = useState(initC?.コンテスト名 || '');
  const [lines, setLines] = useState<CarLine[]>(() => [newLine(lastPayer('Rinka'))]);
  const [targets, setTargets] = useState<string[]>(fams);
  const [price, setPrice] = useState<Record<Fuel, string>>({ レギュラー: String(settings.value['ガソリン単価'] || 165), ハイオク: String(settings.value['ハイオク単価'] || '') });
  const [busy, setBusy] = useState(false);

  const upd = (k: number, p: Partial<CarLine>) => setLines(lines.map((l) => (l.key === k ? { ...l, ...p } : l)));
  const setDriver = (k: number, f: string) => { const last = lastCarOf(f); upd(k, { driver: f, fe: last.fe || lines.find((l) => l.key === k)?.fe || '', fuel: last.fe ? last.fuel : lines.find((l) => l.key === k)?.fuel }); };
  const nextDriver = () => fams.find((f) => !lines.some((l) => l.driver === f)) || fams[0];
  const inp = (e: Event) => (e.target as HTMLInputElement).value;

  const calc = lines.map((l) => {
    const dist = num(l.oneway) * (l.legs === 'rt' ? 2 : 1);
    const unit = num(price[l.fuel]);
    const fe = num(l.fe);
    const gas = dist > 0 && fe > 0 && unit > 0 ? Math.floor(unit * dist / fe) : 0;
    const go = l.legs !== 'back' && l.goToll ? Math.round(num(l.goFare)) : 0;
    const back = l.legs !== 'go' && l.backToll ? Math.round(num(l.backFare)) : 0;
    const park = l.parking ? Math.round(num(l.parkFare)) : 0;
    const items: LedgerItem[] = [];
    if (gas > 0) items.push({ label: 'ガソリン', amount: gas, targets });
    if (go + back > 0) items.push({ label: go && back ? '高速（往復）' : go ? '高速（行きのみ）' : '高速（帰りのみ）', amount: go + back, targets });
    if (park > 0) items.push({ label: '駐車場', amount: park, targets });
    return { l, dist, unit, fe, gas, go, back, park, items, total: sumItems(items) };
  });
  const rows = calc.filter((c) => c.total > 0);
  const total = rows.reduce((s, c) => s + c.total, 0);
  const per = targets.length ? Math.round(total / targets.length / 10) * 10 : 0;
  const fuelsUsed = FUELS.filter((f) => lines.some((l) => l.fuel === f));
  const canSave = rows.length > 0 && targets.length > 0;

  function pickContest(id: string) {
    setContestId(id);
    const c = contests.value.find((x) => x.ID === id);
    if (!c) return;
    setDate(c.開催日);
    const prev = contests.value.find((x) => x.ID === contestId);
    if (!title.trim() || (prev && title === prev.コンテスト名)) setTitle(c.コンテスト名);
  }
  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      for (const f of fuelsUsed) {
        const v = num(price[f]);
        if (v > 0 && String(settings.value[FUEL_KEY[f]] ?? '') !== String(v)) await saveSetting(FUEL_KEY[f], v);
      }
      const base = title.trim() ? `${title.trim()} 車` : '車';
      const trip = uid('trip');
      rememberPayer(rows[0].l.driver);
      for (const c of rows) {
        await saveLedger({
          ID: uid('l'), 日付: date, 内容: rows.length > 1 ? `${base}（${famJa(c.l.driver)}）` : base, 種別: 'car', 合計: c.total, 支払者: c.l.driver, 大会ID: contestId,
          明細JSON: c.items, 負担JSON: shareItems(c.items, fams, c.l.driver),
          車JSON: {
            運転者: c.l.driver, 往復: c.l.legs === 'rt', 行程: legsLabel(c.l.legs), 片道: num(c.l.oneway), 距離: c.dist, 燃費: c.fe, 燃料: c.l.fuel, 単価: c.unit, 駐車場: c.park,
            行き高速: c.go, 帰り高速: c.back, 行き: c.l.legs === 'back' ? '—' : (c.l.goToll ? '高速' : '下道'), 帰り: c.l.legs === 'go' ? '—' : (c.l.backToll ? '高速' : '下道'), 同行ID: trip, 台数: rows.length,
          },
          メモ: '', 作成日時: '',
        });
      }
      closeModal();
    } catch { /* */ } finally { setBusy(false); }
  }
  return (
    <Sheet title="車代" onClose={closeModal} footer={<button class="save" disabled={!canSave || busy} onClick={save}><Icon name="check" />台帳に{rows.length || 1}行 {total ? yen(total) : ''}</button>}>
      <Glass className="fgrp">
        <Field label="大会"><ContestSelect value={contestId} onChange={pickContest} /></Field>
        <Field label="日付"><input type="date" value={date} onInput={(e) => setDate(inp(e))} /></Field>
        <Field label="内容"><input value={title} placeholder="大会名・送迎 など" onInput={(e) => setTitle(inp(e))} /></Field>
      </Glass>

      <div class="sec">
        <div class="sec-hd"><span class="kicker">車 · {lines.length}台</span><span class="kicker" style="text-transform:none;letter-spacing:0">運転者が払った分を入れる</span></div>
        {calc.map((c) => (
          <Glass className="fgrp carcard" key={c.l.key}>
            <Field label="運転者">
              <OnePicker fams={fams} value={c.l.driver} onChange={(f) => setDriver(c.l.key, f)} />
              {lines.length > 1 && <button class="del" aria-label="この車を外す" onClick={() => setLines(lines.filter((x) => x.key !== c.l.key))}><Icon name="close" /></button>}
            </Field>
            <Field label="距離">
              <input class="amt-in s" type="number" inputMode="decimal" placeholder="km" value={c.l.oneway} onInput={(e) => upd(c.l.key, { oneway: inp(e) })} />
              <span class="unit">km 片道</span>
            </Field>
            <Field label="燃費">
              <input class="amt-in s" type="number" inputMode="decimal" placeholder="km/L" value={c.l.fe} onInput={(e) => upd(c.l.key, { fe: inp(e) })} />
              <span class="unit">km/L</span>
            </Field>
            <Field label="燃料">
              <Seg small options={FUELS.map((f) => ({ v: f, label: f }))} value={c.l.fuel} onChange={(v) => upd(c.l.key, { fuel: v })} />
              <span class="unit">{c.unit > 0 ? `${yen(c.unit)}/L` : '単価は下で'}</span>
            </Field>
            <Field label="駐車場">
              <Seg small options={[{ v: 'no', label: 'なし' }, { v: 'yes', label: 'あり' }]} value={c.l.parking ? 'yes' : 'no'} onChange={(v) => upd(c.l.key, { parking: v === 'yes' })} />
              {c.l.parking && <input class="amt-in" type="number" inputMode="numeric" placeholder="¥" value={c.l.parkFare} onInput={(e) => upd(c.l.key, { parkFare: inp(e) })} />}
            </Field>
            <Field label="行程">
              <Seg small options={LEGS} value={c.l.legs} onChange={(v) => upd(c.l.key, { legs: v })} />
            </Field>
            {c.l.legs !== 'back' && (
              <Field label="行き">
                <Seg small options={[{ v: 'toll', label: '高速' }, { v: 'free', label: '下道' }]} value={c.l.goToll ? 'toll' : 'free'} onChange={(v) => upd(c.l.key, { goToll: v === 'toll' })} />
                {c.l.goToll && <input class="amt-in" type="number" inputMode="numeric" placeholder="¥" value={c.l.goFare} onInput={(e) => upd(c.l.key, { goFare: inp(e) })} />}
              </Field>
            )}
            {c.l.legs !== 'go' && (
              <Field label="帰り">
                <Seg small options={[{ v: 'toll', label: '高速' }, { v: 'free', label: '下道' }]} value={c.l.backToll ? 'toll' : 'free'} onChange={(v) => upd(c.l.key, { backToll: v === 'toll' })} />
                {c.l.backToll && <input class="amt-in" type="number" inputMode="numeric" placeholder="¥" value={c.l.backFare} onInput={(e) => upd(c.l.key, { backFare: inp(e) })} />}
              </Field>
            )}
            <div class="carsub">
              <span>{c.dist > 0 ? `${c.dist} km${c.l.legs === 'rt' ? '' : `（${legsLabel(c.l.legs)}）`} · ` : ''}ガソリン {yen(c.gas)}{c.go + c.back > 0 ? ` · 高速 ${yen(c.go + c.back)}` : ''}{c.park > 0 ? ` · 駐車場 ${yen(c.park)}` : ''}</span>
              <span><b>{yen(c.total)}</b>{c.total > 0 ? <span class="pay"> {famJa(c.l.driver)}が払う</span> : <span> 台帳には載りません</span>}</span>
            </div>
          </Glass>
        ))}
        <button class="addcar" onClick={() => setLines([...lines, newLine(nextDriver())])}><Icon name="add" />もう1台</button>
      </div>

      <Glass className="fgrp" style="margin-top:6px">
        <Field label="割る人"><WhoPicker fams={fams} value={targets} onChange={setTargets} /><span class="unit">{targets.length}家庭で等分</span></Field>
      </Glass>
      <div class="hint"><Icon name="info" /><span>{lines.length > 1 ? `${lines.length}台分をまとめて、` : ''}選んだ家庭で等分します。車ごとに乗った人だけで割りたいときは、1台ずつ記録してください</span></div>

      <Glass className="calc" style="margin-top:10px">
        <div class="kicker" style="margin-bottom:4px">計算</div>
        {fuelsUsed.map((f) => (
          <div class="crow"><span class="lb"><Icon name="local_gas_station" style="font-size:16px" />{f} <small>1Lあたり</small></span><span class="v"><input class="amt-in" style="width:70px;padding:3px 8px" type="number" inputMode="numeric" placeholder="¥" value={price[f]} onInput={(e) => setPrice({ ...price, [f]: inp(e) })} /></span></div>
        ))}
        {calc.length > 1 && calc.map((c) => (
          <div class="crow"><span class="lb"><Avatar fam={c.l.driver} small on />{famJa(c.l.driver)}の車 <small>{c.dist > 0 ? `${c.dist} km` : ''}</small></span><span class="v">{yen(c.total)}</span></div>
        ))}
        <div class="crow tot"><span class="lb" style="color:var(--ink);font-weight:600">合計 <small>{targets.length && total ? `1家庭 約 ${yen(per)}` : ''}</small></span><span class="v">{yen(total)}</span></div>
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
