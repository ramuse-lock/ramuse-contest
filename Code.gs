// ============================================================
// RAMUSE コンテスト管理アプリ - サーバー側
// ============================================================

var FAMILY_NAMES = ['Airi', 'Miha', 'Rinka'];
var SPREADSHEET_ID = '1QUMqYlSwjaWJgN1q37NiFIIbr9J1MyFYDQSHQ8mT0T4';

var _ssCache = null;
function getSpreadsheet() {
  if (!_ssCache) {
    _ssCache = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return _ssCache;
}

function doGet(e) {
  // JSON API モード（GitHub Pages の子供用アプリから fetch で呼ばれる）
  if (e && e.parameter && e.parameter.action) {
    return serveApi(e);
  }
  return HtmlService.createHtmlOutputFromFile('gas-app')
    .setTitle('RAMUSE')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function serveApi(e) {
  var action = e.parameter.action;
  var cb = e.parameter.callback || '';
  var result;
  try {
    if (action === 'init') {
      result = { families: getFamilyNames(), contests: getContests() };
    } else if (action === 'calendar') {
      result = getCalendarEvents(parseInt(e.parameter.year), parseInt(e.parameter.month));
    } else if (action === 'week') {
      result = getThisWeekEvents();
    } else {
      result = { error: 'Unknown action: ' + action };
    }
  } catch(err) {
    result = { error: err.toString() };
  }
  var json = JSON.stringify(result);
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function getFamilyNames() {
  return FAMILY_NAMES;
}

// ============================================================
// シート自動作成
// ============================================================

function ensureSheets() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('コンテスト管理');
  if (!sheet) {
    sheet = ss.insertSheet('コンテスト管理');
    var headers = getContestHeaders();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#5C4FB0').setFontColor('#fff').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 200);
    return;
  }
  var current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h).trim(); });
  var expected = getContestHeaders();
  var added = false;
  expected.forEach(function(col) {
    if (current.indexOf(col) === -1) {
      current.push(col);
      added = true;
    }
  });
  if (added) {
    sheet.getRange(1, 1, 1, current.length).setValues([current]);
    sheet.getRange(1, 1, 1, current.length)
      .setBackground('#5C4FB0').setFontColor('#fff').setFontWeight('bold');
  }
}

function getContestHeaders() {
  var h = [
    'コンテスト名', '開催日', '会場', '部門', '開催形式', 'ステータス',
    '集合時間', '開始時間', '終了時間', '出演順番', '総組数', 'URL',
    '資料1_ラベル', '資料1_URL', '資料2_ラベル', '資料2_URL', '資料3_ラベル', '資料3_URL',
    '資料4_ラベル', '資料4_URL', '資料5_ラベル', '資料5_URL',
    'エントリー_状況', 'エントリー_期限', 'エントリー_開始日', 'エントリー_開始時間',
    'エントリー費_金額', 'エントリー費_支払方法', 'エントリー費_期限', 'エントリー費_振込済',
    '音源_要否', '音源_期限', '音源_備考', '音源_状況', '音源_当日CD', '音源_予備データ',
    'Airi_音源_持参', 'Miha_音源_持参', 'Rinka_音源_持参',
    '動画_要否', '動画_期限', '動画_URL', '動画_状況',
    '写真_要否', '写真_期限', '写真_URL', '写真_状況',
    '衣装_メモ',
    '観覧費_大人_単価', '観覧費_子供_単価', '観覧費_付き添い無料',
    '観覧費_支払方法', '観覧費_期限', '観覧費_振込済'
  ];
  FAMILY_NAMES.forEach(function(f) {
    h.push(f + '_エントリー費_支払済');
  });
  FAMILY_NAMES.forEach(function(f) {
    h.push(f + '_観覧費_大人', f + '_観覧費_子供', f + '_観覧費_支払済');
  });
  h.push('交通費_ガソリン代', '交通費_ETC');
  FAMILY_NAMES.forEach(function(f) {
    h.push(f + '_交通費_対象', f + '_交通費_支払済');
  });
  h.push('その他_用途', 'その他_金額');
  FAMILY_NAMES.forEach(function(f) {
    h.push(f + '_その他_対象', f + '_その他_集金済');
  });
  h.push('問い合わせメモ', '備考', '結果', '結果_詳細', 'カレンダーID');
  h.push('ラウンド', '決勝_開催日', '決勝_場所', '決勝_会場', 'Instagram_URL');
  return h;
}

