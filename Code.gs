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
  // GAS の HtmlService 自体がサンドボックス iframe 内で実行されるため、
  // shell からさらに相対 URL の iframe を作ると doGet に戻らず空画面になる。
  // 通常アクセス・ホーム画面起動とも、実アプリ本体を直接返す。
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
    if (action === 'rpc') {
      result = serveRpc(e);
    } else if (action === 'v2rpc') {
      // UI刷新版の書き込みAPI（V2.gs）。PIN必須
      result = serveV2Rpc(e);
    } else if (action === 'v2') {
      // UI刷新版の読み取りAPI（V2.gs）。mode=kid は台帳・金額を返さない
      result = getV2Bundle(e.parameter.mode === 'kid' ? 'kid' : 'adult');
    } else if (action === 'init') {
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
  if (cb && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// GitHub Pages 版の大人用画面から既存の google.script.run と同じ操作を行う。
// 呼び出せる関数は明示したものだけに限定する。
function serveRpc(e) {
  var method = String(e.parameter.method || '');
  var args = [];
  try {
    var argsJson = '[]';
    if (e.parameter.args64) {
      argsJson = Utilities.newBlob(Utilities.base64DecodeWebSafe(e.parameter.args64)).getDataAsString('UTF-8');
    } else if (e.parameter.args) {
      argsJson = e.parameter.args;
    }
    args = JSON.parse(argsJson);
    if (!Array.isArray(args)) throw new Error('Invalid arguments');
  } catch (err) {
    return { ok: false, error: 'Invalid arguments: ' + err.message };
  }

  var methods = {
    getFamilyNames: getFamilyNames,
    getContests: getContests,
    getThisWeekEvents: getThisWeekEvents,
    getCalendarEvents: getCalendarEvents,
    saveContest: saveContest,
    deleteContest: deleteContest,
    getAllTripData: getAllTripData,
    saveProject: saveProject,
    saveCollectionStatus: saveCollectionStatus,
    deleteProject: deleteProject,
    saveRoute: saveRoute,
    saveTripRecord: saveTripRecord,
    deleteTripRecord: deleteTripRecord,
    saveCarSettings: saveCarSettings,
    syncEntryPlannedContestsToCalendar: syncEntryPlannedContestsToCalendar,
    syncAllContestsToCalendar: syncAllContestsToCalendar,
    backupContestSheet: backupContestSheet,
    migrateLegacySeriesFinals: migrateLegacySeriesFinals,
    migrateFinalStatusLabels: migrateFinalStatusLabels
  };
  if (!methods[method]) {
    return { ok: false, error: 'Unknown RPC method: ' + method };
  }
  try {
    return { ok: true, value: methods[method].apply(null, args) };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

function getFamilyNames() {
  return FAMILY_NAMES;
}

function backupContestSheet() {
  var ss = getSpreadsheet();
  var source = ss.getSheetByName('コンテスト管理');
  if (!source) return { success: false, error: 'コンテスト管理シートがありません' };
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var name = 'バックアップ_' + stamp;
  source.copyTo(ss).setName(name);
  return { success: true, sheetName: name, rows: source.getLastRow() };
}

function migrateLegacySeriesFinals() {
  ensureSheets();
  var sheet = getSheet('コンテスト管理');
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { success: true, created: [] };
  var headers = values[0].map(function(h) { return String(h).trim(); });
  var rows = values.slice(1).map(function(row, index) { return toObj(headers, row, index + 2); });
  var existingFinals = {};
  rows.forEach(function(row) {
    var series = String(row['大会シリーズ名'] || '').trim();
    if (series && row['ラウンド'] === '決勝') existingFinals[series] = true;
  });
  var sources = {};
  rows.forEach(function(row) {
    var series = String(row['大会シリーズ名'] || '').trim();
    if (!series || existingFinals[series] || sources[series] || !row['決勝_開催日']) return;
    sources[series] = row;
  });
  var created = [];
  Object.keys(sources).forEach(function(series) {
    var source = sources[series];
    var finalData = {
      'コンテスト名': series,
      '開催日': source['決勝_開催日'],
      '開始時間': source['決勝_開始時間'],
      '終了時間': source['決勝_終了時間'],
      '会場': [source['決勝_場所'], source['決勝_会場']].filter(function(v) { return !!v; }).join(' '),
      '部門': source['部門'],
      '開催形式': source['開催形式'] || 'オフライン',
      'ラウンド': '決勝',
      '大会シリーズ名': series,
      '決勝_ステータス': source['決勝_ステータス'] === '決勝予定' ? '進出未定' : (source['決勝_ステータス'] || '進出未定'),
      'エントリー_状況': '提出済',
      'URL': source['URL']
    };
    var result = saveContest(finalData);
    created.push({ series: series, rowIndex: result.rowIndex, status: finalData['決勝_ステータス'] });
  });
  return { success: true, created: created };
}

function migrateFinalStatusLabels() {
  ensureSheets();
  var sheet = getSheet('コンテスト管理');
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { success: true, updated: 0 };
  var headers = values[0].map(function(h) { return String(h).trim(); });
  var statusCol = headers.indexOf('決勝_ステータス');
  if (statusCol < 0) return { success: true, updated: 0 };
  var updated = 0;
  values.slice(1).forEach(function(row, index) {
    if (String(row[statusCol] || '') !== '決勝予定') return;
    var rowIndex = index + 2;
    sheet.getRange(rowIndex, statusCol + 1).setValue('進出未定');
    var data = toObj(headers, row, rowIndex);
    data['決勝_ステータス'] = '進出未定';
    if (data['ラウンド'] === '決勝') syncCalendar(data, rowIndex, sheet, headers);
    updated++;
  });
  return { success: true, updated: updated };
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
  h.push('ラウンド', '大会シリーズ名', '決勝_ステータス', '決勝_開催日', '決勝_開始時間', '決勝_終了時間',
    '決勝_場所', '決勝_会場', '決勝_カレンダーID', 'エントリー_カレンダーID', 'Instagram_URL');
  return h;
}

// ============================================================
// コンテスト取得
// ============================================================

function getContests() {
  var sheet = getSheet('コンテスト管理');
  if (!sheet) return [];
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
    ['カレンダーID', '決勝_カレンダーID', 'エントリー_カレンダーID'].forEach(function(idHeader) {
      var idCol = headers.indexOf(idHeader);
      if (idCol >= 0 && !formData[idHeader]) {
        var existingId = sheet.getRange(rowIndex, idCol + 1).getValue();
        if (existingId) {
          formData[idHeader] = existingId;
          rowData[idCol] = existingId;
        }
      }
    });
    // 旧方式の決勝詳細列は画面から外しても既存値を消さず、そのまま保持する。
    ['決勝_開催日', '決勝_開始時間', '決勝_終了時間', '決勝_場所', '決勝_会場'].forEach(function(field) {
      var col = headers.indexOf(field);
      if (col >= 0 && !Object.prototype.hasOwnProperty.call(formData, field)) {
        rowData[col] = sheet.getRange(rowIndex, col + 1).getValue();
      }
    });
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
  // 決勝_カレンダーID は旧方式で複数予選が共有している可能性があるため削除対象にしない。
  ['カレンダーID', 'エントリー_カレンダーID'].forEach(function(idHeader) {
    var idCol = headers.indexOf(idHeader);
    if (idCol < 0) return;
    var eventId = sheet.getRange(rowIndex, idCol + 1).getValue();
    if (eventId) {
      try { var event = CalendarApp.getEventById(eventId); if (event) event.deleteEvent(); } catch(e) {}
    }
  });
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
  var isFinalRound = data['ラウンド'] === '決勝';
  var finalStatus = data['決勝_ステータス'] || '進出未定';
  if (finalStatus === '決勝予定') finalStatus = '進出未定';
  var eventTitle = isFinalRound ?
    (finalStatus === '進出決定' ? '【決勝進出】' + name : '【決勝・進出未定】' + name) : name;
  var eventColor = isFinalRound && finalStatus !== '進出決定' ? '8' : '5';

  var cal = CalendarApp.getDefaultCalendar();
  var calIdCol = headers.indexOf('カレンダーID') + 1;

  var existingId = '';
  if (calIdCol > 0 && rowIndex >= 2) {
    try { existingId = String(sheet.getRange(rowIndex, calIdCol).getValue() || '').trim(); } catch(e) {}
  }
  if (!existingId) {
    existingId = String(data['カレンダーID'] || '').trim();
  }

  if (isFinalRound && finalStatus === '不参加') {
    if (existingId) {
      try { var cancelledFinal = cal.getEventById(existingId); if (cancelledFinal) cancelledFinal.deleteEvent(); } catch(e) {}
      if (calIdCol > 0 && rowIndex >= 2) sheet.getRange(rowIndex, calIdCol).setValue('');
    }
    if (dateVal) {
      removeCalendarEventsByTitle_(cal, '【決勝予定】' + name, dateVal, '');
      removeCalendarEventsByTitle_(cal, '【決勝・進出未定】' + name, dateVal, '');
      removeCalendarEventsByTitle_(cal, '【決勝進出】' + name, dateVal, '');
    }
    syncSupplementalCalendarEvents_(data, rowIndex, sheet, headers);
    return { action: 'removed-final' };
  }

  // 同じカレンダーIDが別の大会にも入っている場合、そのIDは信用しない。
  // 共有IDのイベントを上書きせず、後段で大会名＋開催日から個別に復旧する。
  if (existingId && calIdCol > 0 && rowIndex >= 2) {
    var idValues = sheet.getRange(2, calIdCol, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
    var duplicateId = idValues.some(function(idRow, index) {
      return index + 2 !== rowIndex && String(idRow[0] || '').trim() === existingId;
    });
    if (duplicateId) existingId = '';
  }

  // 開催日が空の場合：孤立したカレンダーイベントを削除してリターン
  if (!dateVal) {
    if (existingId) {
      try { var orphan = cal.getEventById(existingId); if (orphan) orphan.deleteEvent(); } catch(e) {}
      if (calIdCol > 0 && rowIndex >= 2) sheet.getRange(rowIndex, calIdCol).setValue('');
    }
    syncSupplementalCalendarEvents_(data, rowIndex, sheet, headers);
    return;
  }

  var date = new Date(dateVal);
  if (isNaN(date.getTime())) return;
  if (isFinalRound) {
    var obsoleteFinalTitle = finalStatus === '進出決定' ? '【決勝・進出未定】' + name : '【決勝進出】' + name;
    removeCalendarEventsByTitle_(cal, obsoleteFinalTitle, dateVal, existingId);
    removeCalendarEventsByTitle_(cal, '【決勝予定】' + name, dateVal, existingId);
  }

  var lines = [];
  if (data['大会シリーズ名']) lines.push('大会シリーズ: ' + data['大会シリーズ名']);
  if (isFinalRound) lines.push('決勝ステータス: ' + finalStatus);
  if (!data['エントリー_状況'] || data['エントリー_状況'] !== '提出済') {
    lines.push('ステータス: エントリー予定');
  }
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
        setCalendarEventSchedule_(ev, dateVal, data['開始時間'], data['終了時間'], 120);
        ev.setTitle(eventTitle);
        ev.setLocation(loc);
        ev.setDescription(desc);
        try { ev.setColor(eventColor); } catch(ce) { Logger.log('setColor(update): ' + ce); }
        removeDuplicateContestEvents_(cal, eventTitle, date, ev.getId());
        if (calIdCol > 0) sheet.getRange(rowIndex, calIdCol).setValue(ev.getId());
        syncSupplementalCalendarEvents_(data, rowIndex, sheet, headers);
        return { action: 'updated', eventId: ev.getId() };
      }
      // ev === null: イベントが削除済み → 下で再作成
    } catch(e) {
      Logger.log('getEventById failed: ' + e);
      // 古いID・削除済みIDでも終了せず、同名イベントの検索または再作成へ進む
    }
  }

  // IDが古い場合でも、同じ日付・同じタイトルのイベントがあれば再利用して重複を防ぐ
  var dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
  var dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);
  var sameEvents = cal.getEvents(dayStart, dayEnd).filter(function(event) {
    return event.getTitle() === eventTitle;
  });
  if (sameEvents.length > 0) {
    var existingEvent = sameEvents[0];
    setCalendarEventSchedule_(existingEvent, dateVal, data['開始時間'], data['終了時間'], 120);
    existingEvent.setLocation(loc);
    existingEvent.setDescription(desc);
    if (calIdCol > 0) sheet.getRange(rowIndex, calIdCol).setValue(existingEvent.getId());
    try { existingEvent.setColor(eventColor); } catch(ce) { Logger.log('setColor(reuse): ' + ce); }
    removeDuplicateContestEvents_(cal, eventTitle, date, existingEvent.getId());
    syncSupplementalCalendarEvents_(data, rowIndex, sheet, headers);
    return { action: 'reused', eventId: existingEvent.getId() };
  }

  // 既存IDなし・イベント削除済み・同名イベントなしの場合のみ新規作成
  var newEvent = createCalendarEvent_(cal, eventTitle, dateVal, data['開始時間'], data['終了時間'], 120,
    { location: loc, description: desc });
  var newId = newEvent.getId();
  if (calIdCol > 0) sheet.getRange(rowIndex, calIdCol).setValue(newId);
  try { newEvent.setColor(eventColor); } catch(ce) { Logger.log('setColor(new): ' + ce); }
  removeDuplicateContestEvents_(cal, eventTitle, date, newId);
  syncSupplementalCalendarEvents_(data, rowIndex, sheet, headers);
  return { action: 'created', eventId: newId };
}

function syncSupplementalCalendarEvents_(data, rowIndex, sheet, headers) {
  var name = data['コンテスト名'];
  if (!name) return;

  // エントリー未提出かつ開始日がある場合だけ、受付開始を淡い緑（ユーカリ系）で登録する。
  var entryActive = data['エントリー_状況'] !== '提出済' && !!data['エントリー_開始日'];
  var entryDesc = [];
  if (data['エントリー_期限']) entryDesc.push('エントリー期限: ' + data['エントリー_期限']);
  if (data['URL']) entryDesc.push('大会URL: ' + data['URL']);
  syncNamedCalendarEvent_({
    active: entryActive,
    idHeader: 'エントリー_カレンダーID',
    title: '【エントリー開始】' + name,
    date: data['エントリー_開始日'],
    startTime: data['エントリー_開始時間'],
    endTime: '',
    defaultMinutes: 30,
    location: '',
    description: entryDesc.join('\n'),
    color: '2'
  }, rowIndex, sheet, headers);

}

function syncNamedCalendarEvent_(config, rowIndex, sheet, headers) {
  var cal = CalendarApp.getDefaultCalendar();
  var idCol = headers.indexOf(config.idHeader) + 1;
  if (idCol <= 0) return;
  var eventId = String(sheet.getRange(rowIndex, idCol).getValue() || '').trim();
  var sharedId = eventId && sheet.getLastRow() > 2 &&
    sheet.getRange(2, idCol, sheet.getLastRow() - 1, 1).getValues().some(function(row, index) {
      return index + 2 !== rowIndex && String(row[0] || '').trim() === eventId;
    });

  if (!config.active) {
    if (eventId) {
      if (!sharedId) {
        try { var oldEvent = cal.getEventById(eventId); if (oldEvent) oldEvent.deleteEvent(); } catch(e) {}
      }
      sheet.getRange(rowIndex, idCol).setValue('');
    }
    if (config.date) removeCalendarEventsByTitle_(cal, config.title, config.date, '');
    return;
  }

  var event = null;
  if (eventId) {
    try { event = cal.getEventById(eventId); } catch(e) { event = null; }
    // 別シリーズへ付け替えた行が、以前共有していた決勝予定を上書きしないようにする。
    if (event && sharedId && event.getTitle() !== config.title) event = null;
  }
  var date = new Date(config.date);
  var start = new Date(date); start.setHours(0, 0, 0, 0);
  var end = new Date(date); end.setHours(23, 59, 59, 999);

  if (!event) {
    var matches = cal.getEvents(start, end).filter(function(candidate) {
      return candidate.getTitle() === config.title;
    });
    event = matches.length ? matches[0] : createCalendarEvent_(cal, config.title, config.date,
      config.startTime, config.endTime, config.defaultMinutes,
      { location: config.location || '', description: config.description || '' });
  }

  event.setTitle(config.title);
  setCalendarEventSchedule_(event, config.date, config.startTime, config.endTime, config.defaultMinutes);
  event.setLocation(config.location || '');
  event.setDescription(config.description || '');
  try { event.setColor(config.color); } catch(e) {}
  sheet.getRange(rowIndex, idCol).setValue(event.getId());
  removeDuplicateContestEvents_(cal, config.title, date, event.getId());
}

function removeCalendarEventsByTitle_(cal, title, dateVal, keepId) {
  var date = new Date(dateVal);
  if (isNaN(date.getTime())) return;
  var start = new Date(date); start.setHours(0, 0, 0, 0);
  var end = new Date(date); end.setHours(23, 59, 59, 999);
  cal.getEvents(start, end).forEach(function(event) {
    if (event.getTitle() !== title || (keepId && event.getId() === keepId)) return;
    try { event.deleteEvent(); } catch(e) {}
  });
}

function createCalendarEvent_(cal, title, dateVal, startTime, endTime, defaultMinutes, options) {
  if (!startTime) return cal.createAllDayEvent(title, new Date(dateVal), options || {});
  var start = combineCalendarDateTime_(dateVal, startTime);
  var end = endTime ? combineCalendarDateTime_(dateVal, endTime) : new Date(start.getTime() + defaultMinutes * 60000);
  if (end <= start) end = new Date(start.getTime() + defaultMinutes * 60000);
  return cal.createEvent(title, start, end, options || {});
}

function setCalendarEventSchedule_(event, dateVal, startTime, endTime, defaultMinutes) {
  if (!startTime) {
    event.setAllDayDate(new Date(dateVal));
    return;
  }
  var start = combineCalendarDateTime_(dateVal, startTime);
  var end = endTime ? combineCalendarDateTime_(dateVal, endTime) : new Date(start.getTime() + defaultMinutes * 60000);
  if (end <= start) end = new Date(start.getTime() + defaultMinutes * 60000);
  event.setTime(start, end);
}

function combineCalendarDateTime_(dateVal, timeVal) {
  var parts = String(dateVal).split('-');
  var time = String(timeVal || '00:00').split(':');
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10),
    parseInt(time[0], 10) || 0, parseInt(time[1], 10) || 0, 0, 0);
}

