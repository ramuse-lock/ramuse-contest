// ルーティング（hash）とタブバー。大人用4タブ／子供用3タブ。入力シートとPINもここで出す
import { computed } from '@preact/signals';
import { useState } from 'preact/hooks';
import { route, go } from './router';
import { IS_KID, registerPinPrompter } from './api';
import { syncing, error, bundle, toast } from './store';
import { useEffect } from 'preact/hooks';
import { modals, pinReq } from './modal';
import { Icon, Sheet } from './ui';
import type { ModalState } from './modal';
import { Home } from './views/Home';
import { Contests } from './views/Contests';
import { ContestDetail } from './views/ContestDetail';
import { Calendar } from './views/Calendar';
import { Money } from './views/Money';
import { Settings } from './views/Settings';
import { ContestForm } from './views/ContestForm';
import { TaskSheet } from './views/TaskSheet';
import { LedgerChooser, ReceiptForm, CarForm, SettleForm, LedgerDetail } from './views/LedgerForms';

const tab = computed(() => {
  const r = route.value;
  if (r.startsWith('/contest')) return 'contests';
  if (r.startsWith('/calendar')) return 'calendar';
  if (r.startsWith('/money') || r.startsWith('/settings')) return 'money';
  return 'home';
});

registerPinPrompter((message) => new Promise<string | null>((resolve) => { pinReq.value = { message, resolve }; }));

export function App() {
  const r = route.value;
  // シートが開いている間は背景の装飾を止める（iOSでの描画負荷対策）
  useEffect(() => {
    document.body.classList.toggle('sheet-open', modals.value.length > 0 || !!pinReq.value);
  }, [modals.value.length, !!pinReq.value]);
  let view;
  const m = r.match(/^\/contest\/([^/]+)/);
  if (m) view = <ContestDetail id={decodeURIComponent(m[1])} />;
  else if (r.startsWith('/contests')) view = <Contests />;
  else if (r.startsWith('/calendar')) view = <Calendar />;
  else if (r.startsWith('/settings') && !IS_KID) view = <Settings />;
  else if (r.startsWith('/money') && !IS_KID) view = <Money />;
  else view = <Home />;

  return (
    <>
      <div class="blobs" aria-hidden="true"><i class="b1" /><i class="b2" /><i class="b3" /></div>
      <main class="page">{view}</main>
      {(syncing.value && !bundle.value) && <div class="sync"><Icon name="progress_activity" />読み込み中</div>}
      {(!syncing.value && error.value && !bundle.value) && <div class="sync" style="color:var(--red)"><Icon name="cloud_off" style="animation:none" />通信できません</div>}
      <nav class="tabbar" aria-label="主要タブ">
        <TabButton id="home" icon="home" label="ホーム" path="/" />
        <TabButton id="contests" icon="emoji_events" label="大会" path="/contests" />
        <TabButton id="calendar" icon="calendar_month" label="カレンダー" path="/calendar" />
        {!IS_KID && <TabButton id="money" icon="account_balance_wallet" label="お金" path="/money" />}
      </nav>
      {modals.value.map((s, i) => <ModalView state={s} depth={i} />)}
      {pinReq.value && <PinSheet message={pinReq.value.message} resolve={pinReq.value.resolve} />}
      {toast.value && <div class="toast" role="status">{toast.value}</div>}
    </>
  );
}

function TabButton({ id, icon, label, path }: { id: string; icon: string; label: string; path: string }) {
  const on = tab.value === id;
  return (
    <button class={`tb${on ? ' on' : ''}`} onClick={() => go(path)} aria-current={on ? 'page' : undefined}>
      <Icon name={icon} fill={on} />{label}
    </button>
  );
}

function ModalView({ state: s, depth }: { state: ModalState; depth: number }) {
  // 重ねたぶんだけ前に出す。下のシートは消さないので入力が残る
  const style = depth > 0 ? `--dim-z:${40 + depth * 4};--sheet-z:${41 + depth * 4}` : undefined;
  const body = (() => {
    switch (s.type) {
      case 'contest': return <ContestForm contest={s.contest} />;
      case 'task': return <TaskSheet contestId={s.contestId} task={s.task} markDone={s.markDone} preset={s.preset} />;
      case 'ledger-choose': return <LedgerChooser contestId={s.contestId} />;
      case 'receipt': return <ReceiptForm contestId={s.contestId} />;
      case 'car': return <CarForm contestId={s.contestId} />;
      case 'settle': return <SettleForm from={s.from} to={s.to} amount={s.amount} />;
      case 'ledger-detail': return <LedgerDetail ledger={s.ledger} />;
    }
  })();
  return <div class="modal-layer" style={style}>{body}</div>;
}

function PinSheet({ message, resolve }: { message: string; resolve: (pin: string | null) => void }) {
  const [v, setV] = useState('');
  const done = (pin: string | null) => { pinReq.value = null; resolve(pin); };
  return (
    <Sheet title="大人用PIN" top onClose={() => done(null)} footer={<button class="save" disabled={v.length < 4} onClick={() => done(v)}><Icon name="lock_open" />この端末で覚える</button>}>
      <div class="empty" style={`padding:8px 4px 0${/違います/.test(message) ? ';color:var(--red)' : ''}`}>{message}</div>
      <div class="pin"><input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus value={v} onInput={(e) => setV((e.target as HTMLInputElement).value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && v.length >= 4) done(v); }} /></div>
    </Sheet>
  );
}
