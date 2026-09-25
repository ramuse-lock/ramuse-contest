// ============================================================
// RAMUSE v2 データ層（UI刷新 2026-09）
//   情報モデル：大会v2 ／ やること ／ 台帳 ＋ マスタ（行き先・車・設定）
//   設計書：docs/2026-09-11_データ移行設計.md
//
//   - migrateV2Dry()  : 書き込まずに変換結果と残高検証を返す（GASエディタから実行）
//   - migrateV2Run()  : 全シートをバックアップ → v2シートを作成/クリア → 書き込み
//   - getV2Bundle(mode): v2読み取りAPI（adult / kid）。serveApi の action=v2 から呼ぶ
//   変換ロジック（v2Transform_ / v2Verify_）は SpreadsheetApp に依存しない純関数。
//   Node で実データJSONを流して検証できる（docs/tools/v2-dryrun.mjs）。
// ============================================================

var V2_SHEETS = {
  CONTESTS: '大会v2',
  TASKS: 'やること',
  LEDGER: '台帳',
  DEST: '行き先',
  CARS: '車',
  SETTINGS: '設定'
};

var V2_HEADERS = {
  CONTESTS: ['ID','コンテスト名','開催日','会場','部門','ラウンド','シリーズ名','決勝ステータス',
             '集合時間','開始時間','終了時間','出演順','総組数','URL','Instagram','資料JSON','結果','結果詳細',
             'キャンセル','メモ','更新日時','旧行番号'],
  TASKS:    ['ID','大会ID','種別','名前','期限日','当日','済','済日','単価','数量','内訳JSON','台帳ID','メモ','表示順'],
  LEDGER:   ['ID','日付','内容','種別','合計','支払者','大会ID','明細JSON','負担JSON','車JSON','メモ','作成日時'],
  DEST:     ['ID','名前','片道距離','行き高速代','帰り高速代','メモ'],
  CARS:     ['家族','車名','燃費'],
  SETTINGS: ['キー','値']
};

