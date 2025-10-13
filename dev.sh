#!/usr/bin/env bash
set -euo pipefail

# ==== 設定（必要に応じて変更）====
TB_APP="/Applications/Thunderbird.app"
PROFILE_DIR="$HOME/.tb-dev-profile"
BUILD_DIR="./build"
XPI_NAME="jp-spam-reporter.xpi"

# ==== XPIを作る（不要ファイルを除外）====
mkdir -p "$BUILD_DIR"
rm -f "$BUILD_DIR/$XPI_NAME"

# zip の対象はあなたの拡張ファイルに合わせて列挙してください
zip -r "$BUILD_DIR/$XPI_NAME" \
  manifest.json \
  background.js \
  options.html \
  options.js \
  utils icons \
  -x "__MACOSX/*" "*.DS_Store" "*.map" "build/*"

echo "✔ XPI built: $BUILD_DIR/$XPI_NAME"

# ==== 開発用プロファイル作成（初回のみ）====
if [ ! -d "$PROFILE_DIR" ]; then
  mkdir -p "$PROFILE_DIR"
  echo "✔ Created dev profile at $PROFILE_DIR"
fi

# ==== Thunderbird 起動（開発プロファイル＋拡張自動インストール）====
open -n -a "$TB_APP" --args \
  -no-remote \
  -profile "$PROFILE_DIR" \
  -purgecaches \
  -jsconsole \
  -install-addon "$PWD/$BUILD_DIR/$XPI_NAME"

echo "✔ Launching Thunderbird with dev profile and installing add-on"
