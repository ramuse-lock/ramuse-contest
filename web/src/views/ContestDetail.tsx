import { IS_KID } from '../api';
import { contests, tasks, today, past, ledger, families } from '../store';
import { tasksOf, daysUntil, fmtMD, fmtDow, docsOf, taskIcon, taskAmount, yen, MONEY_KINDS, contestStatus, participation, PARTICIPATION_LABEL, owedOf, num, famJa, ledgerIcon } from '../model';
import type { Task, Ledger } from '../types';
import { Icon, Pill, TypeBadge, Glass, Check, SectionHead, Avatar } from '../ui';
import { go } from '../router';
import { resultTone, resultIcon } from './Contests';
import { openModal } from '../modal';
import { saveTasks } from '../store';

export function ContestDetail({ id }: { id: string }) {
  const c = contests.value.find((x) => x.ID === id);
  if (!c) return <><div class="back"><button onClick={() => go('/contests')}><Icon name="arrow_back_ios_new" />大会</button></div><div class="empty">見つかりませんでした</div></>;
  const ts = tasksOf(tasks.value, c.ID);
  const shown = IS_KID ? ts.filter((t) => t.当日 && !MONEY_KINDS.includes(t.種別)) : ts;
  const d = daysUntil(c.開催日, today.value);
  const docs = docsOf(c);
  const status = contestStatus(c, ts, today.value);
  const part = participation(c, ts);
  const prelim = c.ラウンド === '決勝' && c.シリーズ名 ? past.value.find((x) => x.ラウンド === '予選' && x.シリーズ名 === c.シリーズ名 && x.結果) : null;
  return (
    <>
      <div class="back">
        <button style="display:flex;align-items:center;gap:4px" onClick={() => history.length > 1 ? history.back() : go('/contests')}><Icon name="arrow_back_ios_new" />大会</button>
        {!IS_KID && <button class="icnbtn" style="margin-left:auto" aria-label="編集" onClick={() => (openModal({ type: 'contest', contest: c }))}><Icon name="edit" /></button>}
      </div>
      <div class="dt-hd">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <TypeBadge round={c.ラウンド} />
          {c.決勝ステータス === '進出決定' && <Pill tone="p-ok" icon="check_circle">進出決定</Pill>}
          {part !== 'confirmed' && <Pill tone="p-mu" icon={part === 'unentered' ? 'edit_note' : 'hourglass_empty'}>{PARTICIPATION_LABEL[part]}</Pill>}
          {!IS_KID && part === 'confirmed' && <Pill tone={status === '完了' ? 'p-mu' : status === '会計待ち' ? 'p-wn' : 'p-blue'}>{status}</Pill>}
        </div>
        <div class="name">{c.コンテスト名}</div>
        <div class="sub">
          {c.部門 && <span>{c.部門}</span>}
          {c.シリーズ名 && <span><Icon name="flag" />{c.シリーズ名}</span>}
          {prelim && <span>· 予選 {prelim.結果}{prelim.結果詳細 ? `（${prelim.結果詳細}）` : ''}</span>}
        </div>
        <div class="dt-date">
          <span class="big">{fmtMD(c.開催日)}</span><span class="w">{fmtDow(c.開催日)}</span>
          {d > 1 && <span class="cdn">あと{d}日</span>}
          {d === 1 && <span class="cdn">明日</span>}
          {d === 0 && <span class="cdn">今日</span>}
        </div>
      </div>
      {part !== 'confirmed' && (
        <Glass className="card" style="margin-top:10px;display:flex;gap:10px;align-items:center">
          <span class="tile t-mu"><Icon name={part === 'unentered' ? 'edit_note' : 'hourglass_empty'} /></span>
          <div style="font-size:12.5px;color:var(--mu);line-height:1.4">
            {part === 'unentered' ? '出場はまだ決まっていません。予定として入れてある状態です。' : '予選の結果待ちです。日程だけ空けてあります。'}
            {!IS_KID && <span style="display:block;color:var(--ink);margin-top:2px">{part === 'unentered' ? '「エントリー」を済にすると確定になります' : '編集から「出場」を進出決定にすると確定になります'}</span>}
          </div>
        </Glass>
      )}
      <Glass className="tiles">
        <div><Icon name="groups" /><span class="kicker">集合</span><span class="n">{c.集合時間 || '—'}</span></div>
        <div><Icon name="play_arrow" /><span class="kicker">開始</span><span class="n">{c.開始時間 || '—'}</span></div>
        <div><Icon name="stop" /><span class="kicker">終了</span><span class="n">{c.終了時間 || '—'}</span></div>
        <div><Icon name="format_list_numbered" /><span class="kicker">出演</span><span class="n">{c.出演順 || '—'}{c.総組数 ? <small>/{c.総組数}</small> : null}</span></div>
      </Glass>
      {c.会場 && <div class="venue"><Icon name="location_on" /><b>{c.会場}</b></div>}
      {c.URL && <div class="venue"><Icon name="link" /><a href={c.URL} target="_blank" rel="noopener" style="color:var(--blue)">大会サイト</a></div>}

      <div class="sec">
        <SectionHead title={IS_KID ? 'もっていくもの' : 'やること'} more={IS_KID ? undefined : '追加'} onMore={() => (openModal({ type: 'task', contestId: c.ID }))} />
        <Glass className="list">
          {shown.length === 0 && <div class="empty">{IS_KID ? '持ち物の登録はありません' : 'やることはありません'}</div>}
          {shown.map((t) => <TaskRow t={t} />)}
        </Glass>
      </div>

      {!IS_KID && <MoneySection contestId={c.ID} />}

      {docs.length > 0 && (
        <div class="sec">
          <SectionHead title={`資料 · ${docs.length}`} />
          <div class="doc">{docs.map((dd) => <a class="glass" href={dd.url} target="_blank" rel="noopener"><Icon name="description" />{dd.label}</a>)}</div>
        </div>
      )}

      <div class="sec">
        <SectionHead title="結果" />
        <Glass className="result">
          <span class="tile t-acc"><Icon name="emoji_events" fill={!!c.結果} /></span>
          {c.結果
            ? <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                {(c.結果詳細 || c.総組数) && <b class="n" style="font-size:18px">{c.総組数 && c.結果詳細 ? `${c.総組数}組中${c.結果詳細}` : (c.結果詳細 || `${c.総組数}組`)}</b>}
                <Pill tone={resultTone(c.結果)} icon={resultIcon(c.結果)}>{c.結果}</Pill>
              </div>
            : <span style="color:var(--mu);font-size:13px">{d >= 0 ? '大会が終わったらここに出ます' : '未入力'}</span>}
        </Glass>
      </div>
      {c.メモ && !IS_KID && <div class="sec"><SectionHead title="メモ" /><Glass className="card" style="font-size:13px;white-space:pre-wrap">{c.メモ}</Glass></div>}
    </>
  );
}