// 保存のたびに同日・同名イベントを1件へ統一する。
// 既存IDが一時的に不整合でも、更新ごとにイベントが増え続けることを防ぐ。
function removeDuplicateContestEvents_(cal, name, date, keepId) {
  var start = new Date(date); start.setHours(0, 0, 0, 0);
  var end = new Date(date); end.setHours(23, 59, 59, 999);
  cal.getEvents(start, end).forEach(function(event) {
    if (event.getTitle() !== name || event.getId() === keepId) return;
    try { event.deleteEvent(); } catch (err) { Logger.log('delete duplicate failed: ' + err); }
  });
}

// エントリー未提出の大会を一括同期する。古いカレンダーIDの復旧にも使用する。
function syncEntryPlannedContestsToCalendar() {
  return syncContestsToCalendar_(true);
}

// 全大会のカレンダーID重複・削除済みイベントを一括で正常化する。
function syncAllContestsToCalendar() {
  return syncContestsToCalendar_(false);
}

function syncContestsToCalendar_(entryPlannedOnly) {
  ensureSheets();
  var sheet = getSheet('コンテスト管理');
  if (!sheet || sheet.getLastRow() < 2) {
    return { success: true, targets: 0, created: 0, updated: 0, reused: 0, errors: [] };
  }
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h).trim(); });
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var result = { success: true, targets: 0, created: 0, updated: 0, reused: 0, errors: [] };

  rows.forEach(function(row, index) {
    var rowIndex = index + 2;
    var contest = toObj(headers, row, rowIndex);
    if (!contest['コンテスト名'] || !contest['開催日']) return;
    if (entryPlannedOnly && contest['エントリー_状況'] === '提出済') return;
    result.targets++;
    try {
      var synced = syncCalendar(contest, rowIndex, sheet, headers) || {};
      if (synced.action && result[synced.action] !== undefined) result[synced.action]++;
    } catch (err) {
      result.success = false;
      result.errors.push({ rowIndex: rowIndex, name: contest['コンテスト名'], error: String(err) });
    }
  });
  return result;
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

    // 大会のイベントかどうかは「大会v2」のカレンダーIDで判定する（旧シートは移行期の保険）
    var contestIds = {};
    [V2_SHEETS.CONTESTS, 'コンテスト管理'].forEach(function(sheetName) {
      var sheet = getSheet(sheetName);
      if (!sheet || sheet.getLastRow() <= 1) return;
      var hdrs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
        .map(function(h){ return String(h).trim(); });
      var cCol = hdrs.indexOf('カレンダーID');
      if (cCol < 0) return;
      var rows = sheet.getLastRow() - 1;
      sheet.getRange(2, cCol + 1, rows, 1).getValues().forEach(function(r, i){
        var cid = String(r[0] || '').trim();
        if (cid && !contestIds[cid]) contestIds[cid] = i + 2;
      });
    });

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
  return header === '集合時間' || header === '開始時間' || header === '終了時間' ||
    header === 'エントリー_開始時間' || header === '決勝_開始時間' || header === '決勝_終了時間';
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
    ['ID','プロジェクト名','ステータス','作成日','完了日','メモ','回収ステータス'],
    '#4A7CB0');
  makeSheet(TRIP_REC_SHEET,
    ['ID','プロジェクトID','日付','目的','目的地','支払者','運転者',
     '乗車メンバー','高速区間','高速料金','復路区間','復路料金','ETC割引','往復','ガソリン単価','走行距離','燃費',
     '駐車場有無','駐車場料金','その他費用JSON','復路距離'],
    '#4A7CB0');
  var carSh = makeSheet(CAR_SHEET, ['名前','燃費'], '#4A7CB0');
  if (carSh.getLastRow() <= 1) {
    FAMILY_NAMES.forEach(function(n) { carSh.appendRow([n + 'の車', 15]); });
  }
  makeSheet(ROUTE_SHEET, ['出発IC','到着IC','片道料金','片道距離'], '#4A7CB0');
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
  // 正しい19列ヘッダーで上書き
  var headers = ['ID','プロジェクトID','日付','目的','目的地','支払者','運転者',
                 '乗車メンバー','高速区間','高速料金','復路区間','復路料金','ETC割引','往復','ガソリン単価','走行距離','燃費',
                 '駐車場有無','駐車場料金','その他費用JSON','復路距離'];
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setBackground('#4A7CB0').setFontColor('#fff').setFontWeight('bold');
  sh.setFrozenRows(1);
  Logger.log('完了: おでかけ記録をリセットし、正しいヘッダー（復路料金列追加）に修正しました。');
}

