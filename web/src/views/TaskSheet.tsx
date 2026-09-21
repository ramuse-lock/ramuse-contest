// やることの追加・編集。お金のやることを「済」にすると台帳へ1行足せる
import { useState } from 'preact/hooks';
import { families, today, contests, ledger, saveTasks, deleteTask, saveLedger } from '../store';
import { famJa, uid, yen, num, MONEY_KINDS, breakdownOf, familyAmount, taskAmount, itemsOf } from '../model';
import type { Task, TaskKind, Ledger, LedgerItem, TaskBreakdown } from '../types';
import { Sheet, Field, Seg, Toggle, Icon, Glass, WhoPicker, OnePicker } from '../ui';
import { closeModal, lastPayer, rememberPayer } from '../modal';

const KINDS: { v: TaskKind; label: string; icon: string }[] = [
  { v: 'entry', label: 'エントリー', icon: 'upload' }, { v: 'music', label: '音源', icon: 'music_note' }, { v: 'backup_cd', label: '持ち物', icon: 'album' },
  { v: 'entry_fee', label: 'エントリー費', icon: 'payments' }, { v: 'view_fee', label: '観覧費', icon: 'confirmation_number' }, { v: 'other', label: 'その他', icon: 'task_alt' },
];

// 金額の入れ方。same＝みんな同じ単価（従来）／each＝家庭ごとに券種×枚数（観覧チケットなど）
type MoneyMode = 'same' | 'each';