// ---------- 小道具（純関数） ----------
function v2Bool_(v) {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === '✓' || s === 'はい';
}
function v2Num_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function v2R10_(n) { return Math.round(n / 10) * 10; }
function v2Str_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function v2DateStr_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    var y = v.getFullYear(), m = ('0' + (v.getMonth() + 1)).slice(-2), d = ('0' + v.getDate()).slice(-2);
    return y + '-' + m + '-' + d;
  }
  var s = String(v).trim();
  var m1 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m1) return m1[1] + '-' + ('0' + m1[2]).slice(-2) + '-' + ('0' + m1[3]).slice(-2);
  var d2 = new Date(s);
  if (!isNaN(d2.getTime())) return v2DateStr_(d2);
  return '';
}
function v2TimeStr_(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return ('0' + v.getHours()).slice(-2) + ':' + ('0' + v.getMinutes()).slice(-2);
  }
  var s = String(v).trim();
  var m = s.match(/(\d{1,2}):(\d{2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : s;
}
var v2UidSeq_ = 0;
function v2Uid_(prefix) {
  v2UidSeq_++;
  return prefix + '_' + Date.now().toString(36) + '_' + (v2UidSeq_).toString(36) + Math.random().toString(36).slice(2, 6);
}
function v2Share_(items, families, payer) {
  // 明細 [{amount,targets}] → 負担 {fam: amt}
  // 1明細ごとに等分して10円丸め。丸めの端数は支払者（対象に含まれなければ先頭の対象）が持ち、
  // 明細合計 ＝ 負担合計 を必ず保つ（台帳をゼロサムにして残高が狂わないようにする）
  var owed = {};
  families.forEach(function(f) { owed[f] = 0; });
  items.forEach(function(it) {
    var tg = (it.targets || []).filter(function(t) { return owed[t] !== undefined; });
    if (!tg.length) return;
    var amt = Math.round(v2Num_(it.amount));
    var per = v2R10_(amt / tg.length);
    var sum = 0;
    tg.forEach(function(t) { owed[t] += per; sum += per; });
    var rest = amt - sum;
    if (rest !== 0) {
      var absorber = (payer && tg.indexOf(payer) >= 0) ? payer : tg[0];
      owed[absorber] += rest;
    }
  });
  return owed;
}
function v2SumItems_(items) {
  return items.reduce(function(s, it) { return s + v2Num_(it.amount); }, 0);
}

// ---------- 変換（純関数） ----------
// input: { contests, projects, recordsByProject, carSettings, savedRoutes, families, today('YYYY-MM-DD') }
function v2Transform_(input) {
  var fams = input.families;
  var today = input.today;
  var report = { counts: {}, notes: [], warnings: [] };
  var out = { contests: [], tasks: [], ledger: [], destinations: [], cars: [], settings: [] };

  // ---- 大会 ----
  var idByRow = {};
  var contestsByDate = {};
  (input.contests || []).forEach(function(c) {
    var name = v2Str_(c['コンテスト名']);
    if (!name) return;
    var id = v2Uid_('c');
    idByRow[c['_rowIndex']] = id;
    var date = v2DateStr_(c['開催日']);
    var docs = [];
    for (var i = 1; i <= 5; i++) {
      var url = v2Str_(c['資料' + i + '_URL']);
      if (url) docs.push({ label: v2Str_(c['資料' + i + '_ラベル']) || ('資料' + i), url: url });
    }
    var round = v2Str_(c['ラウンド']) || '単発';
    var cancelled = v2Str_(c['ステータス']) === 'キャンセル';
    var memo = [v2Str_(c['備考']), v2Str_(c['問い合わせメモ']), v2Str_(c['音源_備考']) ? ('音源: ' + v2Str_(c['音源_備考'])) : '']
      .filter(function(s) { return s; }).join('\n');
    out.contests.push({
      'ID': id, 'コンテスト名': name, '開催日': date, '会場': v2Str_(c['会場']), '部門': v2Str_(c['部門']),
      'ラウンド': round, 'シリーズ名': v2Str_(c['大会シリーズ名']),
      '決勝ステータス': round === '決勝' ? (v2Str_(c['決勝_ステータス']) === '決勝予定' ? '進出未定' : v2Str_(c['決勝_ステータス'])) : '',
      '集合時間': v2TimeStr_(c['集合時間']), '開始時間': v2TimeStr_(c['開始時間']), '終了時間': v2TimeStr_(c['終了時間']),
      '出演順': v2Num_(c['出演順番']) || '', '総組数': v2Num_(c['総組数']) || '',
      'URL': v2Str_(c['URL']), '資料JSON': docs.length ? JSON.stringify(docs) : '',
      '結果': v2Str_(c['結果']), '結果詳細': v2Str_(c['結果_詳細']),
      'キャンセル': cancelled, 'メモ': memo, '更新日時': today, '旧行番号': c['_rowIndex'] || ''
    });
    if (date) { contestsByDate[date] = contestsByDate[date] || []; contestsByDate[date].push(id); }

    // ---- やること（大会ごとに生成） ----
    var isPast = !!date && date < today;
    var order = 0;
    function task(kind, label, opts) {
      opts = opts || {};
      var done = !!opts.done;
      if (isPast) done = true; // 開催済みの大会に「準備中」を残さない
      out.tasks.push({
        'ID': v2Uid_('t'), '大会ID': id, '種別': kind, '名前': label,
        '期限日': opts.today ? '' : (opts.deadline || ''), '当日': !!opts.today,
        '済': done, '済日': done ? (isPast ? date : today) : '',
        '単価': opts.unit || '', '数量': opts.qty || '', '台帳ID': opts.ledgerId || '',
        'メモ': opts.memo || '', '表示順': ++order
      });
      return out.tasks[out.tasks.length - 1];
    }
    // エントリー
    task('entry', 'エントリー', { deadline: v2DateStr_(c['エントリー_期限']), done: v2Str_(c['エントリー_状況']) === '提出済' });
    // 音源
    var music = v2Str_(c['音源_要否']);
    if (music === '事前') {
      task('music', '音源 事前提出', { deadline: v2DateStr_(c['音源_期限']), done: v2Str_(c['音源_状況']) === '提出済' });
      if (v2Bool_(c['音源_当日CD'])) task('backup_cd', '予備CD 持参', { today: true });
    } else if (music === '当日CD') {
      task('backup_cd', '音源CD 持参', { today: true });
      if (v2Bool_(c['音源_予備データ'])) task('backup_cd', '予備データ 持参', { today: true });
    }
    // 動画・写真
    ['動画', '写真'].forEach(function(k) {
      var need = v2Str_(c[k + '_要否']);
      if (need && need !== '不要') {
        task('other', k + ' 提出', { deadline: v2DateStr_(c[k + '_期限']), done: v2Str_(c[k + '_状況']) === '提出済', memo: v2Str_(c[k + '_URL']) });
      }
    });
    // エントリー費
    var feeAmt = v2Num_(c['エントリー費_金額']);
    var feeMethod = v2Str_(c['エントリー費_支払方法']);
    var feeTask = null;
    if (feeAmt > 0) {
      if (feeMethod === '当日') {
        feeTask = task('entry_fee', 'エントリー費 持参', { today: true, unit: feeAmt, qty: fams.length });
      } else {
        feeTask = task('entry_fee', 'エントリー費 ' + (feeMethod || '振込'), { deadline: v2DateStr_(c['エントリー費_期限']), done: v2Bool_(c['エントリー費_振込済']), unit: feeAmt, qty: fams.length });
      }
    }
    // 観覧費
    var adultP = v2Num_(c['観覧費_大人_単価']), childP = v2Num_(c['観覧費_子供_単価']);
    var viewMethod = v2Str_(c['観覧費_支払方法']);
    var freeOne = v2Bool_(c['観覧費_付き添い無料']);
    var viewTask = null;
    var viewByFam = {};
    var adultsTotal = 0;
    if (viewMethod && viewMethod !== '不要' && (adultP > 0 || childP > 0)) {
      fams.forEach(function(f) {
        var ad = v2Num_(c[f + '_観覧費_大人']), ch = v2Num_(c[f + '_観覧費_子供']);
        adultsTotal += ad;
        viewByFam[f] = (ad > 0 ? adultP * (freeOne ? Math.max(0, ad - 1) : ad) : 0) + childP * ch;
      });
      var qty = adultsTotal || fams.length;
      if (viewMethod === '当日支払い') {
        viewTask = task('view_fee', '観覧費 現金', { today: true, unit: adultP, qty: qty, memo: childP ? ('子供 ¥' + childP) : '' });
      } else {
        viewTask = task('view_fee', '観覧費 事前振込', { deadline: v2DateStr_(c['観覧費_期限']), done: v2Bool_(c['観覧費_振込済']), unit: adultP, qty: qty, memo: childP ? ('子供 ¥' + childP) : '' });
      }
    }

    // ---- 台帳：大会側のお金（過去 or 振込済のものだけ履歴として移す） ----
    function feeLedger(kind, label, unitByFam, paidFlagKey, collectedFlagKey, dateStr, linkTask) {
      var items = [];
      fams.forEach(function(f) {
        var amt = unitByFam[f];
        if (amt > 0) items.push({ label: label + '（' + f + '）', amount: amt, targets: [f] });
      });
      if (!items.length) return;
      var total = v2SumItems_(items);
      var owed = v2Share_(items, fams, 'Rinka');
      var row = {
        'ID': v2Uid_('l'), '日付': dateStr || date, '内容': name + ' ' + label, '種別': 'fee', '合計': total,
        '支払者': 'Rinka', '大会ID': id, '明細JSON': JSON.stringify(items), '負担JSON': JSON.stringify(owed),
        '車JSON': '', 'メモ': '移行：大会側の' + label + '（支払者はまとめ払い前提でRinka）', '作成日時': today
      };
      out.ledger.push(row);
      if (linkTask) linkTask['台帳ID'] = row['ID'];
      // 集金済みの家族 → 精算行
      fams.forEach(function(f) {
        if (f === 'Rinka') return;
        var amt = owed[f];
        if (amt <= 0) return;
        if (v2Bool_(c[f + '_' + collectedFlagKey])) {
          out.ledger.push({
            'ID': v2Uid_('l'), '日付': dateStr || date, '内容': '精算 ' + f + ' → Rinka（' + name + ' ' + label + '）', '種別': 'settle', '合計': amt,
            '支払者': f, '大会ID': id, '明細JSON': JSON.stringify([{ label: '精算', amount: amt, targets: ['Rinka'] }]),
            '負担JSON': JSON.stringify(v2Share_([{ amount: amt, targets: ['Rinka'] }], fams, f)), '車JSON': '',
            'メモ': '移行：旧「' + f + '_' + collectedFlagKey + '」= TRUE', '作成日時': today
          });
        } else if (isPast) {
          report.warnings.push('未集金フラグ（過去大会）: ' + date + ' ' + name + ' ' + label + ' ' + f + ' ¥' + amt + ' → 残高に残ります。実際に未集金でなければ台帳で精算行を足す');
        }
      });
    }
    if (feeAmt > 0 && (isPast || v2Bool_(c['エントリー費_振込済']))) {
      var byFam = {}; fams.forEach(function(f) { byFam[f] = feeAmt; });
      feeLedger('fee', 'エントリー費', byFam, 'エントリー費_振込済', 'エントリー費_支払済', v2DateStr_(c['エントリー費_期限']) || date, feeTask);
    }
    if (viewTask && (isPast || v2Bool_(c['観覧費_振込済'])) && Object.keys(viewByFam).length) {
      feeLedger('fee', '観覧費', viewByFam, '観覧費_振込済', '観覧費_支払済', v2DateStr_(c['観覧費_期限']) || date, viewTask);
    }
    // 大会側の交通費・その他（対象フラグのある家族で割る）
    var transTotal = v2Num_(c['交通費_ガソリン代']) + v2Num_(c['交通費_ETC']);
    if (transTotal > 0) {
      var tTargets = fams.filter(function(f) { return v2Bool_(c[f + '_交通費_対象']); });
      if (tTargets.length) {
        var items = [{ label: '交通費（ガソリン・ETC）', amount: transTotal, targets: tTargets }];
        out.ledger.push({
          'ID': v2Uid_('l'), '日付': date, '内容': name + ' 交通費', '種別': 'car', '合計': transTotal, '支払者': 'Rinka', '大会ID': id,
          '明細JSON': JSON.stringify(items), '負担JSON': JSON.stringify(v2Share_(items, fams, 'Rinka')), '車JSON': '',
          'メモ': '移行：大会側の交通費（支払者はRinka前提）', '作成日時': today
        });
        report.warnings.push('大会側の交通費あり: ' + date + ' ' + name + ' ¥' + transTotal + ' 対象=' + tTargets.join('・') + '（おでかけ記録と重複していないか確認）');
        tTargets.forEach(function(f) {
          if (f !== 'Rinka' && v2Bool_(c[f + '_交通費_支払済'])) {
            var per = v2R10_(transTotal / tTargets.length);
            out.ledger.push({ 'ID': v2Uid_('l'), '日付': date, '内容': '精算 ' + f + ' → Rinka（' + name + ' 交通費）', '種別': 'settle', '合計': per, '支払者': f, '大会ID': id,
              '明細JSON': JSON.stringify([{ label: '精算', amount: per, targets: ['Rinka'] }]), '負担JSON': JSON.stringify(v2Share_([{ amount: per, targets: ['Rinka'] }], fams, f)), '車JSON': '', 'メモ': '移行', '作成日時': today });
          }
        });
      }
    }
    var otherAmt = v2Num_(c['その他_金額']);
    if (otherAmt > 0) {
      var oTargets = fams.filter(function(f) { return v2Bool_(c[f + '_その他_対象']); });
      if (oTargets.length) {
        var oItems = [{ label: v2Str_(c['その他_用途']) || 'その他', amount: otherAmt, targets: oTargets }];
        out.ledger.push({ 'ID': v2Uid_('l'), '日付': date, '内容': name + ' ' + (v2Str_(c['その他_用途']) || 'その他'), '種別': 'other', '合計': otherAmt, '支払者': 'Rinka', '大会ID': id,
          '明細JSON': JSON.stringify(oItems), '負担JSON': JSON.stringify(v2Share_(oItems, fams, 'Rinka')), '車JSON': '', 'メモ': '移行：大会側のその他（支払者はRinka前提）', '作成日時': today });
        oTargets.forEach(function(f) {
          if (f !== 'Rinka' && v2Bool_(c[f + '_その他_集金済'])) {
            var per2 = v2R10_(otherAmt / oTargets.length);
            out.ledger.push({ 'ID': v2Uid_('l'), '日付': date, '内容': '精算 ' + f + ' → Rinka（' + name + ' その他）', '種別': 'settle', '合計': per2, '支払者': f, '大会ID': id,
              '明細JSON': JSON.stringify([{ label: '精算', amount: per2, targets: ['Rinka'] }]), '負担JSON': JSON.stringify(v2Share_([{ amount: per2, targets: ['Rinka'] }], fams, f)), '車JSON': '', 'メモ': '移行', '作成日時': today });
          }
        });
      }
    }
  });

  // ---- 台帳：おでかけ記録 ----
  var destMap = {}; // 名前 → {距離, 行き, 帰り, メモ, 最新日付}
  var latestGas = 0, latestGasDate = '';
  var projects = input.projects || [];
  var recordsByProject = input.recordsByProject || {};
  projects.forEach(function(p) {
    var recs = recordsByProject[String(p['ID'])] || [];
    var projNet = {}; fams.forEach(function(f) { projNet[f] = 0; });
    recs.forEach(function(r) {
      var d = v2DateStr_(r['日付']);
      var payer = v2Str_(r['支払者']) || 'Rinka';
      var passengers = v2Str_(r['乗車メンバー']).split(',').map(function(s) { return s.trim(); }).filter(function(s) { return fams.indexOf(s) >= 0; });
      var sameRoute = v2Bool_(r['往復']);
      var outAmt = v2Num_(r['高速料金']), retAmt = v2Num_(r['復路料金']);
      var outDist = v2Num_(r['走行距離']), retDist = v2Num_(r['復路距離']);
      var highway = sameRoute ? outAmt * 2 : outAmt + retAmt;
      var dist = sameRoute ? outDist * 2 : outDist + retDist;
      if (v2Bool_(r['ETC割引'])) highway = Math.floor(highway * 0.7);
      var gasUnit = v2Num_(r['ガソリン単価']);
      var fe = v2Num_(r['燃費']) || 15;
      var gas = (gasUnit > 0 && dist > 0 && fe > 0) ? Math.floor(gasUnit * dist / fe) : 0;
      var parking = v2Bool_(r['駐車場有無']) ? v2Num_(r['駐車場料金']) : 0;
      var items = [];
      if (gas > 0) items.push({ label: 'ガソリン', amount: gas, targets: passengers });
      if (highway > 0) items.push({ label: '高速', amount: highway, targets: passengers });
      if (parking > 0) items.push({ label: '駐車場', amount: parking, targets: passengers });
      var others = [];
      try { var raw = r['その他費用JSON']; if (raw) others = JSON.parse(raw); } catch (e) { others = []; }
      if (!Array.isArray(others)) others = [];
      others.forEach(function(o) {
        var amt = v2Num_(o.amount); if (amt <= 0) return;
        var tg = Array.isArray(o.targets) ? o.targets.filter(function(t) { return fams.indexOf(t) >= 0; }) : [];
        if (!tg.length) return;
        items.push({ label: v2Str_(o.label) || 'その他', amount: amt, targets: tg });
      });
      if (!items.length) { report.notes.push('空のおでかけ記録をスキップ: ' + d + ' ' + v2Str_(r['目的'])); return; }
      var carCost = gas + highway + parking;
      var total = v2SumItems_(items);
      var isCar = carCost > 0 && carCost >= total / 2; // 食事が主なら receipt 扱い（車JSONは残す）
      var owed = v2Share_(items, fams, payer);
      var contestId = (contestsByDate[d] || [])[0] || '';
      var dest = v2Str_(r['目的地']);
      var carJson = '';
      if (carCost > 0) {
        carJson = JSON.stringify({ '行き先': dest, '運転者': v2Str_(r['運転者']) || payer, '往復': sameRoute, '距離': dist, '燃費': fe, '単価': gasUnit, '駐車場': parking,
          '行き区間': v2Str_(r['高速区間']), '帰り区間': v2Str_(r['復路区間']) });
        if (dest && outDist > 0) {
          var prev = destMap[dest];
          if (!prev || (d >= prev.date && (outAmt > 0 || !prev.go))) {
            destMap[dest] = { date: d, dist: outDist, go: outAmt, back: sameRoute ? outAmt : retAmt,
              memo: [v2Str_(r['高速区間']), sameRoute ? '往復' : v2Str_(r['復路区間'])].filter(function(s) { return s; }).join(' ／ ') };
          }
        }
        if (gasUnit > 0 && d >= latestGasDate) { latestGas = gasUnit; latestGasDate = d; }
      }
      var label = [v2Str_(p['プロジェクト名']), v2Str_(r['目的'])].filter(function(s) { return s; }).join(' ');
      if (dest && label.indexOf(dest) < 0 && !isCar) label += '（' + dest + '）';
      out.ledger.push({
        'ID': v2Uid_('l'), '日付': d, '内容': label || 'おでかけ', '種別': isCar ? 'car' : 'receipt', '合計': total, '支払者': payer, '大会ID': contestId,
        '明細JSON': JSON.stringify(items), '負担JSON': JSON.stringify(owed), '車JSON': carJson,
        'メモ': '移行：おでかけ「' + v2Str_(p['プロジェクト名']) + '」', '作成日時': today
      });
      fams.forEach(function(f) { projNet[f] -= owed[f]; });
      if (projNet[payer] !== undefined) projNet[payer] += total;
    });
    // 回収ステータス → 精算行（プロジェクト単位のネット送金を、貪欲法で作る）
    var cSt = {}; try { if (p['回収ステータス']) cSt = JSON.parse(p['回収ステータス']); } catch (e) { cSt = {}; }
    var transfers = v2Transfers_(projNet, fams);
    var settleDate = v2DateStr_(p['完了日']) || today;
    transfers.forEach(function(t) {
      if (cSt[t.from]) {
        out.ledger.push({ 'ID': v2Uid_('l'), '日付': settleDate, '内容': '精算 ' + t.from + ' → ' + t.to + '（' + v2Str_(p['プロジェクト名']) + '）', '種別': 'settle', '合計': t.amount,
          '支払者': t.from, '大会ID': '', '明細JSON': JSON.stringify([{ label: '精算', amount: t.amount, targets: [t.to] }]),
          '負担JSON': JSON.stringify(v2Share_([{ amount: t.amount, targets: [t.to] }], fams, t.from)), '車JSON': '',
          'メモ': '移行：おでかけ「' + v2Str_(p['プロジェクト名']) + '」回収ステータス', '作成日時': today });
      } else {
        report.warnings.push('おでかけ未集金: ' + v2Str_(p['プロジェクト名']) + ' ' + t.from + ' → ' + t.to + ' ¥' + t.amount + '（残高に残ります）');
      }
    });
  });

  // ---- マスタ ----
  Object.keys(destMap).forEach(function(name) {
    var dm = destMap[name];
    out.destinations.push({ 'ID': v2Uid_('d'), '名前': name, '片道距離': dm.dist, '行き高速代': dm.go, '帰り高速代': dm.back, 'メモ': dm.memo });
  });
  var carByFam = {};
  (input.carSettings || []).forEach(function(cs) {
    var nm = v2Str_(cs['名前']);
    fams.forEach(function(f) { if (nm.indexOf(f) === 0 && !carByFam[f]) carByFam[f] = { name: nm, fe: v2Num_(cs['燃費']) || 15 }; });
  });
  fams.forEach(function(f) {
    var cb = carByFam[f] || { name: f + 'の車', fe: 15 };
    out.cars.push({ '家族': f, '車名': cb.name, '燃費': cb.fe });
  });
  var pin = String(Math.floor(1000 + Math.random() * 9000));
  out.settings = [
    { 'キー': '家族名', '値': fams.join(',') },
    { 'キー': '出発地', '値': '桑名' },
    { 'キー': 'ガソリン単価', '値': latestGas || 165 },
    { 'キー': '大人用PIN', '値': pin }
  ];
  report.pin = pin;

  // ---- 並び・集計 ----
  out.ledger.sort(function(a, b) { return a['日付'] < b['日付'] ? -1 : a['日付'] > b['日付'] ? 1 : 0; });
  report.counts = {
    contests: out.contests.length, tasks: out.tasks.length, ledger: out.ledger.length,
    ledgerByKind: out.ledger.reduce(function(m, l) { m[l['種別']] = (m[l['種別']] || 0) + 1; return m; }, {}),
    destinations: out.destinations.length, cars: out.cars.length
  };
  report.balance = v2Verify_(out.ledger, fams);
  return { data: out, report: report };
}

// 残高：支払合計 − 負担合計（ネット）。＋が受け取る側
function v2Verify_(ledger, fams) {
  var paid = {}, owed = {};
  fams.forEach(function(f) { paid[f] = 0; owed[f] = 0; });
  ledger.forEach(function(l) {
    var payer = l['支払者'];
    if (paid[payer] !== undefined) paid[payer] += v2Num_(l['合計']);
    // 負担JSON は文字列（変換直後）でも、v2ReadSheet_ 済みのオブジェクトでも受ける
    var raw = l['負担JSON'];
    var o = {};
    if (raw && typeof raw === 'object') o = raw;
    else { try { o = JSON.parse(raw || '{}'); } catch (e) { o = {}; } }
    fams.forEach(function(f) { owed[f] += v2Num_(o[f]); });
  });
  var net = {}; fams.forEach(function(f) { net[f] = paid[f] - owed[f]; });
  return { paid: paid, owed: owed, net: net, transfers: v2Transfers_(net, fams) };
}
function v2Transfers_(net, fams) {
  var creditors = fams.filter(function(f) { return net[f] > 0; }).map(function(f) { return { name: f, amt: net[f] }; }).sort(function(a, b) { return b.amt - a.amt; });
  var debtors = fams.filter(function(f) { return net[f] < 0; }).map(function(f) { return { name: f, amt: -net[f] }; }).sort(function(a, b) { return b.amt - a.amt; });
  var out = []; var ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    var amt = Math.floor(Math.min(creditors[ci].amt, debtors[di].amt));
    if (amt > 0) out.push({ from: debtors[di].name, to: creditors[ci].name, amount: amt });
    creditors[ci].amt -= amt; debtors[di].amt -= amt;
    if (creditors[ci].amt < 1) ci++;
    if (debtors[di].amt < 1) di++;
  }
  return out;
}

// ---------- GAS 側：入力の収集・書き込み ----------
function v2CollectInput_() {
  var trip = getAllTripData();
  return {
    contests: getContests(),
    projects: trip.projects || [],
    recordsByProject: trip.recordsByProject || {},
    carSettings: trip.carSettings || [],
    savedRoutes: trip.savedRoutes || [],
    families: getFamilyNames(),
    today: v2DateStr_(new Date())
  };
}

function migrateV2Dry() {
  var res = v2Transform_(v2CollectInput_());
  var summary = { dryRun: true, counts: res.report.counts, balance: res.report.balance, warnings: res.report.warnings, notes: res.report.notes,
    sample: { contest: res.data.contests[0], task: res.data.tasks[0], ledger: res.data.ledger[0] } };
  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

function v2BackupAllSheets_() {
  var ss = getSpreadsheet();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var backup = SpreadsheetApp.create('RAMUSE_backup_' + stamp);
  ss.getSheets().forEach(function(sh) { sh.copyTo(backup).setName(sh.getName()); });
  var first = backup.getSheets()[0];
  if (backup.getSheets().length > 1 && first.getName() === 'シート1') backup.deleteSheet(first);
  return { id: backup.getId(), url: backup.getUrl(), name: backup.getName() };
}

function v2WriteSheet_(ss, name, headers, rows, color) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clearContents();
  var values = [headers].concat(rows.map(function(r) { return headers.map(function(h) { var v = r[h]; return (v === undefined || v === null) ? '' : v; }); }));
  // 日付・時刻・JSON・ID列はSheetsの自動変換を避けるためテキスト書式に。金額や数量は数値のまま
  var textCols = ['ID','大会ID','台帳ID','開催日','期限日','済日','日付','更新日時','作成日時','集合時間','開始時間','終了時間','資料JSON','明細JSON','負担JSON','車JSON','値','キー'];
  headers.forEach(function(h, i) {
    if (textCols.indexOf(h) >= 0) sh.getRange(1, i + 1, values.length, 1).setNumberFormat('@');
  });
  sh.getRange(1, 1, values.length, headers.length).setValues(values);
  sh.getRange(1, 1, 1, headers.length).setBackground(color || '#1D1D1F').setFontColor('#fff').setFontWeight('bold');
  sh.setFrozenRows(1);
  return values.length - 1;
}

function migrateV2Run() {
  var backup = v2BackupAllSheets_();
  var res = v2Transform_(v2CollectInput_());
  var ss = getSpreadsheet();
  var written = {
    contests: v2WriteSheet_(ss, V2_SHEETS.CONTESTS, V2_HEADERS.CONTESTS, res.data.contests, '#8A6F00'),
    tasks: v2WriteSheet_(ss, V2_SHEETS.TASKS, V2_HEADERS.TASKS, res.data.tasks, '#0A7AFF'),
    ledger: v2WriteSheet_(ss, V2_SHEETS.LEDGER, V2_HEADERS.LEDGER, res.data.ledger, '#28A745'),
    destinations: v2WriteSheet_(ss, V2_SHEETS.DEST, V2_HEADERS.DEST, res.data.destinations, '#30B0C7'),
    cars: v2WriteSheet_(ss, V2_SHEETS.CARS, V2_HEADERS.CARS, res.data.cars, '#30B0C7'),
    settings: v2WriteSheet_(ss, V2_SHEETS.SETTINGS, V2_HEADERS.SETTINGS, res.data.settings, '#6E6E73')
  };
  var summary = { dryRun: false, backup: backup, written: written, balance: res.report.balance, warnings: res.report.warnings, pin: res.report.pin };
  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

// ---------- 読み取りAPI ----------
function v2ReadSheet_(name) {
  var sh = getSpreadsheet().getSheetByName(name);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  if (values.length <= 1) return [];
  var headers = values[0].map(function(h) { return String(h).trim(); });
  return values.slice(1).filter(function(r) { return String(r[0]).trim() !== ''; }).map(function(row) {
    var o = {};
    headers.forEach(function(h, i) {
      var v = row[i];
      if (v === 'TRUE' || v === 'true') v = true;
      else if (v === 'FALSE' || v === 'false') v = false;
      else if (Object.prototype.toString.call(v) === '[object Date]') v = v2DateStr_(v);
      else if (h.slice(-4) === 'JSON' && v) { try { v = JSON.parse(v); } catch (e) {} }
      else if (typeof v === 'string' && v !== '' && /^-?\d+(\.\d+)?$/.test(v) && ['単価','数量','合計','片道距離','行き高速代','帰り高速代','燃費','出演順','総組数','表示順'].indexOf(h) >= 0) v = parseFloat(v);
      o[h] = v;
    });
    return o;
  });
}

function getV2Settings_() {
  var o = {};
  v2ReadSheet_(V2_SHEETS.SETTINGS).forEach(function(r) { o[r['キー']] = r['値']; });
  return o;
}

function v2CheckPin_(pin) {
  var s = getV2Settings_();
  var want = String(s['大人用PIN'] || '').trim();
  if (!want) return false; // 未設定なら書き込み不可（fail-closed）
  return String(pin || '').trim() === want;
}

// mode: 'adult' | 'kid'
function getV2Bundle(mode) {
  var kid = mode === 'kid';
  var fams = getFamilyNames();
  var contests = v2ReadSheet_(V2_SHEETS.CONTESTS);
  var tasks = v2ReadSheet_(V2_SHEETS.TASKS);
  var settings = getV2Settings_();
  var pub = { '家族名': settings['家族名'] || fams.join(','), '出発地': settings['出発地'] || '' };
  if (kid) {
    tasks = tasks.filter(function(t) {
      if (['entry_fee', 'view_fee'].indexOf(t['種別']) >= 0) return false; // お金のやることは返さない
      if (t['単価'] || t['内訳JSON']) return false;                       // 金額を持つものも返さない（家庭ごとの内訳も）
      // 当日の持ち物に加えて、エントリーだけは返す。
      // 「出場が決まっているか（グレーアウトするか）」の判定に使うため。金額は下で落とす
      return t['当日'] === true || t['種別'] === 'entry';
    })
      .map(function(t) { var k = {}; ['ID','大会ID','種別','名前','当日','済','メモ','表示順'].forEach(function(h) { k[h] = t[h]; }); return k; });
    return { mode: 'kid', families: fams, contests: contests, tasks: tasks, settings: pub, generatedAt: new Date().toISOString() };
  }
  var ledger = v2ReadSheet_(V2_SHEETS.LEDGER);
  pub['ガソリン単価'] = settings['ガソリン単価'] || '';
  pub['ハイオク単価'] = settings['ハイオク単価'] || ''; // 車代の燃料がハイオクのときの初期値（2026-09-25）
  return {
    mode: 'adult', families: fams, contests: contests, tasks: tasks, ledger: ledger,
    destinations: v2ReadSheet_(V2_SHEETS.DEST), cars: v2ReadSheet_(V2_SHEETS.CARS), settings: pub,
    balance: v2Verify_(ledger, fams), generatedAt: new Date().toISOString()
  };
}

// ============================================================
// 書き込みAPI（PIN必須）。serveApi の action=v2rpc から呼ぶ。
//   引数の先頭は常に pin。子供用ビルドはPINを持たないので書けない。
// ============================================================
function v2RequirePin_(pin) {
  if (!v2CheckPin_(pin)) throw new Error('PINが違います');
}
function v2Sheet_(name, headers) {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, headers.length).setValues([headers]); sh.setFrozenRows(1); }
  var last = Math.max(sh.getLastColumn(), 1);
  var cur = sh.getRange(1, 1, 1, last).getValues()[0].map(function(h) { return String(h).trim(); });
  // 足りないヘッダーは右に追加（例：カレンダーID）
  var added = false;
  headers.forEach(function(h) { if (cur.indexOf(h) < 0) { cur.push(h); added = true; } });
  if (added) sh.getRange(1, 1, 1, cur.length).setValues([cur.map(function(h) { return h; })]);
  return { sh: sh, headers: cur.filter(function(h) { return h; }) };
}
function v2CellValue_(h, v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}
function v2UpsertRow_(name, headers, obj) {
  var s = v2Sheet_(name, headers);
  var sh = s.sh, hs = s.headers;
  var id = String(obj['ID'] || '').trim();
  if (!id) throw new Error('IDがありません');
  var row = hs.map(function(h) { return v2CellValue_(h, obj[h]); });
  var lastRow = sh.getLastRow();
  var ids = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, 1).getValues().map(function(r) { return String(r[0]).trim(); }) : [];
  var idx = ids.indexOf(id);
  var textCols = ['ID','大会ID','台帳ID','開催日','期限日','済日','日付','更新日時','作成日時','集合時間','開始時間','終了時間','資料JSON','明細JSON','負担JSON','車JSON','値','キー','カレンダーID'];
  var r = idx >= 0 ? idx + 2 : lastRow + 1;
  hs.forEach(function(h, i) { if (textCols.indexOf(h) >= 0) sh.getRange(r, i + 1).setNumberFormat('@'); });
  sh.getRange(r, 1, 1, hs.length).setValues([row]);
  return obj;
}
function v2DeleteRow_(name, id) {
  var sh = getSpreadsheet().getSheetByName(name);
  if (!sh) return false;
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return false;
  var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues().map(function(r) { return String(r[0]).trim(); });
  var idx = ids.indexOf(String(id).trim());
  if (idx < 0) return false;
  sh.deleteRow(idx + 2);
  return true;
}
function v2FindRow_(name, id) {
  var rows = v2ReadSheet_(name);
  for (var i = 0; i < rows.length; i++) if (String(rows[i]['ID']) === String(id)) return rows[i];
  return null;
}

