import { render } from 'preact';
import './styles.css';
import { App } from './app';
import { boot } from './store';
import { APP_MODE } from './api';

document.documentElement.setAttribute('data-mode', APP_MODE);
try { if (localStorage.getItem('ramuse.noblur') === '1') document.documentElement.setAttribute('data-noblur', '1'); } catch { /* noop */ }

boot();
render(<App />, document.getElementById('app')!);