// ============================================================
// コンテスト取得
// ============================================================

function getContests() {
  ensureSheets();
  var sheet = getSheet('コンテスト管理');
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var headers = data[0].map(function(h) { return String(h).trim(); });
  return data.slice(1)
    .map(function(row, i) { return toObj(headers, row, i + 2); })
    .filter(function(r) { return r['コンテスト名']; });
}

// ============================================================
// コンテスト保存
// ============================================================

function saveContest(formData) {
  ensureSheets();
  var sheet = getSheet('コンテスト管理');
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h).trim(); });

  var expected = getContestHeaders();
  var added = false;
  expected.forEach(function(col) {
    if (headers.indexOf(col) === -1) {
      headers.push(col);
      added = true;
    }
  });
  if (added) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#5C4FB0').setFontColor('#fff').setFontWeight('bold');
  }

  var rowData = headers.map(function(h) {
    return normalizeContestValue(h, formData[h]);
  });
  var rowIndex = parseInt(formData['_rowIndex']) || 0;

  if (rowIndex >= 2) {
    var calIdCol = headers.indexOf('カレンダーID');
    if (calIdCol >= 0 && !formData['カレンダーID']) {
      var existingCalId = sheet.getRange(rowIndex, calIdCol + 1).getValue();
      if (existingCalId) {
        formData['カレンダーID'] = existingCalId;
        rowData[calIdCol] = existingCalId;
      }
    }
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
    rowIndex = sheet.getLastRow();
  }

  try { syncCalendar(formData, rowIndex, sheet, headers); } catch(e) { Logger.log('Calendar: ' + e); }
  return { success: true, rowIndex: rowIndex };
}

// ============================================================
// コンテスト削除
// ============================================================

function deleteContest(rowIndex) {
  var sheet = getSheet('コンテスト管理');
  if (!sheet) return { success: false };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h).trim(); });
  var calIdCol = headers.indexOf('カレンダーID');
  if (calIdCol >= 0) {
    var calId = sheet.getRange(rowIndex, calIdCol + 1).getValue();
    if (calId) { try { CalendarApp.getEventById(calId).deleteEvent(); } catch(e) {} }
  }
  sheet.deleteRow(rowIndex);
  return { success: true };
}

// ============================================================
// カレンダー同期
// ============================================================

function syncCalendar(data, rowIndex, sheet, headers) {
  var dateVal = data['開催日'];
  var name = data['コンテスト名'];
  if (!name) return;

  var cal = CalendarApp.getDefaultCalendar();
  var calIdCol = headers.indexOf('カレンダーID') + 1;

  var existingId = '';
  if (calIdCol > 0 && rowIndex >= 2) {
    try { existingId = String(sheet.getRange(rowIndex, calIdCol).getValue() || '').trim(); } catch(e) {}
  }
  if (!existingId) {
    existingId = String(data['カレンダーID'] || '').trim();
  }

  // 開催日が空の場合：孤立したカレンダーイベントを削除してリターン
  if (!dateVal) {
    if (existingId) {
      try { var orphan = cal.getEventById(existingId); if (orphan) orphan.deleteEvent(); } catch(e) {}
      if (calIdCol > 0 && rowIndex >= 2) sheet.getRange(rowIndex, calIdCol).setValue('');
    }
    return;
  }

  var date = new Date(dateVal);
  if (isNaN(date.getTime())) return;

  var lines = [];
  if (data['部門'])     lines.push('部門: ' + data['部門']);
  if (data['開催形式']) lines.push('形式: ' + data['開催形式']);
  if (data['集合時間']) lines.push('集合時間: ' + data['集合時間']);
  if (data['開始時間']) {
    var tLine = '開始時間: ' + data['開始時間'];
    if (data['終了時間']) tLine += '〜' + data['終了時間'];
    lines.push(tLine);
  }
  if (data['出演順番']) {
    var ord = data['出演順番'] + '番目';
    if (data['総組数']) ord += ' / ' + data['総組数'] + '組';
    lines.push('出演順: ' + ord);
  }
  if (data['URL']) lines.push('詳細URL: ' + data['URL']);
  var desc = lines.join('\n');
  var loc = data['会場'] || '';

  if (existingId) {
    try {
      var ev = cal.getEventById(existingId);
      if (ev) {
        ev.setTitle(name);
        ev.setLocation(loc);
        ev.setDescription(desc);
        try { ev.setColor('5'); } catch(ce) { Logger.log('setColor(update): ' + ce); }
        return;
      }
      // ev === null: イベントが削除済み → 下で再作成
    } catch(e) {
      Logger.log('getEventById failed: ' + e);
      return;
    }
  }

  // 既存IDなし or イベント削除済みの場合のみ新規作成
  var newEvent = cal.createAllDayEvent(name, date, { location: loc, description: desc });
  var newId = newEvent.getId();
  if (calIdCol > 0) sheet.getRange(rowIndex, calIdCol).setValue(newId);
  try { newEvent.setColor('5'); } catch(ce) { Logger.log('setColor(new): ' + ce); }
}

