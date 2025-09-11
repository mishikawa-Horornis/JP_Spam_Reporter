# JP Spam Reporter

## 1) VirusTotal API キーを取得
- https://www.virustotal.com/ で無料アカウント作成 → API キーを確認

## 2) 開発者モードで読み込み
Thunderbird → メニュー → ツール → アドオンとテーマ → 歯車 → "アドオンをデバッグ" → "一時的なアドオンを読み込む" → manifest.json を選択

## 3) API キーを保存
- コンソールで `browser.storage.local.set({ vtApiKey: "<YOUR-API-KEY>" })` を一度実行
  （次回は設定UIを追加予定）

## 4) 使い方
- メールを開いて、右上の拡張アイコン「Check & Report」または右クリックメニュー
- URLを解析 → 危険があれば報告メールの下書き（.eml添付）を自動作成
- 送信前に必ず内容を確認して手動で送信してください（**自動送信はしない**）

## 注意
- aguse.jp 連携は将来の拡張。現状は VirusTotal のみ。
- 報告先のアドレスは運用方針や最新ガイドに従って適宜変更してください。
- 本アドオンは学習用途のサンプルであり、動作を保証しません。
