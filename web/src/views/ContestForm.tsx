// 大会の追加（2ステップ：基本と当日 → やることテンプレ）／編集（1ステップ）
import { useState } from 'preact/hooks';
import { families, today, saveContest, saveTasks, deleteContest } from '../store';
import { docsOf, uid, yen } from '../model';
import type { Contest, Task, TaskKind } from '../types';
import { Sheet, Field, Seg, Toggle, Icon, Glass, Pill } from '../ui';
import { closeModal } from '../modal';
import { go } from '../router';

type Tpl = {
  entry: boolean; entryDl: string;
  music: '事前提出' | '当日CD' | '不要'; musicDl: string; backup: boolean;
  fee: string; feeMode: '事前' | '当日'; feeDl: string;
  view: string; viewMode: '事前' | '当日' | '不要'; viewDl: string;
};

const blank = (): Contest => ({
  ID: '', コンテスト名: '', 開催日: '', 会場: '', 部門: '小学生部門', ラウンド: '単発', シリーズ名: '', 決勝ステータス: '',
  集合時間: '', 開始時間: '', 終了時間: '', 出演順: '', 総組数: '', URL: '', 資料JSON: [], 結果: '', 結果詳細: '', キャンセル: false, メモ: '', 更新日時: '',
});

export function ContestForm({ contest }: { contest?: Contest }) {
  const isNew = !contest;
  const [c, setC] = useState<Contest>(contest ? { ...contest } : blank());
  const [docs, setDocs] = useState(contest ? docsOf(contest) : []);
  const [step, setStep] = useState<1 | 2>(1);
  const [tpl, setTpl] = useState<Tpl>({ entry: true, entryDl: '', music: '当日CD', musicDl: '', backup: false, fee: '', feeMode: '当日', feeDl: '', view: '', viewMode: '不要', viewDl: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Contest, v: unknown) => setC({ ...c, [k]: v } as Contest);
  const isPast = !!c.開催日 && c.開催日 < today.value;
  const canSave = c.コンテスト名.trim().length > 0 && !!c.開催日;

  const previewTasks = buildTasks('preview', tpl, families.value.length);

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const saved = await saveContest({ ...c, 資料JSON: docs.filter((d) => d.url), 出演順: c.出演順 || '', 総組数: c.総組数 || '' });
      if (isNew) {
        const ts = buildTasks(saved.ID, tpl, families.value.length);
        if (ts.length) await saveTasks(ts);
      }
      closeModal();
      go(`/contest/${encodeURIComponent(saved.ID)}`);
    } catch { /* トースト済み */ } finally { setBusy(false); }
  }
  async function remove() {
    if (!contest) return;
    if (!confirm(`「${contest.コンテスト名}」を削除しますか？やることも消えます（台帳は残ります）`)) return;
    setBusy(true);
    try { await deleteContest(contest.ID); closeModal(); go('/contests'); } catch { /* */ } finally { setBusy(false); }
  }

  const footer = step === 1
    ? (isNew
      ? <button class="save" disabled={!canSave} onClick={() => setStep(2)}>次へ：やること<Icon name="arrow_forward" /></button>
      : <button class="save" disabled={!canSave || busy} onClick={save}><Icon name="check" />保存する</button>)
    : <><button class="save sub" onClick={() => setStep(1)}><Icon name="arrow_back_ios_new" /></button><button class="save" disabled={busy} onClick={save}><Icon name="check" />保存する</button></>;

  return (
    <Sheet title={isNew ? '大会を追加' : '大会を編集'} onClose={closeModal} footer={footer}
      right={!isNew ? <button class="cancel right danger" onClick={remove}>削除</button> : undefined}>
      {isNew && <div class="step"><b class={step === 1 ? '' : 'off'}>1</b>基本と当日 <span style="opacity:.5">→</span> <b class={step === 2 ? '' : 'off'}>2</b>やること</div>}
      {step === 1 ? (
        <>
          <Glass className="fgrp">
            <Field label="大会名"><input value={c.コンテスト名} onInput={(e) => set('コンテスト名', (e.target as HTMLInputElement).value)} placeholder="THE ROOKIES 2026 …" /></Field>
            <Field label="日付"><input type="date" value={c.開催日} onInput={(e) => set('開催日', (e.target as HTMLInputElement).value)} /></Field>
            <Field label="会場"><input value={c.会場} onInput={(e) => set('会場', (e.target as HTMLInputElement).value)} placeholder="名東文化小劇場" /></Field>
            <Field label="部門"><input value={c.部門} onInput={(e) => set('部門', (e.target as HTMLInputElement).value)} /></Field>
            <Field label="種別"><Seg small options={[{ v: '単発', label: '単発' }, { v: '予選', label: '予選' }, { v: '決勝', label: '決勝' }]} value={c.ラウンド || '単発'} onChange={(v) => set('ラウンド', v)} /></Field>
            {c.ラウンド !== '単発' && <Field label="シリーズ"><input value={c.シリーズ名} onInput={(e) => set('シリーズ名', (e.target as HTMLInputElement).value)} placeholder="予選と決勝を同じ名前で紐づけ" /></Field>}
            {c.ラウンド === '決勝' && <Field label="進出"><Seg small options={[{ v: '進出未定', label: '未定' }, { v: '進出決定', label: '進出決定' }]} value={(c.決勝ステータス || '進出未定') as '進出未定' | '進出決定'} onChange={(v) => set('決勝ステータス', v)} /></Field>}
          </Glass>
          <div class="sec"><div class="kicker" style="padding:0 2px 6px">当日</div>
            <Glass className="fgrp">
              <Field label="集合"><input type="time" value={c.集合時間} onInput={(e) => set('集合時間', (e.target as HTMLInputElement).value)} /><span class="unit">開始</span><input type="time" value={c.開始時間} onInput={(e) => set('開始時間', (e.target as HTMLInputElement).value)} /></Field>
              <Field label="終了"><input type="time" value={c.終了時間} onInput={(e) => set('終了時間', (e.target as HTMLInputElement).value)} /></Field>
              <Field label="出演順"><input class="n" type="number" inputMode="numeric" value={String(c.出演順 || '')} onInput={(e) => set('出演順', (e.target as HTMLInputElement).value)} placeholder="—" /><span class="unit">番 ／</span><input class="n" type="number" inputMode="numeric" value={String(c.総組数 || '')} onInput={(e) => set('総組数', (e.target as HTMLInputElement).value)} placeholder="—" /><span class="unit">組</span></Field>
              <Field label="URL"><input type="url" value={c.URL} onInput={(e) => set('URL', (e.target as HTMLInputElement).value)} placeholder="https://" /></Field>
            </Glass>
          </div>
          {(isPast || c.結果) && (
            <div class="sec"><div class="kicker" style="padding:0 2px 6px">結果</div>
              <Glass className="fgrp">
                <Field label="結果">
                  <select value={c.結果} onChange={(e) => set('結果', (e.target as HTMLSelectElement).value)}>
                    <option value="">未入力</option><option>出場のみ</option><option>予選通過</option><option>入賞</option><option>優勝</option>
                  </select>
                </Field>
                <Field label="順位など"><input value={c.結果詳細} onInput={(e) => set('結果詳細', (e.target as HTMLInputElement).value)} placeholder="5位" /></Field>
              </Glass>
            </div>
          )}
          <div class="sec"><div class="sec-hd"><span class="kicker">資料</span><button class="more" onClick={() => setDocs([...docs, { label: '', url: '' }])}><Icon name="add" />追加</button></div>
            <Glass className="fgrp">
              {docs.length === 0 && <div class="empty" style="padding:12px">要項・スケジュール・出演順などのリンク</div>}
              {docs.map((d, i) => (
                <div class="fld">
                  <input style="flex:0 0 96px" value={d.label} placeholder="名前" onInput={(e) => setDocs(docs.map((x, j) => j === i ? { ...x, label: (e.target as HTMLInputElement).value } : x))} />
                  <input type="url" value={d.url} placeholder="https://" onInput={(e) => setDocs(docs.map((x, j) => j === i ? { ...x, url: (e.target as HTMLInputElement).value } : x))} />
                  <button onClick={() => setDocs(docs.filter((_, j) => j !== i))} aria-label="削除"><Icon name="close" style="color:var(--mu2)" /></button>
                </div>
              ))}
            </Glass>
          </div>
          <div class="sec"><Glass className="fgrp">
            <Field label="メモ"><textarea value={c.メモ} onInput={(e) => set('メモ', (e.target as HTMLTextAreaElement).value)} /></Field>
            {!isNew && <Field label="キャンセル"><Toggle on={!!c.キャンセル} onChange={(v) => set('キャンセル', v)} /><span class="unit">大会が中止・不参加になった</span></Field>}
          </Glass></div>
        </>
      ) : (
        <>
          <Glass className="fgrp">
            <div class="tpl"><span class="tile t-blue"><Icon name="upload" /></span><div class="tt">エントリー<small>期限を入れると締切に出ます</small></div><input type="date" class="amt-in" style="width:150px;text-align:left" value={tpl.entryDl} onInput={(e) => setTpl({ ...tpl, entryDl: (e.target as HTMLInputElement).value })} /><Toggle on={tpl.entry} onChange={(v) => setTpl({ ...tpl, entry: v })} /></div>
            <div class="tpl"><span class="tile t-blue"><Icon name="music_note" /></span><div class="tt">音源</div><Seg small options={[{ v: '事前提出', label: '事前提出' }, { v: '当日CD', label: '当日CD' }, { v: '不要', label: '不要' }]} value={tpl.music} onChange={(v) => setTpl({ ...tpl, music: v })} /></div>
            {tpl.music === '事前提出' && <div class="tpl" style="padding-left:46px"><div class="tt" style="font-weight:500">提出期限</div><input type="date" class="amt-in" style="width:150px;text-align:left" value={tpl.musicDl} onInput={(e) => setTpl({ ...tpl, musicDl: (e.target as HTMLInputElement).value })} /></div>}
            {tpl.music !== '不要' && <div class="tpl" style="padding-left:46px"><div class="tt" style="font-weight:500">{tpl.music === '事前提出' ? '予備CDも当日持参' : '予備データも持参'}<small>「当日」のやることになる</small></div><Toggle on={tpl.backup} onChange={(v) => setTpl({ ...tpl, backup: v })} /></div>}
            <div class="tpl"><span class="tile t-green"><Icon name="payments" /></span><div class="tt">エントリー費<small>1人あたり</small></div><input class="amt-in" type="number" inputMode="numeric" placeholder="¥" value={tpl.fee} onInput={(e) => setTpl({ ...tpl, fee: (e.target as HTMLInputElement).value })} /><Seg small options={[{ v: '事前', label: '事前' }, { v: '当日', label: '当日' }]} value={tpl.feeMode} onChange={(v) => setTpl({ ...tpl, feeMode: v })} /></div>
            {tpl.fee && tpl.feeMode === '事前' && <div class="tpl" style="padding-left:46px"><div class="tt" style="font-weight:500">振込期限</div><input type="date" class="amt-in" style="width:150px;text-align:left" value={tpl.feeDl} onInput={(e) => setTpl({ ...tpl, feeDl: (e.target as HTMLInputElement).value })} /></div>}
            <div class="tpl"><span class="tile t-green"><Icon name="confirmation_number" /></span><div class="tt">観覧費<small>大人 1人あたり</small></div><input class="amt-in" type="number" inputMode="numeric" placeholder="¥" value={tpl.view} onInput={(e) => setTpl({ ...tpl, view: (e.target as HTMLInputElement).value, viewMode: tpl.viewMode === '不要' ? '当日' : tpl.viewMode })} /><Seg small options={[{ v: '事前', label: '事前' }, { v: '当日', label: '当日' }, { v: '不要', label: '不要' }]} value={tpl.viewMode} onChange={(v) => setTpl({ ...tpl, viewMode: v })} /></div>
            {tpl.view && tpl.viewMode === '事前' && <div class="tpl" style="padding-left:46px"><div class="tt" style="font-weight:500">振込期限</div><input type="date" class="amt-in" style="width:150px;text-align:left" value={tpl.viewDl} onInput={(e) => setTpl({ ...tpl, viewDl: (e.target as HTMLInputElement).value })} /></div>}
          </Glass>
          <div class="sec"><div class="kicker" style="padding:0 2px 6px">できるやること · {previewTasks.length}</div>
            <Glass className="list">
              {previewTasks.map((t) => (
                <div class="row"><span class={`tile ${t.種別 === 'backup_cd' || t.当日 ? 't-violet' : t.種別 === 'entry_fee' || t.種別 === 'view_fee' ? 't-green' : 't-blue'}`}><Icon name={iconFor(t.種別, t.当日)} /></span>
                  <div class="t">{t.名前}{t.単価 ? <small>{yen(t.単価)} × {t.数量}</small> : null}</div>
                  <Pill tone={t.当日 ? 'p-violet' : 'p-mu'}>{t.当日 ? '当日' : (t.期限日 || '期限なし')}</Pill></div>
              ))}
              {previewTasks.length === 0 && <div class="empty">やることなし。あとから詳細画面で追加できます</div>}
            </Glass>
          </div>
        </>
      )}
    </Sheet>
  );
}