export function TaskSheet({ contestId, task, markDone, preset }: { contestId: string; task?: Task; markDone?: boolean; preset?: Partial<Task> }) {
  const isNew = !task;
  const fams = families.value;
  const contest = contests.value.find((c) => c.ID === contestId);
  const [t, setT] = useState<Task>(task
    ? { ...task, 済: markDone ? true : task.済 }
    // 新規は「当日」が既定。ほとんどが当日持っていくものなので、日付を選ぶのは例外
    : { ID: '', 大会ID: contestId, 種別: 'other', 名前: '', 期限日: '', 当日: true, 済: false, 済日: '', 単価: '', 数量: fams.length, 台帳ID: '', メモ: '', 表示順: 99, ...preset });
  const isMoney = MONEY_KINDS.includes(t.種別);

  // 家庭ごとの内訳。初回は「大人 1枚ずつ」から始める（単価が入っていればそれを引き継ぐ）
  const [mode, setMode] = useState<MoneyMode>(breakdownOf(t) ? 'each' : 'same');
  const [bk, setBk] = useState<TaskBreakdown>(breakdownOf(t) || {
    types: [{ label: '大人', price: num(t.単価) }],
    qty: Object.fromEntries(fams.map((f) => [f, { 大人: 1 }])),
  });
  // 計算に使う「いまの形」。each なら内訳を持ち、単価×数量は空にする（二重に持たない）
  const eff: Task = mode === 'each' ? { ...t, 内訳JSON: bk, 単価: '', 数量: '' } : { ...t, 内訳JSON: '' };
  const amount = taskAmount(eff);

  // すでに台帳に載っている行（あれば）。編集で内容が変わったら、この行を書き直す
  const linked = t.台帳ID ? ledger.value.find((l) => l.ID === t.台帳ID) : undefined;
  const linkedItems = linked ? itemsOf(linked) : [];

  const willLog = isMoney && eff.済 && !(task?.済) && !eff.台帳ID && amount > 0;
  const [logIt, setLogIt] = useState(true);
  const [payer, setPayer] = useState(linked?.支払者 || lastPayer('Rinka'));
  const [targets, setTargets] = useState<string[]>(
    linkedItems.length ? fams.filter((f) => linkedItems.some((i) => i.targets.includes(f))) : fams);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Task, v: unknown) => setT({ ...t, [k]: v } as Task);
  const canSave = t.名前.trim().length > 0;

  // ---- 内訳の編集 ----
  const setType = (i: number, patch: Partial<{ label: string; price: number }>) => {
    const types = bk.types.map((ty, j) => (j === i ? { ...ty, ...patch } : ty));
    let qty = bk.qty;
    // 券種の名前を変えたら、枚数の入れ物も付け替える
    if (patch.label !== undefined && patch.label !== bk.types[i].label) {
      const from = bk.types[i].label, to = patch.label;
      qty = Object.fromEntries(Object.entries(bk.qty).map(([f, q]) => {
        const nq = { ...q }; if (from in nq) { nq[to] = nq[from]; delete nq[from]; } return [f, nq];
      }));
    }
    setBk({ types, qty });
  };
  const addType = () => {
    const label = bk.types.some((ty) => ty.label === '子供') ? `券種${bk.types.length + 1}` : '子供';
    setBk({ types: [...bk.types, { label, price: 0 }], qty: bk.qty });
  };
  const removeType = (i: number) => {
    const gone = bk.types[i].label;
    const qty = Object.fromEntries(Object.entries(bk.qty).map(([f, q]) => { const nq = { ...q }; delete nq[gone]; return [f, nq]; }));
    setBk({ types: bk.types.filter((_, j) => j !== i), qty });
  };
  const setQty = (f: string, label: string, v: number) =>
    setBk({ ...bk, qty: { ...bk.qty, [f]: { ...(bk.qty[f] || {}), [label]: Math.max(0, v || 0) } } });

  // 台帳の明細：家庭ごとに1行。内訳があれば「大人×2・子供×1」を行に書き、金額はその家庭ぶん
  const buildItems = (): LedgerItem[] => mode === 'each'
    ? fams.filter((f) => familyAmount(eff, f) > 0).map((f) => {
        const q = bk.qty[f] || {};
        const parts = bk.types.filter((ty) => num(q[ty.label]) > 0).map((ty) => `${ty.label}×${q[ty.label]}`).join('・');
        return { label: `${t.名前} ${parts}（${famJa(f)}）`, amount: familyAmount(eff, f), targets: [f] };
      })
    : (num(t.単価) > 0 ? targets.map((f) => ({ label: `${t.名前}（${famJa(f)}）`, amount: num(t.単価), targets: [f] })) : []);
  // 載せてある台帳の行と、いまの内容が違うか（違えば保存時に書き直す）
  const newItems = isMoney ? buildItems() : [];
  const willUpdate = !!linked && newItems.length > 0 && JSON.stringify(linkedItems) !== JSON.stringify(newItems);

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const next: Task = { ...eff, ID: t.ID || uid('t') };
      if (willUpdate && linked) {
        // すでに台帳に載っている → その行の明細を今の内容で上書き（合計と負担はサーバーが再計算）
        await saveLedger({ ...linked, 明細JSON: newItems });
      } else if (willLog && logIt) {
        const items = newItems;
        if (items.length) {
          const l: Ledger = {
            ID: uid('l'), 日付: today.value, 内容: `${contest?.コンテスト名 || ''} ${t.名前}`.trim(), 種別: 'fee', 合計: 0, 支払者: payer, 大会ID: contestId,
            明細JSON: items, 負担JSON: {}, 車JSON: '', メモ: '', 作成日時: '',
          };
          rememberPayer(payer);
          const saved = await saveLedger(l);
          next.台帳ID = saved.ID;
        }
      }
      await saveTasks([next]);
      closeModal();
    } catch { /* トースト済み */ } finally { setBusy(false); }
  }
  async function remove() {
    if (!task || !confirm(`「${task.名前}」を削除しますか？`)) return;
    setBusy(true);
    try { await deleteTask(task.ID); closeModal(); } catch { /* */ } finally { setBusy(false); }
  }

  return (
    <Sheet title={isNew ? 'やることを追加' : 'やることを編集'} onClose={closeModal}
      right={!isNew ? <button class="cancel right danger" onClick={remove}>削除</button> : undefined}
      footer={<button class="save" disabled={!canSave || busy} onClick={save}><Icon name="check" />{willUpdate ? '保存して台帳を書き直す' : willLog && logIt ? '保存して台帳に1行' : '保存する'}</button>}>
      <Glass className="fgrp">
        {isNew && (
          <div class="fld"><span class="lb">種類</span><div class="chips">
            {KINDS.map((k) => <button type="button" class={`chip${t.種別 === k.v ? ' on' : ''}`} onClick={() => setT({ ...t, 種別: k.v, 名前: t.名前 || (k.v === 'other' ? '' : k.label) })}><Icon name={k.icon} />{k.label}</button>)}
          </div></div>
        )}
        <Field label="名前"><input value={t.名前} placeholder={t.種別 === 'backup_cd' ? '音源CD 持参' : '例：観覧費 事前振込'} onInput={(e) => set('名前', (e.target as HTMLInputElement).value)} /></Field>
        <Field label="いつまで">
          {/* 日付の入力欄は「日付」を選んだときだけ出す。普段は当日なので、欄があるだけ狭くなる */}
          <div class="due">
            <Seg small options={[{ v: 'today', label: '当日' }, { v: 'date', label: '日付' }]} value={t.当日 ? 'today' : 'date'} onChange={(v) => set('当日', v === 'today')} />
            {!t.当日 && <input type="date" value={t.期限日} onInput={(e) => set('期限日', (e.target as HTMLInputElement).value)} />}
          </div>
        </Field>
        {isMoney && (
          <>
            <Field label="金額">
              <Seg small options={[{ v: 'same', label: 'みんな同じ' }, { v: 'each', label: '家庭ごと' }]} value={mode} onChange={setMode} />
            </Field>
            {mode === 'same' ? (
              <Field label="">
                <input class="n" type="number" inputMode="numeric" value={String(t.単価 || '')} placeholder="1人あたり" onInput={(e) => set('単価', (e.target as HTMLInputElement).value)} />
                <span class="unit">×</span>
                <input class="n" type="number" inputMode="numeric" value={String(t.数量 || '')} style="flex:0 0 56px" onInput={(e) => set('数量', (e.target as HTMLInputElement).value)} />
                <span class="unit">= {yen(amount)}</span>
              </Field>
            ) : (
              <>
                {/* 券種：大人 3,000／子供 1,500 のように、値段の違う券を並べる */}
                <div class="fld bkf">
                  <div class="bkhd"><span class="lb">券種</span><button type="button" class="more" onClick={addType}><Icon name="add" />券種を足す</button></div>
                  {bk.types.map((ty, i) => (
                    <div class="bkrow">
                      <input value={ty.label} placeholder="大人" onInput={(e) => setType(i, { label: (e.target as HTMLInputElement).value })} />
                      <span class="unit">¥</span>
                      <input class="n" type="number" inputMode="numeric" value={ty.price ? String(ty.price) : ''} placeholder="0" onInput={(e) => setType(i, { price: num((e.target as HTMLInputElement).value) })} />
                      {bk.types.length > 1 && <button type="button" class="icnbtn xs" aria-label="この券種を消す" onClick={() => removeType(i)}><Icon name="close" /></button>}
                    </div>
                  ))}
                </div>
                {/* 枚数：家庭 × 券種 */}
                <div class="fld bkf">
                  <span class="lb">枚数</span>
                  <div class="bktw">
                    <table class="bkt">
                      <thead><tr><th></th>{bk.types.map((ty) => <th>{ty.label || '—'}</th>)}<th class="sub">小計</th></tr></thead>
                      <tbody>
                        {fams.map((f) => (
                          <tr>
                            <td class="fam">{famJa(f)}</td>
                            {bk.types.map((ty) => (
                              <td><input class="n" type="number" inputMode="numeric" min="0" value={String(num((bk.qty[f] || {})[ty.label]) || '')} placeholder="0"
                                onInput={(e) => setQty(f, ty.label, num((e.target as HTMLInputElement).value))} /></td>
                            ))}
                            <td class="sub n">{yen(familyAmount(eff, f))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div class="fld"><span class="lb">合計</span><div class="in"><b class="n" style="font-size:16px">{yen(amount)}</b></div></div>
              </>
            )}
          </>
        )}
        <Field label="メモ"><input value={t.メモ} onInput={(e) => set('メモ', (e.target as HTMLInputElement).value)} placeholder="振込先など" /></Field>
      </Glass>
      <Glass className="fgrp" style="margin-top:10px">
        <div class="fld"><span class="lb" style="width:auto;flex:1;color:var(--ink);font-weight:600">済にする</span><Toggle on={t.済} onChange={(v) => set('済', v)} /></div>
      </Glass>
      {linked && isMoney && (
        <Glass style="margin-top:10px;padding:12px 16px;background:radial-gradient(120% 120% at 0% 0%,rgba(40,167,69,.18),transparent 60%),var(--sfc)">
          <div class="kicker" style="margin-bottom:6px">台帳に載っている行</div>
          <div style="font-size:12.5px;line-height:1.6">
            {linked.内容}<br />
            <span style="color:var(--mu)">いま {yen(num(linked.合計))}</span>
            {willUpdate && <> → <b class="n">{yen(newItems.reduce((s, i) => s + i.amount, 0))}</b> に書き直します</>}
            {!willUpdate && <span style="color:var(--mu)">（変更なし）</span>}
          </div>
          {willUpdate && mode === 'each' && (
            <div class="bkshare" style="margin-top:8px">
              {fams.filter((f) => familyAmount(eff, f) > 0).map((f) => <span>{famJa(f)} <b class="n">{yen(familyAmount(eff, f))}</b></span>)}
            </div>
          )}
        </Glass>
      )}
      {willLog && (
        <Glass style="margin-top:10px;padding:12px 16px;background:radial-gradient(120% 120% at 0% 0%,rgba(40,167,69,.18),transparent 60%),var(--sfc)">
          <div class="kicker" style="margin-bottom:8px">台帳に載せる</div>
          <div class="fld" style="border-top:0;padding-top:4px"><span class="lb">誰が払った</span><OnePicker fams={fams} value={payer} onChange={setPayer} /></div>
          {mode === 'same' ? (
            <div class="fld"><span class="lb">誰の分</span><WhoPicker fams={fams} value={targets} onChange={setTargets} /><span class="unit" style="margin-left:auto">{yen(t.単価)} ずつ</span></div>
          ) : (
            <div class="fld bkf"><span class="lb">誰の分</span>
              <div class="bkshare">
                {fams.filter((f) => familyAmount(eff, f) > 0).map((f) => <span>{famJa(f)} <b class="n">{yen(familyAmount(eff, f))}</b></span>)}
                {fams.every((f) => familyAmount(eff, f) <= 0) && <span class="unit">枚数を入れると出ます</span>}
              </div>
            </div>
          )}
          <div class="fld"><span class="lb" style="width:auto;flex:1">載せない（各自で払った）</span><Toggle on={!logIt} onChange={(v) => setLogIt(!v)} /></div>
        </Glass>
      )}
    </Sheet>
  );
}