var V2_CONTEST_HEADERS_W = V2_HEADERS.CONTESTS.concat(['カレンダーID']);

// ---- 大会 ----
function saveContestV2(pin, c) {
  v2RequirePin_(pin);
  if (!c || !v2Str_(c['コンテスト名'])) throw new Error('大会名がありません');
  var prev = c['ID'] ? v2FindRow_(V2_SHEETS.CONTESTS, c['ID']) : null;
  c['ID'] = c['ID'] || v2Uid_('c');
  c['開催日'] = v2DateStr_(c['開催日']);
  ['集合時間', '開始時間', '終了時間'].forEach(function(k) { c[k] = v2TimeStr_(c[k]); });
  c['ラウンド'] = v2Str_(c['ラウンド']) || '単発';
  c['キャンセル'] = v2Bool_(c['キャンセル']);
  c['更新日時'] = new Date().toISOString();
  if (prev && prev['カレンダーID'] && !c['カレンダーID']) c['カレンダーID'] = prev['カレンダーID'];
  if (prev && prev['旧行番号'] && !c['旧行番号']) c['旧行番号'] = prev['旧行番号'];
  try { c['カレンダーID'] = v2SyncCalendar_(c, prev); } catch (e) { Logger.log('calendar sync failed: ' + e); }
  v2UpsertRow_(V2_SHEETS.CONTESTS, V2_CONTEST_HEADERS_W, c);
  return c;
}
function deleteContestV2(pin, id) {
  v2RequirePin_(pin);
  var prev = v2FindRow_(V2_SHEETS.CONTESTS, id);
  if (prev) { try { v2DeleteCalendarFor_(prev); } catch (e) { Logger.log('calendar delete failed: ' + e); } }
  // ぶら下がる「やること」も消す（台帳は履歴なので残す）
  v2ReadSheet_(V2_SHEETS.TASKS).filter(function(t) { return String(t['大会ID']) === String(id); })
    .forEach(function(t) { v2DeleteRow_(V2_SHEETS.TASKS, t['ID']); });
  return v2DeleteRow_(V2_SHEETS.CONTESTS, id);
}
// Googleカレンダーへ同期（旧アプリと同じ命名・色：決勝は【決勝進出】／【決勝・進出未定】、色5=黄・8=灰）
function v2SyncCalendar_(c, prev) {
  var cal = CalendarApp.getDefaultCalendar();
  var date = c['開催日'];
  var existingId = v2Str_(c['カレンダーID']) || (prev ? v2Str_(prev['カレンダーID']) : '');
  if (!date || c['キャンセル']) {
    if (existingId) { try { var ev0 = cal.getEventById(existingId); if (ev0) ev0.deleteEvent(); } catch (e) {} }
    return '';
  }
  var isFinal = c['ラウンド'] === '決勝';
  var fs = v2Str_(c['決勝ステータス']);
  var title = isFinal ? (fs === '進出決定' ? '【決勝進出】' : '【決勝・進出未定】') + c['コンテスト名'] : c['コンテスト名'];
  var color = isFinal && fs !== '進出決定' ? '8' : '5';
  var lines = [];
  if (c['集合時間']) lines.push('集合: ' + c['集合時間']);
  if (c['開始時間']) lines.push('開始: ' + c['開始時間'] + (c['終了時間'] ? ' - ' + c['終了時間'] : ''));
  if (c['出演順']) lines.push('出演順: ' + c['出演順'] + '番目' + (c['総組数'] ? ' / ' + c['総組数'] + '組' : ''));
  if (c['URL']) lines.push('詳細URL: ' + c['URL']);
  var desc = lines.join('\n');
  var loc = c['会場'] || '';
  var dayStart = combineCalendarDateTime_(date, '00:00');
  var dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
  var ev = null;
  if (existingId) { try { ev = cal.getEventById(existingId); } catch (e) { ev = null; } }
  if (!ev) {
    // 旧アプリが作ったイベント（同日・同名／旧タイトル）を引き継ぐ
    var cands = cal.getEvents(dayStart, dayEnd).filter(function(e) {
      var t = e.getTitle();
      return t === title || t === c['コンテスト名'] || t === '【決勝進出】' + c['コンテスト名'] || t === '【決勝・進出未定】' + c['コンテスト名'] || t === '【決勝予定】' + c['コンテスト名'];
    });
    if (cands.length) ev = cands[0];
  }
  if (ev) {
    setCalendarEventSchedule_(ev, date, c['開始時間'], c['終了時間'], 120);
    ev.setTitle(title); ev.setLocation(loc); ev.setDescription(desc);
    try { ev.setColor(color); } catch (e) {}
  } else {
    ev = createCalendarEvent_(cal, title, date, c['開始時間'], c['終了時間'], 120, { location: loc, description: desc });
    try { ev.setColor(color); } catch (e) {}
  }
  removeDuplicateContestEvents_(cal, title, dayStart, ev.getId());
  return ev.getId();
}