/**
 * 【一回限り実行】スキーマ変更で列ずれしたおでかけ記録を修正する。
 * GASエディタで関数を選択して実行してください。
 *
 * 対象: 今日（2026-06-22）の変更前に保存されたレコード
 *   旧18列: 列10=ETC割引, 列11=往復, ...
 *   旧19列: 列10=復路料金, 列11=ETC割引, 列12=往復, ...
 *   → 現21列ヘッダーに正しくマッピングし直す
 */
function migrateTripRecordSchema() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(TRIP_REC_SHEET);
  if (!sh) { Logger.log('シートが見つかりません'); return; }

  var data = sh.getDataRange().getValues();
  if (data.length <= 1) { Logger.log('データなし'); return; }

  var migrated = 0;
  var logs = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue; // IDなし行はスキップ

    var newRow = null;

    // 旧18列判定: 位置[10]がboolean = ETC割引(旧)が復路区間(新)列にある
    if (typeof row[10] === 'boolean') {
      newRow = [
        row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9],
        '',       // 復路区間（新規）
        '',       // 復路料金（新規）
        row[10],  // ETC割引
        row[11],  // 往復
        row[12],  // ガソリン単価
        row[13],  // 走行距離
        row[14],  // 燃費
        row[15],  // 駐車場有無
        row[16],  // 駐車場料金
        row[17],  // その他費用JSON
        ''        // 復路距離（新規）
      ];
      logs.push('18列→修正 行' + (i+1) + ': ' + row[3]);

    // 旧19列判定: 位置[11]がboolean = ETC割引(旧)が復路料金(新)列にある
    } else if (typeof row[11] === 'boolean') {
      newRow = [
        row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9],
        '',       // 復路区間（新規）
        row[10],  // 復路料金（旧[10]にあった値）
        row[11],  // ETC割引
        row[12],  // 往復
        row[13],  // ガソリン単価
        row[14],  // 走行距離
        row[15],  // 燃費
        row[16],  // 駐車場有無
        row[17],  // 駐車場料金
        row[18],  // その他費用JSON
        ''        // 復路距離（新規）
      ];
      logs.push('19列→修正 行' + (i+1) + ': ' + row[3]);
    }

    if (newRow) {
      sh.getRange(i + 1, 1, 1, 21).setValues([newRow]);
      migrated++;
    }
  }

  if (migrated === 0) {
    Logger.log('列ずれの行は見つかりませんでした（すべて正常）');
  } else {
    Logger.log('【完了】' + migrated + '行を修正しました');
    logs.forEach(function(l) { Logger.log(l); });
  }
}

