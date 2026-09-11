// V2.gs の変換ロジックを Node で実データJSONに流すドライラン。
//   使い方: node docs/tools/v2-dryrun.mjs <contests.json> <trips.json> [today]
//   contests.json = exec?action=init の返り、trips.json = exec?action=rpc&method=getAllTripData の返り
import fs from 'node:fs';
import vm from 'node:vm';
const [,, contestsPath, tripsPath, today = new Date().toISOString().slice(0, 10)] = process.argv;
const src = fs.readFileSync(new URL('../../V2.gs', import.meta.url), 'utf8');
const ctx = { console, Logger: { log: (s) => console.log(s) }, JSON, Math, Date, Object, Array, String, parseFloat, isNaN };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.v2Transform_ = v2Transform_; this.v2Verify_ = v2Verify_;', ctx);
const contests = JSON.parse(fs.readFileSync(contestsPath, 'utf8')).contests;
let trips = JSON.parse(fs.readFileSync(tripsPath, 'utf8'));
if (trips.value) trips = trips.value;
const res = ctx.v2Transform_({
  contests, projects: trips.projects || [], recordsByProject: trips.recordsByProject || {},
  carSettings: trips.carSettings || [], savedRoutes: trips.savedRoutes || [],
  families: ['Airi', 'Miha', 'Rinka'], today
});
const { data, report } = res;
console.log('== counts', JSON.stringify(report.counts));
console.log('== balance', JSON.stringify(report.balance));
console.log('== warnings (' + report.warnings.length + ')'); report.warnings.forEach((w) => console.log('  - ' + w));
console.log('== notes (' + report.notes.length + ')'); report.notes.forEach((w) => console.log('  - ' + w));
console.log('== tasks by kind', JSON.stringify(data.tasks.reduce((m, t) => (m[t['種別']] = (m[t['種別']] || 0) + 1, m), {})));
console.log('== open tasks (未済・未来)'); data.tasks.filter((t) => !t['済']).forEach((t) => { const c = data.contests.find((x) => x.ID === t['大会ID']); console.log('  ' + c['開催日'] + ' ' + c['コンテスト名'].slice(0, 22) + ' | ' + t['名前'] + (t['当日'] ? ' [当日]' : ' 期限 ' + t['期限日']) + (t['単価'] ? ' ¥' + t['単価'] + '×' + t['数量'] : '')); });
console.log('== ledger'); data.ledger.forEach((l) => console.log('  ' + l['日付'] + ' ' + l['種別'].padEnd(7) + ' ¥' + String(l['合計']).padStart(6) + ' 払 ' + l['支払者'].padEnd(5) + ' ' + l['内容'].slice(0, 40) + ' | 負担 ' + l['負担JSON']));
console.log('== destinations'); data.destinations.forEach((d) => console.log('  ', d));
console.log('== cars', JSON.stringify(data.cars));
console.log('== settings', JSON.stringify(data.settings));
if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(data, null, 1));