// 大会に対応するGoogleカレンダーのイベントを消す。
// 移行した大会にはカレンダーIDが無いので、その場合は開催日＋タイトルで探す
// （旧アプリは決勝に【決勝進出】【決勝・進出未定】【決勝予定】を付けていた）。
function v2DeleteCalendarFor_(c) {
  var cal = CalendarApp.getDefaultCalendar();
  var removed = 0;
  var id = v2Str_(c['カレンダーID']);
  if (id) {
    try { var ev = cal.getEventById(id); if (ev) { ev.deleteEvent(); removed++; } } catch (e) {}
  }
  var date = v2DateStr_(c['開催日']);
  var name = v2Str_(c['コンテスト名']);
  if (!date || !name) return removed;
  var titles = {};
  titles[name] = true;
  ['【決勝進出】', '【決勝・進出未定】', '【決勝予定】'].forEach(function(p) { titles[p + name] = true; });
  var dayStart = combineCalendarDateTime_(date, '00:00');
  var dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
  cal.getEvents(dayStart, dayEnd).forEach(function(ev) {
    if (!titles[ev.getTitle()]) return;
    try { ev.deleteEvent(); removed++; } catch (e) { Logger.log('delete failed: ' + e); }
  });
  return removed;
}

// 大会v2 に無いのにカレンダーだけ残っている大会イベントを探す。
// 旧「コンテスト管理」に同じ名前・同じ日があるものだけを対象にするので、他の予定は巻き込まない。
function v2FindOrphanContestEvents_() {
  var cal = CalendarApp.getDefaultCalendar();
  var live = {};
  v2ReadSheet_(V2_SHEETS.CONTESTS).forEach(function(c) {
    live[v2Str_(c['コンテスト名']) + '|' + v2DateStr_(c['開催日'])] = true;
  });
  var out = [];
  getContests().forEach(function(oldRow) {
    var name = v2Str_(oldRow['コンテスト名']);
    var date = v2DateStr_(oldRow['開催日']);
    if (!name || !date) return;
    if (live[name + '|' + date]) return; // v2 に生きている
    var titles = {};
    titles[name] = true;
    ['【決勝進出】', '【決勝・進出未定】', '【決勝予定】'].forEach(function(p) { titles[p + name] = true; });
    var dayStart = combineCalendarDateTime_(date, '00:00');
    var dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
    cal.getEvents(dayStart, dayEnd).forEach(function(ev) {
      if (titles[ev.getTitle()]) out.push({ date: date, title: ev.getTitle(), event: ev });
    });
  });
  return out;
}

