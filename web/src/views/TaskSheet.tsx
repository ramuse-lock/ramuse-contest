// やることの追加・編集。お金のやることを「済」にすると台帳へ1行足せる
import { useState } from 'preact/hooks';
import { families, today, contests, saveTasks, deleteTask, saveLedger } from '../store';
import { famJa, uid, yen, num, MONEY_KINDS } from '../model';
import type { Task, TaskKind, Ledger } from '../types';
import { Sheet, Field, Seg, Toggle, Icon, Glass, WhoPicker, OnePicker } from '../ui';
import { closeModal, lastPayer, rememberPayer } from '../modal';

const KINDS: { v: TaskKind; label: string; icon: string }[] = [
  { v: 'entry', label: 'エントリー', icon: 'upload' }, { v: 'music', label: '音源', icon: 'music_note' }, { v: 'backup_cd', label: '持ち物', icon: 'album' },
  { v: 'entry_fee', label: 'エントリー費', icon: 'payments' }, { v: 'view_fee', label: '観覧費', icon: 'confirmation_number' }, { v: 'other', label: 'その他', icon: 'task_alt' },
];

export function TaskSheet({ contestId, task, markDone }: { contestId: string; task?: Task; markDone?: boolean }) {
  const isNew = !task;
  const fams = families.value;
  const contest = contests.value.find((c) => c.ID === contestId);
  const [t, setT] = useState<Task>(task
    ? { ...task, 済: markDone ? true : task.済 }
    : { ID: '', 大会ID: contestId, 種別: 'other', 名前: '', 期限日: '', 当日: false, 済: false, 済日: '', 単価: '', 数量: fams.length, 台帳ID: '', メモ: '', 表示順: 99 });
  const isMoney = MONEY_KINDS.includes(t.種別);
  const willLog = isMoney && t.済 && !(task?.済) && !t.台帳ID && num(t.単価) > 0;
  const [logIt, setLogIt] = useState(true);
  const [payer, setPayer] = useState(lastPayer('Rinka'));
  const [targets, setTargets] = useState<string[]>(fams);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Task, v: unknown) => setT({ ...t, [k]: v } as Task);
  const amount = num(t.単価) * (num(t.数量) || 1);
  const canSave = t.名前.trim().length > 0;

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const next: Task = { ...t, ID: t.ID || uid('t') };
      if (willLog && logIt && targets.length) {
        const l: Ledger = {
          ID: uid('l'), 日付: today.value, 内容: `${contest?.コンテスト名 || ''} ${t.名前}`.trim(), 種別: 'fee', 合計: 0, 支払者: payer, 大会ID: contestId,
          明細JSON: targets.map((f) => ({ label: `${t.名前}（${famJa(f)}）`, amount: num(t.単価), targets: [f] })), 負担JSON: {}, 車JSON: '', メモ: '', 作成日時: '',
        };
        rememberPayer(payer);
        const saved = await saveLedger(l);
        next.台帳ID = saved.ID;
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
      footer={<button class="save" disabled={!canSave || busy} onClick={save}><Icon name="check" />{willLog && logIt ? '保存して台帳に1行' : '保存する'}</button>}>
      <Glass className="fgrp">
        {isNew && (
          <div class="fld"><span class="lb">種類</span><div class="chips">
            {KINDS.map((k) => <button type="button" class={`chip${t.種別 === k.v ? ' on' : ''}`} onClick={() => setT({ ...t, 種別: k.v, 名前: t.名前 || (k.v === 'other' ? '' : k.label) })}><Icon name={k.icon} />{k.label}</button>)}
          </div></div>
        )}
        <Field label="名前"><input value={t.名前} placeholder={t.種別 === 'backup_cd' ? '音源CD 持参' : '例：観覧費 事前振込'} onInput={(e) => set('名前', (e.target as HTMLInputElement).value)} /></Field>
        <Field label="いつまで">
          <Seg small options={[{ v: 'date', label: t.期限日 ? t.期限日.slice(5).replace('-', '/') : '日付' }, { v: 'today', label: '当日' }]} value={t.当日 ? 'today' : 'date'} onChange={(v) => set('当日', v === 'today')} />
          {!t.当日 && <input type="date" value={t.期限日} onInput={(e) => set('期限日', (e.target as HTMLInputElement).value)} style="flex:0 0 150px" />}
        </Field>
        {isMoney && (
          <Field label="金額">
            <input class="n" type="number" inputMode="numeric" value={String(t.単価 || '')} placeholder="1人あたり" onInput={(e) => set('単価', (e.target as HTMLInputElement).value)} />
            <span class="unit">×</span>
            <input class="n" type="number" inputMode="numeric" value={String(t.数量 || '')} style="flex:0 0 56px" onInput={(e) => set('数量', (e.target as HTMLInputElement).value)} />
            <span class="unit">= {yen(amount)}</span>
          </Field>
        )}
        <Field label="メモ"><input value={t.メモ} onInput={(e) => set('メモ', (e.target as HTMLInputElement).value)} placeholder="振込先など" /></Field>
      </Glass>
      <Glass className="fgrp" style="margin-top:10px">
        <div class="fld"><span class="lb" style="width:auto;flex:1;color:var(--ink);font-weight:600">済にする</span><Toggle on={t.済} onChange={(v) => set('済', v)} /></div>
      </Glass>
      {willLog && (
        <Glass style="margin-top:10px;padding:12px 16px;background:radial-gradient(120% 120% at 0% 0%,rgba(40,167,69,.18),transparent 60%),var(--sfc)">
          <div class="kicker" style="margin-bottom:8px">台帳に載せる</div>
          <div class="fld" style="border-top:0;padding-top:4px"><span class="lb">誰が払った</span><OnePicker fams={fams} value={payer} onChange={setPayer} /></div>
          <div class="fld"><span class="lb">誰の分</span><WhoPicker fams={fams} value={targets} onChange={setTargets} /><span class="unit" style="margin-left:auto">{yen(t.単価)} ずつ</span></div>
          <div class="fld"><span class="lb" style="width:auto;flex:1">載せない（各自で払った）</span><Toggle on={!logIt} onChange={(v) => setLogIt(!v)} /></div>
        </Glass>
      )}
    </Sheet>
  );
}