function TaskRow({ t }: { t: Task }) {
  const { icon, tile } = taskIcon(t);
  const amt = taskAmount(t);
  const dl = t.期限日 && !t.済 ? daysUntil(t.期限日, today.value) : NaN;
  const open = () => { if (!IS_KID) openModal({ type: 'task', contestId: t.大会ID, task: t }); };
  // チェック：お金のやることを初めて済にするときだけ「台帳に載せる？」を聞く。それ以外は即トグル
  const toggle = (e: Event) => {
    e.stopPropagation();
    if (!t.済 && MONEY_KINDS.includes(t.種別) && !t.台帳ID && amt > 0) { openModal({ type: 'task', contestId: t.大会ID, task: t, markDone: true }); return; }
    saveTasks([{ ...t, 済: !t.済 }]).catch(() => {});
  };
  return (
    <div class="row" onClick={open} role={IS_KID ? undefined : 'button'}>
      <span class={`tile ${tile}`}><Icon name={icon} /></span>
      <div class={`t${t.済 ? ' done' : ''}`}>
        {t.名前}
        {!t.済 && (amt > 0 || t.期限日) && (
          <small>{amt > 0 && `${yen(t.単価)}${Number(t.数量) > 1 ? ` × ${t.数量} = ${yen(amt)}` : ''}`}{amt > 0 && t.期限日 && ' · '}{t.期限日 && `${fmtMD(t.期限日)} ${fmtDow(t.期限日)}まで`}</small>
        )}
        {t.メモ && <small>{t.メモ}</small>}
      </div>
      {t.済 ? <Pill tone="p-ok">済</Pill>
        : t.当日 ? <Pill tone="p-violet">当日</Pill>
        : !isNaN(dl) ? <Pill tone={dl <= 7 ? 'p-wn' : 'p-mu'} icon={dl <= 7 ? 'alarm' : undefined}>{dl < 0 ? '期限切れ' : dl === 0 ? '今日' : `あと${dl}日`}</Pill>
        : null}
      {!IS_KID && <Check on={t.済} onClick={toggle} />}
    </div>
  );
}


// この大会にかかったお金（台帳のうち、この大会に紐づいた行）
function MoneySection({ contestId }: { contestId: string }) {
  const fams = families.value;
  const rows = ledger.value.filter((l) => l.大会ID === contestId)
    .slice().sort((a, b) => (a.日付 > b.日付 ? -1 : 1));
  const spend = rows.filter((l) => l.種別 !== 'settle');
  const total = spend.reduce((s, l) => s + num(l.合計), 0);
  const byFam: Record<string, number> = {};
  fams.forEach((f) => { byFam[f] = 0; });
  spend.forEach((l) => { const o = owedOf(l); fams.forEach((f) => { byFam[f] += num(o[f]); }); });
  return (
    <div class="sec">
      <SectionHead title="この大会のお金" more="記録を追加" onMore={() => openModal({ type: 'ledger-choose', contestId })} />
      {spend.length === 0 ? (
        <Glass className="card" style="font-size:13px;color:var(--mu)">まだ記録がありません。エントリー費を「済」にするか、右上から追加できます。</Glass>
      ) : (
        <Glass className="list">
          <div class="row" style="padding:12px 0">
            <div class="t" style="font-weight:700">合計<small>{spend.length}件</small></div>
            <div class="v" style="font-size:18px">{yen(total)}</div>
          </div>
          <div class="split" style="margin:0 0 10px">
            {fams.map((f) => <div><Avatar fam={f} small on /><div><span class="n">{yen(byFam[f])}</span><small>{famJa(f)}</small></div></div>)}
          </div>
          {spend.map((l) => <LedgerLine l={l} />)}
        </Glass>
      )}
    </div>
  );
}

function LedgerLine({ l }: { l: Ledger }) {
  const { icon, tile } = ledgerIcon(l);
  return (
    <button class="lrow" onClick={() => openModal({ type: 'ledger-detail', ledger: l })}>
      <span class={`tile ${tile}`}><Icon name={icon} /></span>
      <span class="nm">{l.内容}</span>
      <span class="meta">
        <span class="sub">{fmtMD(l.日付)} {fmtDow(l.日付)} · {famJa(l.支払者)}払</span>
        <span class="rt"><span class="amt">{yen(l.合計)}</span></span>
      </span>
    </button>
  );
}