/** アプリから消したのにカレンダーに残っている大会の予定を一覧する（消さない） */
function listOrphanContestEvents() {
  var found = v2FindOrphanContestEvents_().map(function(o) { return o.date + ' ' + o.title; });
  Logger.log(found.length ? JSON.stringify(found, null, 2) : 'カレンダーの取り残しはありません');
  return found;
}

/** 上で一覧したカレンダーの予定を実際に消す */
function deleteOrphanContestEvents() {
  var found = v2FindOrphanContestEvents_();
  var names = [];
  found.forEach(function(o) {
    try { o.event.deleteEvent(); names.push(o.date + ' ' + o.title); } catch (e) { Logger.log('delete failed: ' + e); }
  });
  Logger.log(names.length ? JSON.stringify({ deleted: names }, null, 2) : '消すものはありません');
  return names;
}

// ---- やること ----
function saveTasksV2(pin, tasks) {
  v2RequirePin_(pin);
  if (!Array.isArray(tasks)) tasks = [tasks];
  return tasks.map(function(t) {
    t['ID'] = t['ID'] || v2Uid_('t');
    t['当日'] = v2Bool_(t['当日']);
    t['済'] = v2Bool_(t['済']);
    t['期限日'] = t['当日'] ? '' : v2DateStr_(t['期限日']);
    if (t['済'] && !t['済日']) t['済日'] = v2DateStr_(new Date());
    if (!t['済']) t['済日'] = '';
    return v2UpsertRow_(V2_SHEETS.TASKS, V2_HEADERS.TASKS, t);
  });
}
function deleteTaskV2(pin, id) { v2RequirePin_(pin); return v2DeleteRow_(V2_SHEETS.TASKS, id); }