function iconFor(kind: TaskKind, today: boolean) {
  if (kind === 'entry') return 'upload';
  if (kind === 'music') return 'music_note';
  if (kind === 'backup_cd') return 'album';
  if (kind === 'entry_fee') return today ? 'currency_yen' : 'payments';
  if (kind === 'view_fee') return today ? 'currency_yen' : 'confirmation_number';
  return 'task_alt';
}

export function buildTasks(contestId: string, t: Tpl, famCount: number): Task[] {
  const out: Task[] = [];
  let order = 0;
  const push = (kind: TaskKind, name: string, opts: { today?: boolean; dl?: string; unit?: string; qty?: number }) =>
    out.push({ ID: uid('t'), 大会ID: contestId, 種別: kind, 名前: name, 期限日: opts.today ? '' : (opts.dl || ''), 当日: !!opts.today, 済: false, 済日: '', 単価: opts.unit || '', 数量: opts.qty || '', 台帳ID: '', メモ: '', 表示順: ++order });
  if (t.entry) push('entry', 'エントリー', { dl: t.entryDl });
  if (t.music === '事前提出') { push('music', '音源 事前提出', { dl: t.musicDl }); if (t.backup) push('backup_cd', '予備CD 持参', { today: true }); }
  if (t.music === '当日CD') { push('backup_cd', '音源CD 持参', { today: true }); if (t.backup) push('backup_cd', '予備データ 持参', { today: true }); }
  if (t.fee) push('entry_fee', t.feeMode === '当日' ? 'エントリー費 持参' : 'エントリー費 振込', { today: t.feeMode === '当日', dl: t.feeDl, unit: t.fee, qty: famCount });
  if (t.view && t.viewMode !== '不要') push('view_fee', t.viewMode === '当日' ? '観覧費 現金' : '観覧費 事前振込', { today: t.viewMode === '当日', dl: t.viewDl, unit: t.view, qty: famCount });
  return out;
}
