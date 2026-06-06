// ============================================================
// RAMUSE セットアップスクリプト（一度だけ実行）
// ============================================================
// FAMILY_NAMES と getContestHeaders() は Code.gs で定義済み

// 手動実行用（GASエディタから実行）
function setupApp() {
  buildContestSheet(true);
  ensureTripSheets();
  Logger.log('セットアップ完了！');
}

function testTripData() {
  try {
    var result = getAllTripData();
    Logger.log('✅ プロジェクト数: ' + result.projects.length);
    Logger.log('✅ 車設定数: ' + result.carSettings.length);
    Logger.log('✅ 成功');
  } catch(e) {
    Logger.log('❌ エラー: ' + e.toString());
    Logger.log('❌ スタック: ' + e.stack);
  }
}

function buildContestSheet(force) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName('コンテスト管理');
  if (!force && existing) return;
  // force=true のときは古いシートを完全に削除して作り直す
  if (existing) ss.deleteSheet(existing);
  var sheet = ss.insertSheet('コンテスト管理');
  var headers = getContestHeaders();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#5C4FB0').setFontColor('#fff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 200);
}
