// ルーティング（hash）とタブバー。大人用4タブ／子供用3タブ
import { computed } from '@preact/signals';
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
