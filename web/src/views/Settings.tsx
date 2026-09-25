// 設定：燃料の単価・PIN・ぼかし（車と行き先は登録しない。車代の記録のたびにその場で入れる）
import { useState } from 'preact/hooks';
import { settings, saveSetting } from '../store';
import { setPin } from '../api';
import { num } from '../model';
import { Icon, Glass, SectionHead } from '../ui';
import { go } from '../router';

// シートのキーは昔のまま。「ガソリン単価」がレギュラー
const FUELS = [{ key: 'ガソリン単価', label: 'レギュラー' }, { key: 'ハイオク単価', label: 'ハイオク' }];

export function Settings() {
  const [price, setPrice] = useState<Record<string, string>>(() => Object.fromEntries(FUELS.map((f) => [f.key, String(settings.value[f.key] || '')])));
  const noblur = (() => { try { return localStorage.getItem('ramuse.noblur') === '1'; } catch { return false; } })();

  async function savePrice(key: string) {
    const v = num(price[key]);
    if (v > 0 && String(settings.value[key] ?? '') !== String(v)) await saveSetting(key, v);
  }
  function toggleBlur() {
    try { if (noblur) localStorage.removeItem('ramuse.noblur'); else localStorage.setItem('ramuse.noblur', '1'); } catch { /* */ }
    location.reload();
  }
  return (
    <>
      <div class="back"><button style="display:flex;align-items:center;gap:4px" onClick={() => go('/money')}><Icon name="arrow_back_ios_new" />お金</button><span class="ttl" style="margin-left:auto;margin-right:auto;font-weight:700;font-size:15px">設定</span><span style="width:50px" /></div>
      <div class="sec"><SectionHead title="燃料の単価 · 1Lあたり" />
        <Glass className="list">
          {FUELS.map((f) => (
            <div class="row"><span class="tile t-orange"><Icon name="local_gas_station" /></span><div class="t">{f.label}<small>記録のときにも直せます</small></div>
              <input class="amt-in" type="number" inputMode="numeric" placeholder="¥" value={price[f.key]} onInput={(e) => setPrice({ ...price, [f.key]: (e.target as HTMLInputElement).value })} onBlur={() => savePrice(f.key)} /></div>
          ))}
        </Glass>
        <div class="hint"><Icon name="info" /><span>車と行き先は登録しません。車代を記録するときに、距離・燃費・燃料をその場で入れます（燃費と燃料は前回の値が入ります）</span></div>
      </div>
      <div class="sec"><SectionHead title="この端末" />
        <Glass className="list">
          <button class="row" onClick={() => { setPin(''); alert('次に保存するときにPINを聞きます'); }}><span class="tile t-mu"><Icon name="password" /></span><div class="t">PINを忘れさせる<small>次の保存時に聞き直します</small></div><Icon name="chevron_right" style="color:var(--mu2)" /></button>
          <button class="row" onClick={toggleBlur}><span class="tile t-mu"><Icon name="blur_on" /></span><div class="t">ガラスのぼかし<small>{noblur ? 'オフ（軽い）。タップでオン' : 'オン。重い端末はタップでオフ'}</small></div><Icon name="chevron_right" style="color:var(--mu2)" /></button>
        </Glass>
      </div>
    </>
  );
}