// ============================================================
// カレンダー重複クリーンアップ（GASエディタから手動で一度だけ実行）
// 重複しているイベントを削除し、1件だけ残してIDをシートに再登録する
// ============================================================

function cleanupDuplicateCalendarEvents() {
  var sheet = getSheet('コンテスト管理');
  if (!sheet || sheet.getLastRow() < 2) { Logger.log('データなし'); return; }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h).trim(); });
  var calIdCol = headers.indexOf('カレンダーID') + 1;
  var nameCol  = headers.indexOf('コンテスト名') + 1;
  var dateCol  = headers.indexOf('開催日') + 1;
  if (calIdCol === 0) { Logger.log('カレンダーID列が見つかりません'); return; }

  var cal = CalendarApp.getDefaultCalendar();
  var rows = sheet.getLastRow() - 1;
  var data = sheet.getRange(2, 1, rows, sheet.getLastColumn()).getValues();

  data.forEach(function(row, i) {
    var rowIndex = i + 2;
    var name = row[nameCol - 1];
    var dateVal = row[dateCol - 1];
    if (!name || !dateVal) return;

    var date = new Date(dateVal);
    if (isNaN(date.getTime())) return;

    var start = new Date(date); start.setHours(0,0,0,0);
    var end   = new Date(date); end.setHours(23,59,59,999);
    var events = cal.getEvents(start, end).filter(function(e) { return e.getTitle() === name; });

    if (events.length === 0) {
      sheet.getRange(rowIndex, calIdCol).setValue('');
      Logger.log('IDクリア: ' + name);
    } else {
      var keep = events[0];
      for (var j = 1; j < events.length; j++) {
        try { events[j].deleteEvent(); } catch(e) {}
      }
      try { keep.setColor('5'); } catch(ce) {}
      sheet.getRange(rowIndex, calIdCol).setValue(keep.getId());
      Logger.log('クリーンアップ完了: ' + name + ' (' + events.length + '件 → 1件)');
    }
  });
  Logger.log('cleanupDuplicateCalendarEvents 完了');
}

// ============================================================
// カレンダーイベント取得（クライアント向け）
// ============================================================

function getCalendarEvents(year, month) {
  try {
    var cal = CalendarApp.getDefaultCalendar();
    var tz  = Session.getScriptTimeZone();
    var start = new Date(year, month - 1, 1);
    var end   = new Date(year, month, 1);

    var contestIds = {};
    var sheet = getSheet('コンテスト管理');
    if (sheet && sheet.getLastRow() > 1) {
      var hdrs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
        .map(function(h){ return String(h).trim(); });
      var cCol = hdrs.indexOf('カレンダーID');
      if (cCol >= 0) {
        var rows = sheet.getLastRow() - 1;
        var vals = sheet.getRange(2, cCol + 1, rows, 1).getValues();
        vals.forEach(function(r, i){
          var cid = String(r[0] || '').trim();
          if (cid) contestIds[cid] = i + 2;
        });
      }
    }

    return cal.getEvents(start, end).map(function(e) {
      var st  = e.getStartTime();
      var et  = e.getEndTime();
      var all = e.isAllDayEvent();
      var endDisp = all ? new Date(et.getTime() - 1) : et;
      var id = e.getId();
      return {
        id:              id,
        title:           e.getTitle(),
        start:           Utilities.formatDate(st, tz, 'yyyy-MM-dd'),
        end:             Utilities.formatDate(endDisp, tz, 'yyyy-MM-dd'),
        isAllDay:        all,
        startTime:       all ? '' : Utilities.formatDate(st, tz, 'HH:mm'),
        location:        e.getLocation() || '',
        color:           e.getColor() || '',
        isContest:       !!contestIds[id],
        contestRowIndex: contestIds[id] || 0
      };
    });
  } catch(e) {
    return { error: e.toString() };
  }
}