function getProjects() {
  ensureTripSheets();
  return sheetToRawObjects(getSheet(TRIP_PROJ_SHEET))
    .filter(function(r) { return r['プロジェクト名']; });
}

function saveProject(d) {
  ensureTripSheets();
  var sh = getSheet(TRIP_PROJ_SHEET);
  var h  = ['ID','プロジェクト名','ステータス','作成日','完了日','メモ','回収ステータス'];
  if (!d['ID']) d['ID'] = generateUid();
  if (!d['作成日']) d['作成日'] = formatDateString(new Date());
  if (!d['ステータス']) d['ステータス'] = '進行中';
  var row = h.map(function(k) { return d[k] !== undefined ? d[k] : ''; });
  var ri = parseInt(d['_rowIndex']) || 0;
  if (ri >= 2) sh.getRange(ri, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); ri = sh.getLastRow(); }
  return { success: true, rowIndex: ri, id: d['ID'] };
}

function saveCollectionStatus(projId, rowIndex, statusJson) {
  ensureTripSheets();
  var sh = getSheet(TRIP_PROJ_SHEET);
  var ri = parseInt(rowIndex) || 0;
  if (ri < 2) {
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(projId)) { ri = i + 1; break; }
    }
  }
  if (ri < 2) return { success: false };
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
                  .map(function(v){ return String(v).trim(); });
  var col = headers.indexOf('回収ステータス') + 1;
  if (col < 1) return { success: false };
  sh.getRange(ri, col).setValue(statusJson || '');
  return { success: true };
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
            '乗車メンバー','高速区間','高速料金','復路区間','復路料金','ETC割引','往復','ガソリン単価','走行距離','燃費',
            '駐車場有無','駐車場料金','その他費用JSON','復路距離'];
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

function saveRoute(from, to, amount, distance) {
  ensureTripSheets();
  var sh = getSheet(ROUTE_SHEET);
  var data = sh.getDataRange().getValues();
  var fromN = String(from||'').trim();
  var toN   = String(to||'').trim();
  var amt   = parseFloat(amount) || 0;
  var dist  = parseFloat(distance) || 0;
  if (data.length > 1) {
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === fromN && String(data[i][1]).trim() === toN) {
        sh.getRange(i + 1, 3, 1, 2).setValues([[amt, dist]]);
        return { success: true, rowIndex: i + 1, updated: true };
      }
    }
  }
  sh.appendRow([fromN, toN, amt, dist]);
  return { success: true, rowIndex: sh.getLastRow(), updated: false };
}

function deleteRoute(rowIndex) {
  var sh = getSheet(ROUTE_SHEET);
  if (sh && rowIndex >= 2) sh.deleteRow(rowIndex);
  return { success: true };
}
