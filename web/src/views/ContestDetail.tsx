import { IS_KID } from '../api';
import { contests, tasks, today, past } from '../store';
import { tasksOf, daysUntil, fmtMD, fmtDow, docsOf, taskIcon, taskAmount, yen, MONEY_KINDS, contestStatus } from '../model';
import type { Task } from '../types';
import { Icon, Pill, TypeBadge, Glass, Check, SectionHead } from '../ui';
import { go } from '../router';
import { resultTone } from './Contests';

export function ContestDetail({ id }: { id: string }) {
  const c = contests.value.find((x) => x.ID === id);
  if (!c) return <><div class="back"><button onClick={() => go('/contests')}><Icon name="arrow_back_ios_new" />大会</button></div><div class="empty">見つかりませんでした</div></>;
  const ts = tasksOf(tasks.value, c.ID);
  const shown = IS_KID ? ts.filter((t) => t.当日 && !MONEY_KINDS.includes(t.種別)) : ts;
  const d = daysUntil(c.開催日, today.value);
  const docs = docsOf(c);
  const status = contestStatus(c, ts, today.value);
  const prelim = c.ラウンド === '決勝' && c.シリーズ名 ? past.value.find((x) => x.ラウンド === '予選' && x.シリーズ名 === c.シリーズ名 && x.結果) : null;
  return (
    <>
      <div class="back">
        <button style="display:flex;align-items:center;gap:4px" onClick={() => history.length > 1 ? history.back() : go('/contests')}><Icon name="arrow_back_ios_new" />大会</button>
        {!IS_KID && <button class="icnbtn" style="margin-left:auto" aria-label="編集" onClick={() => alert('編集はフェーズ3で実装します')}><Icon name="edit" /></button>}
      </div>
      <div class="dt-hd">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <TypeBadge round={c.ラウンド} />
          {c.決勝ステータス === '進出決定' && <Pill tone="p-ok" icon="check_circle">進出決定</Pill>}
          {c.決勝ステータス === '進出未定' && <Pill tone="p-mu">進出未定</Pill>}
          {!IS_KID && <Pill tone={status === '完了' ? 'p-mu' : status === '会計待ち' ? 'p-wn' : 'p-blue'}>{status}</Pill>}
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
      <Glass className="tiles">
        <div><Icon name="groups" /><span class="kicker">集合</span><span class="n">{c.集合時間 || '—'}</span></div>
        <div><Icon name="play_arrow" /><span class="kicker">開始</span><span class="n">{c.開始時間 || '—'}</span></div>
        <div><Icon name="stop" /><span class="kicker">終了</span><span class="n">{c.終了時間 || '—'}</span></div>
        <div><Icon name="format_list_numbered" /><span class="kicker">出演</span><span class="n">{c.出演順 || '—'}{c.総組数 ? <small>/{c.総組数}</small> : null}</span></div>
      </Glass>
      {c.会場 && <div class="venue"><Icon name="location_on" /><b>{c.会場}</b></div>}
      {c.URL && <div class="venue"><Icon name="link" /><a href={c.URL} target="_blank" rel="noopener" style="color:var(--blue)">大会サイト</a></div>}

      <div class="sec">
        <SectionHead title={IS_KID ? 'もっていくもの' : 'やること'} />
        <Glass className="list">
          {shown.length === 0 && <div class="empty">{IS_KID ? '持ち物の登録はありません' : 'やることはありません'}</div>}
          {shown.map((t) => <TaskRow t={t} />)}
        </Glass>
      </div>

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
                <Pill tone={resultTone(c.結果)} icon={/入賞|優勝/.test(c.結果) ? 'emoji_events' : /通過|進出/.test(c.結果) ? 'check' : undefined}>{c.結果}</Pill>
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
  return (
    <div class="row">
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
      {!IS_KID && <Check on={t.済} />}
    </div>
  );
}
