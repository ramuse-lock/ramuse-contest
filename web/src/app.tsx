// ルーティング（hash）とタブバー。大人用4タブ／子供用3タブ
import { computed, signal, effect } from '@preact/signals';
import { route, go } from './router';
import { IS_KID } from './api';
import { syncing, error, bundle } from './store';
import { Icon } from './ui';
import { Home } from './views/Home';
import { Contests } from './views/Contests';
import { ContestDetail } from './views/ContestDetail';
import { Calendar } from './views/Calendar';
import { Money } from './views/Money';


const tab = computed(() => {
  const r = route.value;
  if (r.startsWith('/contest')) return 'contests';
  if (r.startsWith('/calendar')) return 'calendar';
  if (r.startsWith('/money')) return 'money';
  return 'home';
});

// オープニング：起動直後に全画面でロゴ。データが用意でき、かつ最短0.9秒経ったら消える（最長6秒）
const splash = signal<'on' | 'out' | 'gone'>('on');
const t0 = Date.now();
// ?splash=3000 のように付けると最短表示時間を変えられる（確認用）
const SPLASH_MIN = Number(new URLSearchParams(location.search).get('splash')) || 900;
function hideSplash() {
  if (splash.value !== 'on') return;
  splash.value = 'out';
  window.setTimeout(() => { splash.value = 'gone'; }, 500);
}
effect(() => {
  const ready = !!bundle.value || !!error.value;
  if (!ready) return;
  const wait = Math.max(0, SPLASH_MIN - (Date.now() - t0));
  window.setTimeout(hideSplash, wait);
});
window.setTimeout(hideSplash, Math.max(6000, SPLASH_MIN + 500));

function Splash() {
  if (splash.value === 'gone') return null;
  return (
    <div class={`splash${splash.value === 'out' ? ' out' : ''}`} aria-hidden="true">
      <div class="blobs"><i class="b1" /><i class="b2" /><i class="b3" /></div>
      <picture class="splash-logo">
        <source srcset="./logo-w.png" media="(prefers-color-scheme: dark)" />
        <img src="./logo.png" alt="RAMUSE" />
      </picture>
      {IS_KID && <span class="splash-tag">KIDS</span>}
    </div>
  );
}

export function App() {
  const r = route.value;
  let view;
  const m = r.match(/^\/contest\/([^/]+)/);
  if (m) view = <ContestDetail id={decodeURIComponent(m[1])} />;
  else if (r.startsWith('/contests')) view = <Contests />;
  else if (r.startsWith('/calendar')) view = <Calendar />;
  else if (r.startsWith('/money') && !IS_KID) view = <Money />;
  else view = <Home />;

  return (
    <>
      <div class="blobs" aria-hidden="true"><i class="b1" /><i class="b2" /><i class="b3" /></div>
      <main class="page">{view}</main>
      <Splash />
      {(syncing.value && !bundle.value) && <div class="sync"><Icon name="progress_activity" />読み込み中</div>}
      {(syncing.value && bundle.value) && <div class="sync"><Icon name="progress_activity" />更新中</div>}
      {(!syncing.value && error.value) && <div class="sync" style="color:var(--red)"><Icon name="cloud_off" style="animation:none" />通信できません。前回のデータを表示中</div>}
      <nav class="tabbar" aria-label="主要タブ">
        <TabButton id="home" icon="home" label="ホーム" path="/" />
        <TabButton id="contests" icon="emoji_events" label="大会" path="/contests" />
        <TabButton id="calendar" icon="calendar_month" label="カレンダー" path="/calendar" />
        {!IS_KID && <TabButton id="money" icon="account_balance_wallet" label="お金" path="/money" />}
      </nav>
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
