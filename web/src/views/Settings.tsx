// 設定：車・ガソリン単価・行き先・PIN・ぼかし
import { useState } from 'preact/hooks';
import { cars, settings, destinations, saveCars, saveSetting, saveDestination, deleteDestination, families } from '../store';
import { setPin } from '../api';
import { num, yen, famJa } from '../model';
import type { Destination } from '../types';
import { Icon, Glass, SectionHead, Avatar } from '../ui';
import { go } from '../router';

export function Settings() {
  const [fe, setFe] = useState<Record<string, string>>(() => Object.fromEntries(cars.value.map((c) => [c.家族, String(c.燃費)])));
  const [gas, setGas] = useState(String(settings.value['ガソリン単価'] || ''));
  const [edit, setEdit] = useState<Destination | null>(null);
  const noblur = (() => { try { return localStorage.getItem('ramuse.noblur') === '1'; } catch { return false; } })();
  const fams = families.value;

  async function saveCarsNow() {
    await saveCars(fams.map((f) => ({ 家族: f, 車名: cars.value.find((c) => c.家族 === f)?.車名 || `${f}の車`, 燃費: num(fe[f]) || 15 })));
  }
  async function saveGas() { if (num(gas) > 0) { await saveSetting('ガソリン単価', num(gas)); } }
  async function saveDest() {
    if (!edit || !edit.名前.trim()) return;
    await saveDestination({ ...edit, 片道距離: num(edit.片道距離), 行き高速代: num(edit.行き高速代), 帰り高速代: num(edit.帰り高速代) });
    setEdit(null);
  }
  function toggleBlur() {
    try { if (noblur) localStorage.removeItem('ramuse.noblur'); else localStorage.setItem('ramuse.noblur', '1'); } catch { /* */ }
    location.reload();
  }
  return (
    <>
      <div class="back"><button style="display:flex;align-items:center;gap:4px" onClick={() => go('/money')}><Icon name="arrow_back_ios_new" />お金</button><span class="ttl" style="margin-left:auto;margin-right:auto;font-weight:700;font-size:15px">設定</span><span style="width:50px" /></div>
      <div class="sec"><SectionHead title="車 · 家族に1台" />
        <Glass className="list">
          {fams.map((f) => (
            <div class="row"><Avatar fam={f} on /><div class="t">{famJa(f)}の車</div>
              <input class="amt-in" type="number" inputMode="decimal" value={fe[f] ?? ''} onInput={(e) => setFe({ ...fe, [f]: (e.target as HTMLInputElement).value })} onBlur={saveCarsNow} /><span class="unit" style="font-size:11px;color:var(--mu)">km/L</span></div>
          ))}
        </Glass>
      </div>
      <div class="sec"><SectionHead title="ガソリン単価" />
        <Glass className="list"><div class="row"><span class="tile t-orange"><Icon name="local_gas_station" /></span><div class="t">1Lあたり<small>車の記録の初期値。記録時にも直せます</small></div><input class="amt-in" type="number" inputMode="numeric" value={gas} onInput={(e) => setGas((e.target as HTMLInputElement).value)} onBlur={saveGas} /></div></Glass>
      </div>
      <div class="sec"><SectionHead title="行き先 · 出発は桑名" more="追加" onMore={() => setEdit({ ID: '', 名前: '', 片道距離: 0, 行き高速代: 0, 帰り高速代: 0, メモ: '' })} />
        <Glass className="list">
          {destinations.value.map((d) => (
            <button class="row" onClick={() => setEdit({ ...d })}><div class="t">{d.名前}<small>{d.メモ || '—'}</small></div><div class="v">{d.片道距離} km<small>行 {yen(d.行き高速代)} · 帰 {yen(d.帰り高速代)}</small></div></button>
          ))}
          {destinations.value.length === 0 && <div class="empty">まだありません。車の記録で自動的に増えます</div>}
        </Glass>
      </div>
      {edit && (
        <Glass className="fgrp" style="margin-top:10px">
          <div class="fld"><span class="lb">名前</span><div class="in"><input value={edit.名前} placeholder="会場名" onInput={(e) => setEdit({ ...edit, 名前: (e.target as HTMLInputElement).value })} /></div></div>
          <div class="fld"><span class="lb">片道</span><div class="in"><input class="n" type="number" inputMode="decimal" value={String(edit.片道距離 || '')} onInput={(e) => setEdit({ ...edit, 片道距離: num((e.target as HTMLInputElement).value) })} /><span class="unit">km</span></div></div>
          <div class="fld"><span class="lb">高速代</span><div class="in"><input class="n" type="number" inputMode="numeric" value={String(edit.行き高速代 || '')} onInput={(e) => setEdit({ ...edit, 行き高速代: num((e.target as HTMLInputElement).value) })} /><span class="unit">行き</span><input class="n" type="number" inputMode="numeric" value={String(edit.帰り高速代 || '')} onInput={(e) => setEdit({ ...edit, 帰り高速代: num((e.target as HTMLInputElement).value) })} /><span class="unit">帰り</span></div></div>
          <div class="fld"><span class="lb">メモ</span><div class="in"><input value={edit.メモ} placeholder="IC名など" onInput={(e) => setEdit({ ...edit, メモ: (e.target as HTMLInputElement).value })} /></div></div>
          <div class="fld" style="gap:8px">
            <button class="save" style="height:42px;font-size:14px" onClick={saveDest}><Icon name="check" />保存</button>
            {edit.ID && <button class="save sub" style="height:42px;color:var(--red)" onClick={async () => { if (confirm(`「${edit.名前}」を削除しますか？`)) { await deleteDestination(edit.ID); setEdit(null); } }}><Icon name="delete" /></button>}
            <button class="save sub" style="height:42px" onClick={() => setEdit(null)}>閉じる</button>
          </div>
        </Glass>
      )}
      <div class="sec"><SectionHead title="この端末" />
        <Glass className="list">
          <button class="row" onClick={() => { setPin(''); alert('次に保存するときにPINを聞きます'); }}><span class="tile t-mu"><Icon name="password" /></span><div class="t">PINを忘れさせる<small>次の保存時に聞き直します</small></div><Icon name="chevron_right" style="color:var(--mu2)" /></button>
          <button class="row" onClick={toggleBlur}><span class="tile t-mu"><Icon name="blur_on" /></span><div class="t">ガラスのぼかし<small>{noblur ? 'オフ（軽い）。タップでオン' : 'オン。重い端末はタップでオフ'}</small></div><Icon name="chevron_right" style="color:var(--mu2)" /></button>
        </Glass>
      </div>
    </>
  );
}
