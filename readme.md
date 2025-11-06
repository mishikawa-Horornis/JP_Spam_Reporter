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

# プライバシーポリシー / Privacy Policy

## 日本語

JP Spam Reporter は Thunderbird で受信したメール内の URL をセキュリティチェックする拡張機能です。  
本拡張機能は以下のとおり、ユーザーデータを扱います。

### 1. 扱うデータの種類
- 受信メール内の URL  
- 拡張機能のオプションで設定された API キー

### 2. データの利用目的
- URL の安全性判定のため、VirusTotal・Google Safe Browsing・PhishTank など外部サービスに URL を送信します  
- 判定結果に基づき、フィッシング報告メールの下書きを作成します

### 3. データの保存
- 本拡張機能自体はメール内容や判定結果を外部に保存しません  
- API キーは Thunderbird の拡張機能ストレージにローカル保存されます

### 4. 第三者への提供
- 判定サービスに送信された URL は各サービスのプライバシーポリシーに従って扱われます  
- VirusTotal など一部のサービスは送信された URL をセキュリティ研究や共有に利用する場合があります

### 5. 免責事項
- 本拡張機能の利用により発生したいかなる損害についても開発者は責任を負いません


---

## English

JP Spam Reporter is a Thunderbird add-on that scans URLs in incoming emails for security purposes.

### 1. Data Collected
- URLs contained in the selected email  
- API keys configured in the add-on options

### 2. Purpose of Use
- URLs are submitted to external services (VirusTotal, Google Safe Browsing, PhishTank) for safety analysis  
- Results are used to generate draft phishing reports for the user

### 3. Data Storage
- The add-on itself does not store email content or scan results externally  
- API keys are stored locally in Thunderbird’s extension storage

### 4. Third-Party Services
- Submitted URLs are handled according to each service’s privacy policy  
- Some services (e.g., VirusTotal) may share submitted URLs for research or security purposes

### 5. Disclaimer
- The developer assumes no responsibility for any damages arising from the use of this add-on