function getThisWeekEvents() {
  try {
    var tz  = Session.getScriptTimeZone();
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var end = new Date(now.getTime() + 7 * 86400000);
    return CalendarApp.getDefaultCalendar().getEvents(now, end).map(function(e) {
      var st  = e.getStartTime();
      var all = e.isAllDayEvent();
      return {
        id:        e.getId(),
        title:     e.getTitle(),
        start:     Utilities.formatDate(st, tz, 'yyyy-MM-dd'),
        isAllDay:  all,
        startTime: all ? '' : Utilities.formatDate(st, tz, 'HH:mm'),
        location:  e.getLocation() || '',
        color:     e.getColor() || ''
      };
    });
  } catch(e) {
    return { error: e.toString() };
  }
}

// ============================================================
// ユーティリティ
// ============================================================

function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

function isBooleanHeader(header) {
  if (header === '観覧費_付き添い無料' || header === '観覧費_振込済') return true;
  if (header === '音源_当日CD' || header === '音源_予備データ') return true;
  if (header === 'エントリー費_振込済') return true;
  return /_(エントリー費_支払済|観覧費_支払済|交通費_対象|交通費_支払済|音源_持参|その他_対象|その他_集金済)$/.test(header);
}

function isNumberHeader(header) {
  if (/_(観覧費_大人|観覧費_子供)$/.test(header)) return true;
  return [
    'エントリー費_金額',
    '観覧費_大人_単価',
    '観覧費_子供_単価',
    '交通費_ガソリン代',
    '交通費_ETC',
    'その他_金額',
    '出演順番',
    '総組数'
  ].indexOf(header) >= 0;
}

function isDateHeader(header) {
  return header === '開催日' || header === 'エントリー_開始日' || header === '決勝_開催日' || /_期限$/.test(header);
}

function isTimeHeader(header) {
  return header === '集合時間' || header === '開始時間' || header === '終了時間' || header === 'エントリー_開始時間';
}

function parseBoolValue(value) {
  if (value === true || value === false) return value;
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'number') return value === 1;
  var s = String(value).replace(/^\s+|\s+$/g, '').toUpperCase();
  if (!s) return false;
  return s === 'TRUE' || s === '1';
}

function formatDateString(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatTimeString(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'HH:mm');
}

function normalizeDateValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return formatDateString(value);
  var s = String(value).replace(/^\s+|\s+$/g, '');
  if (!s) return '';
  var m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (m) {
    return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? s : formatDateString(d);
}

function normalizeTimeValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return formatTimeString(value);
  var s = String(value).replace(/^\s+|\s+$/g, '');
  if (!s) return '';
  var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) {
    return ('0' + m[1]).slice(-2) + ':' + m[2];
  }
  var d = new Date('1970-01-01T' + s);
  return isNaN(d.getTime()) ? s : formatTimeString(d);
}

function normalizeContestValue(header, value) {
  if (isBooleanHeader(header)) return parseBoolValue(value);
  if (isNumberHeader(header)) {
    if (value === null || value === undefined || value === '') return '';
    var num = Number(value);
    return isNaN(num) ? '' : num;
  }
  if (isDateHeader(header)) return normalizeDateValue(value);
  if (isTimeHeader(header)) return normalizeTimeValue(value);
  return value !== undefined ? value : '';
}

function toObj(headers, row, rowIndex) {
  var obj = { _rowIndex: rowIndex };
  headers.forEach(function(h, i) {
    var v = row[i];
    obj[h] = normalizeContestValue(h, v);
  });
  return obj;
}

// ============================================================
// おでかけプロジェクト
// ============================================================

var TRIP_PROJ_SHEET  = 'おでかけプロジェクト';
var TRIP_REC_SHEET   = 'おでかけ記録';
var CAR_SHEET        = '車設定';
var ROUTE_SHEET      = '高速ルート';

function generateUid() {
  return Utilities.getUuid().replace(/-/g,'').substring(0,12);
}

function sheetToRawObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  var h = data[0].map(function(v){ return String(v).trim(); });
  return data.slice(1).map(function(row, i) {
    var o = { _rowIndex: i + 2 };
    h.forEach(function(k, j) {
      var v = row[j];
      if (v instanceof Date) {
        o[k] = v.getTime() ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
      } else {
        o[k] = v;
      }
    });
    return o;
  });
}

function ensureTripSheets() {
  var ss = getSpreadsheet();
  function makeSheet(name, headers, color) {
    var sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, headers.length).setValues([headers])
        .setBackground(color).setFontColor('#fff').setFontWeight('bold');
      sh.setFrozenRows(1);
    } else {
      // 既存シートのヘッダーが正しいか確認し、異なれば上書き修正する
      var existingHeaders = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
                             .map(function(v){ return String(v).trim(); });
      var needsUpdate = headers.some(function(h, i){ return existingHeaders[i] !== h; })
                        || existingHeaders.length !== headers.length;
      if (needsUpdate) {
        // ヘッダー行だけ正しい列数で上書き
        if (headers.length > existingHeaders.length) {
          sh.getRange(1, 1, 1, headers.length).setValues([headers])
            .setBackground(color).setFontColor('#fff').setFontWeight('bold');
        } else {
          sh.getRange(1, 1, 1, headers.length).setValues([headers])
            .setBackground(color).setFontColor('#fff').setFontWeight('bold');
        }
      }
    }
    return sh;
  }
  makeSheet(TRIP_PROJ_SHEET,
    ['ID','プロジェクト名','ステータス','作成日','完了日','メモ'],
    '#4A7CB0');
  makeSheet(TRIP_REC_SHEET,
    ['ID','プロジェクトID','日付','目的','目的地','支払者','運転者',
     '乗車メンバー','高速区間','高速料金','ETC割引','往復','ガソリン単価','走行距離','燃費',
     '駐車場有無','駐車場料金','その他費用JSON'],
    '#4A7CB0');
  var carSh = makeSheet(CAR_SHEET, ['名前','燃費'], '#4A7CB0');
  if (carSh.getLastRow() <= 1) {
    FAMILY_NAMES.forEach(function(n) { carSh.appendRow([n + 'の車', 15]); });
  }
  makeSheet(ROUTE_SHEET, ['出発IC','到着IC','片道料金'], '#4A7CB0');
}

/**
 * 【一回限り実行】おでかけ記録シートの既存データを全削除し、
 * 正しい18列ヘッダー（往復列を含む）に修正する。
 * GASエディタから手動で実行してください。
 */
function resetTripRecordSheet() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(TRIP_REC_SHEET);
  if (!sh) {
    Logger.log('おでかけ記録シートが見つかりません');
    return;
  }
  // データ行を全削除（ヘッダーは残す）
  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    sh.deleteRows(2, lastRow - 1);
  }
  // 正しい18列ヘッダーで上書き
  var headers = ['ID','プロジェクトID','日付','目的','目的地','支払者','運転者',
                 '乗車メンバー','高速区間','高速料金','ETC割引','往復','ガソリン単価','走行距離','燃費',
                 '駐車場有無','駐車場料金','その他費用JSON'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground('#4A7CB0').setFontColor('#fff').setFontWeight('bold');
  sh.setFrozenRows(1);
  Logger.log('完了: おでかけ記録をリセットし、正しいヘッダー（往復列追加）に修正しました。');
}

function getProjects() {
  ensureTripSheets();
  return sheetToRawObjects(getSheet(TRIP_PROJ_SHEET))
    .filter(function(r) { return r['プロジェクト名']; });
}

function saveProject(d) {
  ensureTripSheets();
  var sh = getSheet(TRIP_PROJ_SHEET);
  var h  = ['ID','プロジェクト名','ステータス','作成日','完了日','メモ'];
  if (!d['ID']) d['ID'] = generateUid();
  if (!d['作成日']) d['作成日'] = formatDateString(new Date());
  if (!d['ステータス']) d['ステータス'] = '進行中';
  var row = h.map(function(k) { return d[k] !== undefined ? d[k] : ''; });
  var ri = parseInt(d['_rowIndex']) || 0;
  if (ri >= 2) sh.getRange(ri, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); ri = sh.getLastRow(); }
  return { success: true, rowIndex: ri, id: d['ID'] };
}