// ---- 台帳 ----
function saveLedgerV2(pin, l) {
  v2RequirePin_(pin);
  var fams = getFamilyNames();
  l['ID'] = l['ID'] || v2Uid_('l');
  l['日付'] = v2DateStr_(l['日付']) || v2DateStr_(new Date());
  var items = typeof l['明細JSON'] === 'string' ? JSON.parse(l['明細JSON'] || '[]') : (l['明細JSON'] || []);
  items = items.filter(function(it) { return v2Num_(it.amount) > 0 && Array.isArray(it.targets) && it.targets.length; });
  if (!items.length) throw new Error('明細がありません');
  if (fams.indexOf(l['支払者']) < 0) throw new Error('支払者が不正です');
  l['明細JSON'] = items;
  l['合計'] = v2SumItems_(items);
  l['負担JSON'] = v2Share_(items, fams, l['支払者']); // サーバー側で再計算（ゼロサム保証）
  if (!l['作成日時']) l['作成日時'] = new Date().toISOString();
  return v2UpsertRow_(V2_SHEETS.LEDGER, V2_HEADERS.LEDGER, l);
}
function deleteLedgerV2(pin, id) { v2RequirePin_(pin); return v2DeleteRow_(V2_SHEETS.LEDGER, id); }

// ---- マスタ ----
function saveDestinationV2(pin, d) {
  v2RequirePin_(pin);
  if (!v2Str_(d['名前'])) throw new Error('行き先の名前がありません');
  d['ID'] = d['ID'] || v2Uid_('d');
  return v2UpsertRow_(V2_SHEETS.DEST, V2_HEADERS.DEST, d);
}
function deleteDestinationV2(pin, id) { v2RequirePin_(pin); return v2DeleteRow_(V2_SHEETS.DEST, id); }
function saveCarsV2(pin, cars) {
  v2RequirePin_(pin);
  var ss = getSpreadsheet();
  v2WriteSheet_(ss, V2_SHEETS.CARS, V2_HEADERS.CARS, cars, '#30B0C7');
  return cars;
}
function saveSettingV2(pin, key, value) {
  v2RequirePin_(pin);
  var s = v2Sheet_(V2_SHEETS.SETTINGS, V2_HEADERS.SETTINGS);
  var sh = s.sh;
  var last = sh.getLastRow();
  var keys = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function(r) { return String(r[0]); }) : [];
  var idx = keys.indexOf(key);
  var r = idx >= 0 ? idx + 2 : last + 1;
  sh.getRange(r, 1, 1, 2).setNumberFormat('@').setValues([[key, String(value)]]);
  return { key: key, value: String(value) };
}

