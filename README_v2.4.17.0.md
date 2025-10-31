# JP Spam Reporter Enhanced v2.4.17.0

Thunderbird用の迷惑メール・フィッシングメール自動検出＆報告拡張機能（統合版）

## 主な機能

### 🛡️ 自動検出
- **VirusTotal**: URL の安全性をチェック
- **Google Safe Browsing**: フィッシングサイトを検出
- **PhishTank**: 既知のフィッシングサイトデータベースで確認
- **独自フィッシング検出**: 表示名チェック、混在URLチェック

### 📧 自動レポート機能（v2.4.17.0の新機能）
危険なメールを検出した場合、**自動的にレポートメール下書きを作成**します。
- フィッシング対策協議会（info@antiphishing.jp）
- 迷惑メール相談センター（meiwaku@dekyo.or.jp）

### ✨ 特徴
- **ワンクリック操作**: 「Check & Report」ボタン1つで完結
- **自動EML添付**: 元メールを.emlファイルとして添付（推奨）
- **日本の報告機関に対応**: 国内の主要な報告先に自動送信

## 使い方

### 1. インストール
1. Thunderbirdで「ツール」→「アドオンとテーマ」を開く
2. 歯車アイコン → 「アドオンをファイルからインストール」
3. `JP_Spam_Reporter_Enhanced_v2_4_16_0.xpi` を選択

### 2. 初期設定
1. 「ツール」→「アドオンとテーマ」→「JP Spam Reporter Enhanced」の設定ボタン
2. 使用するチェックサービスを選択（VirusTotal/Google Safe Browsing/PhishTank）
3. 対応するAPIキーを設定

#### APIキーの取得方法

**VirusTotal**:
- https://www.virustotal.com にアクセス
- アカウント作成後、API Keyタブから取得

**Google Safe Browsing**:
- https://developers.google.com/safe-browsing/v4/get-started にアクセス
- Google Cloud Platformでプロジェクトを作成
- Safe Browsing APIを有効化してAPIキーを取得

**PhishTank**:
- https://www.phishtank.com にアクセス
- アカウント作成後、API Keyを取得

### 3. メールチェック
1. 怪しいメールを開く
2. ツールバーの「JP Spam Reporter」アイコンをクリック
3. 「Check & Report」ボタンをクリック
4. **危険なメールの場合**: 自動的にレポートメール下書きが作成されます
5. **安全なメールの場合**: チェック結果のみが表示されます

### 4. レポート送信
自動作成された下書きメールを確認して、送信ボタンをクリックするだけです。

## 動作の流れ

```
メールを開く
    ↓
「Check & Report」をクリック
    ↓
スキャン実行（VirusTotal/GSB/PhishTank + フィッシング検出）
    ↓
危険判定？
    ├─ YES → 自動的にレポートメール下書きを作成
    │         ├─ .emlファイルを添付
    │         ├─ フィッシング対策協議会に報告
    │         └─ 迷惑メール相談センターに報告
    │
    └─ NO  → チェック結果のみ表示
```

## 報告先について

### フィッシング対策協議会
- メールアドレス: info@antiphishing.jp
- Webサイト: https://www.antiphishing.jp

### 迷惑メール相談センター
- メールアドレス: meiwaku@dekyo.or.jp
- Webサイト: https://www.dekyo.or.jp

## v2.4.16.0 の新機能

### 自動レポート機能
- 危険なメールを検出すると、ユーザー操作なしで自動的にレポートメール下書きを作成
- 「Check」と「Report」の2段階操作から、「Check & Report」の1ステップに簡素化

### UIの改善
- Reportボタンを削除し、よりシンプルなインターフェース
- 自動化により、ユーザーの操作負担を軽減

### Manifestエラー修正
- `messageDisplayScripts` プロパティを削除し、Thunderbird 102+での警告を解消

## 技術仕様

- **対応Thunderbirdバージョン**: 102.0以降
- **Manifest Version**: 2
- **必要な権限**:
  - messagesRead: メールの内容を読み取る
  - messagesMove/Delete: メール操作
  - compose: レポートメールの作成
  - storage: 設定の保存
  - tabs: タブ管理
  - notifications: 通知表示
  - accountsRead: アカウント情報の読み取り
  - 外部API接続: VirusTotal、Google Safe Browsing、PhishTank

## トラブルシューティング

### レポートメールが作成されない
- APIキーが正しく設定されているか確認
- インターネット接続を確認
- Thunderbirdを再起動

### .emlファイルが添付されない
- メールサイズが大きい場合（10MB以上）は添付に失敗する可能性があります
- 手動で元メールを添付してください

### チェック結果が「UNKNOWN」になる
- APIキーの有効期限を確認
- API使用制限に達していないか確認
- ネットワーク接続を確認

## ライセンス

MIT License

## 作者

Masatoshi Ishikawa

## 変更履歴

詳細は `CHANGELOG_v2.4.16.0.md` を参照してください。

## サポート

問題が発生した場合は、以下の情報を含めて報告してください：
- Thunderbirdのバージョン
- 拡張機能のバージョン
- エラーメッセージ（ある場合）
- エラーコンソールのログ（ツール → エラーコンソール）