function deleteProject(rowIndex, projectId) {
  var rSh = getSheet(TRIP_REC_SHEET);
  if (rSh) {
    var data = rSh.getDataRange().getValues();
    if (data.length > 1) {
      var h = data[0].map(function(v) { return String(v).trim(); });
      var pidCol = h.indexOf('プロジェクトID');
      for (var i = data.length - 1; i >= 1; i--) {
        if (String(data[i][pidCol]) === String(projectId)) rSh.deleteRow(i + 1);
      }
    }
  }
  var pSh = getSheet(TRIP_PROJ_SHEET);
  if (pSh && rowIndex >= 2) pSh.deleteRow(rowIndex);
  return { success: true };
}

function getTripRecords(projectId) {
  ensureTripSheets();
  return sheetToRawObjects(getSheet(TRIP_REC_SHEET))
    .filter(function(r) { return r['ID'] && String(r['プロジェクトID']) === String(projectId); });
}

function saveTripRecord(d) {
  ensureTripSheets();
  var sh = getSheet(TRIP_REC_SHEET);
  var h  = ['ID','プロジェクトID','日付','目的','目的地','支払者','運転者',
            '乗車メンバー','高速区間','高速料金','ETC割引','往復','ガソリン単価','走行距離','燃費',
            '駐車場有無','駐車場料金','その他費用JSON'];
  if (!d['ID']) d['ID'] = generateUid();
  var row = h.map(function(k) { return d[k] !== undefined ? d[k] : ''; });
  var ri = parseInt(d['_rowIndex']) || 0;
  if (ri >= 2) sh.getRange(ri, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); ri = sh.getLastRow(); }
  return { success: true, rowIndex: ri, id: d['ID'] };
}

function deleteTripRecord(rowIndex) {
  var sh = getSheet(TRIP_REC_SHEET);
  if (sh && rowIndex >= 2) sh.deleteRow(rowIndex);
  return { success: true };
}

function getCarSettings() {
  ensureTripSheets();
  return sheetToRawObjects(getSheet(CAR_SHEET))
    .filter(function(r) { return r['名前']; });
}

function saveCarSettings(cars) {
  ensureTripSheets();
  var sh = getSheet(CAR_SHEET);
  var lr = sh.getLastRow();
  if (lr > 1) sh.deleteRows(2, lr - 1);
  cars.forEach(function(c) {
    sh.appendRow([c['名前'] || '', parseFloat(c['燃費']) || 15]);
  });
  return { success: true };
}

function getAllTripData() {
  try {
    ensureTripSheets();
    var projects = sheetToRawObjects(getSheet(TRIP_PROJ_SHEET))
      .filter(function(r) { return r['プロジェクト名']; });
    var allRecords = sheetToRawObjects(getSheet(TRIP_REC_SHEET))
      .filter(function(r) { return r['ID']; });
    var recordsByProject = {};
    allRecords.forEach(function(r) {
      var pid = String(r['プロジェクトID']);
      if (!recordsByProject[pid]) recordsByProject[pid] = [];
      recordsByProject[pid].push(r);
    });
    var carSettings = sheetToRawObjects(getSheet(CAR_SHEET))
      .filter(function(r) { return r['名前']; });
    var savedRoutes = sheetToRawObjects(getSheet(ROUTE_SHEET))
      .filter(function(r) { return r['出発IC'] || r['到着IC']; });
    return { projects: projects, recordsByProject: recordsByProject, carSettings: carSettings, savedRoutes: savedRoutes };
  } catch(e) {
    return { debugError: e.toString(), projects: [], recordsByProject: {}, carSettings: [], savedRoutes: [] };
  }
}

function saveRoute(from, to, amount) {
  ensureTripSheets();
  var sh = getSheet(ROUTE_SHEET);
  var data = sh.getDataRange().getValues();
  var fromN = String(from||'').trim();
  var toN   = String(to||'').trim();
  var amt   = parseFloat(amount) || 0;
  // 既存の同ルートを上書き
  if (data.length > 1) {
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === fromN && String(data[i][1]).trim() === toN) {
        sh.getRange(i + 1, 3).setValue(amt);
        return { success: true, rowIndex: i + 1, updated: true };
      }
    }
  }
  sh.appendRow([fromN, toN, amt]);
  return { success: true, rowIndex: sh.getLastRow(), updated: false };
}

function deleteRoute(rowIndex) {
  var sh = getSheet(ROUTE_SHEET);
  if (sh && rowIndex >= 2) sh.deleteRow(rowIndex);
  return { success: true };
}