// ---- ディスパッチ ----
function serveV2Rpc(e) {
  var method = String(e.parameter.method || '');
  var pin = String(e.parameter.pin || '');
  var args = [];
  try {
    var argsJson = '[]';
    if (e.parameter.args64) argsJson = Utilities.newBlob(Utilities.base64DecodeWebSafe(e.parameter.args64)).getDataAsString('UTF-8');
    else if (e.parameter.args) argsJson = e.parameter.args;
    args = JSON.parse(argsJson);
    if (!Array.isArray(args)) throw new Error('Invalid arguments');
  } catch (err) {
    return { ok: false, error: 'Invalid arguments: ' + err.message };
  }
  var methods = {
    saveContestV2: saveContestV2, deleteContestV2: deleteContestV2,
    saveTasksV2: saveTasksV2, deleteTaskV2: deleteTaskV2,
    saveLedgerV2: saveLedgerV2, deleteLedgerV2: deleteLedgerV2,
    saveDestinationV2: saveDestinationV2, deleteDestinationV2: deleteDestinationV2,
    saveCarsV2: saveCarsV2, saveSettingV2: saveSettingV2,
    checkPinV2: function(p) { return v2CheckPin_(p); }
  };
  if (!methods[method]) return { ok: false, error: 'Unknown method: ' + method };
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { return { ok: true, value: methods[method].apply(null, [pin].concat(args)) }; }
    finally { lock.releaseLock(); }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

/** 旧シートにあって 大会v2 に無い大会を一覧する（書き込まない）。意図的に消した大会もここに出る */
function restoreMissingContestsFromLegacy() {
  var existing = {};
  v2ReadSheet_(V2_SHEETS.CONTESTS).forEach(function(c) {
    existing[v2Str_(c['コンテスト名']) + '|' + v2DateStr_(c['開催日'])] = true;
  });
  var missing = getContests().filter(function(c) {
    return v2Str_(c['コンテスト名']) && !existing[v2Str_(c['コンテスト名']) + '|' + v2DateStr_(c['開催日'])];
  }).map(function(c) { return v2DateStr_(c['開催日']) + ' ' + v2Str_(c['コンテスト名']); });
  Logger.log(missing.length
    ? '旧シートにだけある大会（戻すなら restoreMissingContestsApply を実行）:\n' + JSON.stringify(missing, null, 2)
    : '差はありません');
  return missing;
}

/** 上で一覧した大会を実際に 大会v2 へ戻す。意図的に消した大会も戻るので注意 */
function restoreMissingContestsApply() {
  var fams = getFamilyNames();
  var today = v2DateStr_(new Date());
  var existing = {};
  v2ReadSheet_(V2_SHEETS.CONTESTS).forEach(function(c) {
    existing[v2Str_(c['コンテスト名']) + '|' + v2DateStr_(c['開催日'])] = true;
  });
  var missing = getContests().filter(function(c) {
    var key = v2Str_(c['コンテスト名']) + '|' + v2DateStr_(c['開催日']);
    return v2Str_(c['コンテスト名']) && !existing[key];
  });
  if (!missing.length) {
    Logger.log('復元するものはありません');
    return { restored: [] };
  }
  var res = v2Transform_({
    contests: missing, projects: [], recordsByProject: {}, carSettings: [], savedRoutes: [],
    families: fams, today: today
  });
  // 大会とやることだけ戻す（台帳は履歴なので触らない）
  res.data.contests.forEach(function(c) {
    try { c['カレンダーID'] = v2SyncCalendar_(c, null); } catch (e) { Logger.log('calendar: ' + e); }
    v2UpsertRow_(V2_SHEETS.CONTESTS, V2_CONTEST_HEADERS_W, c);
  });
  res.data.tasks.forEach(function(t) { v2UpsertRow_(V2_SHEETS.TASKS, V2_HEADERS.TASKS, t); });
  var names = res.data.contests.map(function(c) { return c['開催日'] + ' ' + c['コンテスト名']; });
  Logger.log(JSON.stringify({ restored: names, tasks: res.data.tasks.length }, null, 2));
  return { restored: names, tasks: res.data.tasks.length };
}

// ============================================================
// 移行で落ちた Instagram_URL を旧シートから戻す（2026-09-13）
//   新シート 大会v2 に Instagram 列が無かったため、移行時に落ちていた。
//   大会名（＋開催日）で突き合わせ、v2側が空のときだけ埋める。何度実行しても安全。
// ============================================================
function restoreInstagramUrlsDry() { return v2RestoreInstagram_(false); }
function restoreInstagramUrlsApply() { return v2RestoreInstagram_(true); }

function v2RestoreInstagram_(apply) {
  // 列が無ければ作る
  var s = v2Sheet_(V2_SHEETS.CONTESTS, V2_CONTEST_HEADERS_W);
  var sh = s.sh, headers = s.headers;
  var iIg = headers.indexOf('Instagram');
  var iName = headers.indexOf('コンテスト名');
  var iDate = headers.indexOf('開催日');
  if (iIg < 0 || iName < 0) throw new Error('大会v2 の列が見つかりません');

  // 旧シートの Instagram_URL を 大会名 → URL で引けるようにする
  var legacy = {};
  getContests().forEach(function(c) {
    var url = String(c['Instagram_URL'] || '').trim();
    if (!url) return;
    var nm = String(c['コンテスト名'] || '').trim();
    if (nm && !legacy[nm]) legacy[nm] = url;
  });

  var last = sh.getLastRow();
  if (last < 2) return { filled: 0, rows: [] };
  var rows = sh.getRange(2, 1, last - 1, headers.length).getValues();
  var out = [], filled = 0;
  rows.forEach(function(row, i) {
    var nm = String(row[iName] || '').trim();
    if (!nm) return;
    var cur = String(row[iIg] || '').trim();
    if (cur) return;                       // すでに入っているものは触らない
    var url = legacy[nm];
    if (!url) { out.push({ 大会名: nm, 結果: '旧シートに無し' }); return; }
    if (apply) sh.getRange(i + 2, iIg + 1).setValue(url);
    filled++;
    out.push({ 大会名: nm, 開催日: iDate >= 0 ? String(row[iDate] || '') : '', url: url, 結果: apply ? '書き込んだ' : '書き込む予定' });
  });
  Logger.log(JSON.stringify(out, null, 1));
  Logger.log((apply ? '書き込んだ件数=' : '書き込める件数=') + filled);
  return { filled: filled, rows: out };
}
