// SPDX-License-Identifier: MIT
// trustedDomains.js - 信頼できる日本の組織・企業のドメインデータベース

(function() {
  /**
   * 信頼できるドメインのデータベース
   * 主要なインターネットプロバイダー、通販サイト、宅配サイト、通信キャリア、
   * 電力会社、銀行・金融・証券、交通機関、クレジット会社、警察・省庁など
   */
  const TRUSTED_DOMAINS = {
    // === インターネットプロバイダー ===
    'ISP': {
      // NTTグループ
      'ntt.com': { name: 'NTT', category: 'ISP' },
      'ntt-east.co.jp': { name: 'NTT東日本', category: 'ISP' },
      'ntt-west.co.jp': { name: 'NTT西日本', category: 'ISP' },
      'ntt.co.jp': { name: 'NTT', category: 'ISP' },
      'ocn.ne.jp': { name: 'OCN', category: 'ISP' },
      'plala.or.jp': { name: 'ぷらら', category: 'ISP' },
      'wakwak.com': { name: 'WAKWAK', category: 'ISP' },
      
      // KDDI系
      'au.com': { name: 'au', category: 'ISP' },
      'kddi.com': { name: 'KDDI', category: 'ISP' },
      'kddi.ne.jp': { name: 'KDDI', category: 'ISP' },
      'biglobe.ne.jp': { name: 'BIGLOBE', category: 'ISP' },
      'uqwimax.jp': { name: 'UQ WiMAX', category: 'ISP' },
      
      // その他大手ISP
      'so-net.ne.jp': { name: 'So-net', category: 'ISP' },
      'nifty.com': { name: '@nifty', category: 'ISP' },
      'nifty.ne.jp': { name: '@nifty', category: 'ISP' },
      'iij.ad.jp': { name: 'IIJ', category: 'ISP' },
      'asahi-net.or.jp': { name: 'ASAHIネット', category: 'ISP' },
      'jcom.co.jp': { name: 'J:COM', category: 'ISP' },
      'jcom.home.ne.jp': { name: 'J:COM', category: 'ISP' },
      'zaq.ne.jp': { name: 'ZAQ', category: 'ISP' },
      'eonet.ne.jp': { name: 'eo光', category: 'ISP' },
    },

    // === 通販サイト ===
    'EC': {
      // 楽天グループ
      'rakuten.co.jp': { name: '楽天', category: 'EC' },
      'rakuten-card.co.jp': { name: '楽天カード', category: 'EC' },
      'rakuten-bank.co.jp': { name: '楽天銀行', category: 'EC' },
      'rakuten-sec.co.jp': { name: '楽天証券', category: 'EC' },
      'rakuten.ne.jp': { name: '楽天', category: 'EC' },
      'r10.to': { name: '楽天（短縮URL）', category: 'EC' },
      
      // Amazon
      'amazon.co.jp': { name: 'Amazon', category: 'EC' },
      'amazon.jp': { name: 'Amazon', category: 'EC' },
      'amazon.com': { name: 'Amazon', category: 'EC' },
      'amazonpay.com': { name: 'Amazon Pay', category: 'EC' },
      
      // Yahoo!ショッピング
      'yahoo.co.jp': { name: 'Yahoo! JAPAN', category: 'EC' },
      'yahoo-net.jp': { name: 'Yahoo! JAPAN', category: 'EC' },
      'paypay.ne.jp': { name: 'PayPay', category: 'EC' },
      'paypay-corp.co.jp': { name: 'PayPay', category: 'EC' },
      
      // その他通販
      'mercari.jp': { name: 'メルカリ', category: 'EC' },
      'mercari.com': { name: 'メルカリ', category: 'EC' },
      'zozotown.com': { name: 'ZOZOTOWN', category: 'EC' },
      'zozo.jp': { name: 'ZOZO', category: 'EC' },
      'yodobashi.com': { name: 'ヨドバシカメラ', category: 'EC' },
      'bic-camera.com': { name: 'ビックカメラ', category: 'EC' },
      'kakaku.com': { name: '価格.com', category: 'EC' },
      'askul.co.jp': { name: 'アスクル', category: 'EC' },
      'lohaco.jp': { name: 'LOHACO', category: 'EC' },
      'monotaro.com': { name: 'MonotaRO', category: 'EC' },
    },

    // === 宅配・物流 ===
    'DELIVERY': {
      // ヤマト運輸
      'kuronekoyamato.co.jp': { name: 'クロネコヤマト', category: 'DELIVERY' },
      'yamato-transport.co.jp': { name: 'ヤマト運輸', category: 'DELIVERY' },
      'nekonet.co.jp': { name: 'ヤマト運輸', category: 'DELIVERY' },
      
      // 佐川急便
      'sagawa-exp.co.jp': { name: '佐川急便', category: 'DELIVERY' },
      
      // 日本郵便
      'post.japanpost.jp': { name: '日本郵便', category: 'DELIVERY' },
      'japanpost.jp': { name: '日本郵便', category: 'DELIVERY' },
      'yuubin.jp': { name: '日本郵便', category: 'DELIVERY' },
      
      // その他宅配
      'seino.co.jp': { name: '西濃運輸', category: 'DELIVERY' },
      'fukutsu.co.jp': { name: '福山通運', category: 'DELIVERY' },
    },

    // === 通信キャリア ===
    'CARRIER': {
      // NTTドコモ
      'docomo.ne.jp': { name: 'NTTドコモ', category: 'CARRIER' },
      'nttdocomo.co.jp': { name: 'NTTドコモ', category: 'CARRIER' },
      'dmkt-sp.jp': { name: 'dマーケット', category: 'CARRIER' },
      'dcm-gate.com': { name: 'ドコモ', category: 'CARRIER' },
      
      // au/KDDI
      'au.com': { name: 'au', category: 'CARRIER' },
      'kddi.com': { name: 'KDDI', category: 'CARRIER' },
      'ezweb.ne.jp': { name: 'au', category: 'CARRIER' },
      
      // SoftBank
      'softbank.jp': { name: 'SoftBank', category: 'CARRIER' },
      'softbank.ne.jp': { name: 'SoftBank', category: 'CARRIER' },
      'ymobile.ne.jp': { name: 'Y!mobile', category: 'CARRIER' },
      
      // 楽天モバイル
      'rakuten.jp': { name: '楽天モバイル', category: 'CARRIER' },
      'rakuten-mobile.jp': { name: '楽天モバイル', category: 'CARRIER' },
    },

    // === 電力・ガス・水道 ===
    'UTILITY': {
      // 電力会社
      'tepco.co.jp': { name: '東京電力', category: 'UTILITY' },
      'kepco.co.jp': { name: '関西電力', category: 'UTILITY' },
      'chuden.co.jp': { name: '中部電力', category: 'UTILITY' },
      'tohoku-epco.co.jp': { name: '東北電力', category: 'UTILITY' },
      'kyuden.co.jp': { name: '九州電力', category: 'UTILITY' },
      'hepco.co.jp': { name: '北海道電力', category: 'UTILITY' },
      'yonden.co.jp': { name: '四国電力', category: 'UTILITY' },
      'energia.co.jp': { name: '中国電力', category: 'UTILITY' },
      'rikuden.co.jp': { name: '北陸電力', category: 'UTILITY' },
      'okiden.co.jp': { name: '沖縄電力', category: 'UTILITY' },
      
      // ガス会社
      'tokyo-gas.co.jp': { name: '東京ガス', category: 'UTILITY' },
      'osakagas.co.jp': { name: '大阪ガス', category: 'UTILITY' },
      'tohogas.co.jp': { name: '東邦ガス', category: 'UTILITY' },
      'saibugas.co.jp': { name: '西部ガス', category: 'UTILITY' },
      
      // 水道局
      'waterworks.metro.tokyo.jp': { name: '東京都水道局', category: 'UTILITY' },
    },

    // === 銀行・金融・証券 ===
    'FINANCE': {
      // メガバンク
      'bk.mufg.jp': { name: '三菱UFJ銀行', category: 'FINANCE' },
      'smbc.co.jp': { name: '三井住友銀行', category: 'FINANCE' },
      'mizuhobank.co.jp': { name: 'みずほ銀行', category: 'FINANCE' },
      'resona-gr.co.jp': { name: 'りそなグループ', category: 'FINANCE' },
      
      // ネット銀行
      'rakuten-bank.co.jp': { name: '楽天銀行', category: 'FINANCE' },
      'japannetbank.co.jp': { name: 'PayPay銀行', category: 'FINANCE' },
      'jibunbank.co.jp': { name: 'auじぶん銀行', category: 'FINANCE' },
      'sonybank.net': { name: 'ソニー銀行', category: 'FINANCE' },
      'aozorabank.co.jp': { name: 'あおぞら銀行', category: 'FINANCE' },
      'sevenbank.co.jp': { name: 'セブン銀行', category: 'FINANCE' },
      
      // ゆうちょ
      'jp-bank.japanpost.jp': { name: 'ゆうちょ銀行', category: 'FINANCE' },
      
      // 証券会社
      'nomura.co.jp': { name: '野村證券', category: 'FINANCE' },
      'daiwa.jp': { name: '大和証券', category: 'FINANCE' },
      'rakuten-sec.co.jp': { name: '楽天証券', category: 'FINANCE' },
      'sbisec.co.jp': { name: 'SBI証券', category: 'FINANCE' },
      'matsui.co.jp': { name: '松井証券', category: 'FINANCE' },
      'monex.co.jp': { name: 'マネックス証券', category: 'FINANCE' },
      'kabu.com': { name: 'auカブコム証券', category: 'FINANCE' },
      
      // 保険
      'ms-ins.com': { name: '三井住友海上', category: 'FINANCE' },
      'tokiomarine-nichido.co.jp': { name: '東京海上日動', category: 'FINANCE' },
      'sompo-japan.co.jp': { name: '損保ジャパン', category: 'FINANCE' },
      'aioi.co.jp': { name: 'あいおいニッセイ同和損保', category: 'FINANCE' },
      'nissay.co.jp': { name: '日本生命', category: 'FINANCE' },
      'dai-ichi-life.co.jp': { name: '第一生命', category: 'FINANCE' },
      'meijiyasuda.co.jp': { name: '明治安田生命', category: 'FINANCE' },
      'sumitomo-life.co.jp': { name: '住友生命', category: 'FINANCE' },
    },

    // === 交通機関 ===
    'TRANSPORT': {
      // JR各社
      'jreast.co.jp': { name: 'JR東日本', category: 'TRANSPORT' },
      'jr-central.co.jp': { name: 'JR東海', category: 'TRANSPORT' },
      'westjr.co.jp': { name: 'JR西日本', category: 'TRANSPORT' },
      'jrhokkaido.co.jp': { name: 'JR北海道', category: 'TRANSPORT' },
      'jrshikoku.co.jp': { name: 'JR四国', category: 'TRANSPORT' },
      'jrkyushu.co.jp': { name: 'JR九州', category: 'TRANSPORT' },
      
      // 私鉄
      'tokyometro.jp': { name: '東京メトロ', category: 'TRANSPORT' },
      'odakyu.jp': { name: '小田急電鉄', category: 'TRANSPORT' },
      'keio.co.jp': { name: '京王電鉄', category: 'TRANSPORT' },
      'tokyu.co.jp': { name: '東急電鉄', category: 'TRANSPORT' },
      'keikyu.co.jp': { name: '京急電鉄', category: 'TRANSPORT' },
      'seibu-group.co.jp': { name: '西武鉄道', category: 'TRANSPORT' },
      'tobu.co.jp': { name: '東武鉄道', category: 'TRANSPORT' },
      'nankai.co.jp': { name: '南海電鉄', category: 'TRANSPORT' },
      'kintetsu.co.jp': { name: '近鉄', category: 'TRANSPORT' },
      'hankyu.co.jp': { name: '阪急電鉄', category: 'TRANSPORT' },
      'hanshin.co.jp': { name: '阪神電鉄', category: 'TRANSPORT' },
      
      // 航空会社
      'jal.co.jp': { name: 'JAL', category: 'TRANSPORT' },
      'ana.co.jp': { name: 'ANA', category: 'TRANSPORT' },
      'flypeach.com': { name: 'Peach', category: 'TRANSPORT' },
      'jetstar.com': { name: 'Jetstar', category: 'TRANSPORT' },
      'skymark.co.jp': { name: 'スカイマーク', category: 'TRANSPORT' },
      
      // 高速道路
      'nexco.ne.jp': { name: 'NEXCO', category: 'TRANSPORT' },
      'driveplaza.com': { name: 'ドラぷら', category: 'TRANSPORT' },
    },

    // === クレジットカード ===
    'CREDIT': {
      'jcb.co.jp': { name: 'JCB', category: 'CREDIT' },
      'cr.mufg.jp': { name: '三菱UFJニコス', category: 'CREDIT' },
      'smbc-card.com': { name: '三井住友カード', category: 'CREDIT' },
      'aeon.co.jp': { name: 'イオンカード', category: 'CREDIT' },
      'rakuten-card.co.jp': { name: '楽天カード', category: 'CREDIT' },
      'dcard.co.jp': { name: 'dカード', category: 'CREDIT' },
      'view.eki-net.com': { name: 'ビューカード', category: 'CREDIT' },
      'orico.co.jp': { name: 'オリコカード', category: 'CREDIT' },
      'cedyna.co.jp': { name: 'セディナ', category: 'CREDIT' },
      'jaccs.co.jp': { name: 'ジャックス', category: 'CREDIT' },
      'lifecard.co.jp': { name: 'ライフカード', category: 'CREDIT' },
      'eposcard.co.jp': { name: 'エポスカード', category: 'CREDIT' },
      'saisoncard.co.jp': { name: 'セゾンカード', category: 'CREDIT' },
      'uccard.co.jp': { name: 'UCカード', category: 'CREDIT' },
      'americanexpress.com': { name: 'アメリカン・エキスプレス', category: 'CREDIT' },
    },

    // === 官公庁・警察 ===
    'GOVERNMENT': {
      // 省庁
      'cas.go.jp': { name: '内閣官房', category: 'GOVERNMENT' },
      'cao.go.jp': { name: '内閣府', category: 'GOVERNMENT' },
      'mof.go.jp': { name: '財務省', category: 'GOVERNMENT' },
      'mext.go.jp': { name: '文部科学省', category: 'GOVERNMENT' },
      'mhlw.go.jp': { name: '厚生労働省', category: 'GOVERNMENT' },
      'maff.go.jp': { name: '農林水産省', category: 'GOVERNMENT' },
      'meti.go.jp': { name: '経済産業省', category: 'GOVERNMENT' },
      'mlit.go.jp': { name: '国土交通省', category: 'GOVERNMENT' },
      'env.go.jp': { name: '環境省', category: 'GOVERNMENT' },
      'mod.go.jp': { name: '防衛省', category: 'GOVERNMENT' },
      'soumu.go.jp': { name: '総務省', category: 'GOVERNMENT' },
      'moj.go.jp': { name: '法務省', category: 'GOVERNMENT' },
      'mofa.go.jp': { name: '外務省', category: 'GOVERNMENT' },
      
      // 警察・検察
      'npa.go.jp': { name: '警察庁', category: 'GOVERNMENT' },
      'keishicho.metro.tokyo.jp': { name: '警視庁', category: 'GOVERNMENT' },
      'kensatsu.go.jp': { name: '検察庁', category: 'GOVERNMENT' },
      
      // その他
      'digital.go.jp': { name: 'デジタル庁', category: 'GOVERNMENT' },
      'go.jp': { name: '政府機関', category: 'GOVERNMENT' },
      'lg.jp': { name: '地方自治体', category: 'GOVERNMENT' },
    },

    // === IT・ポータルサイト ===
    'IT': {
      'google.com': { name: 'Google', category: 'IT' },
      'gmail.com': { name: 'Gmail', category: 'IT' },
      'yahoo.co.jp': { name: 'Yahoo! JAPAN', category: 'IT' },
      'microsoft.com': { name: 'Microsoft', category: 'IT' },
      'outlook.com': { name: 'Outlook', category: 'IT' },
      'apple.com': { name: 'Apple', category: 'IT' },
      'icloud.com': { name: 'iCloud', category: 'IT' },
      'line.me': { name: 'LINE', category: 'IT' },
      'line-apps.com': { name: 'LINE', category: 'IT' },
      'naver.jp': { name: 'NAVER', category: 'IT' },
      'twitter.com': { name: 'Twitter', category: 'IT' },
      'x.com': { name: 'X (Twitter)', category: 'IT' },
      'facebook.com': { name: 'Facebook', category: 'IT' },
      'instagram.com': { name: 'Instagram', category: 'IT' },
    },
  };

  /**
   * ドメインが信頼できるドメインリストに含まれているかチェック
   * @param {string} domain - チェックするドメイン
   * @returns {Object|null} マッチした場合はドメイン情報、マッチしない場合はnull
   */
  globalThis.checkTrustedDomain = function(domain) {
    if (!domain || typeof domain !== 'string') {
      return null;
    }

    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');

    // 全カテゴリを検索
    for (const category of Object.values(TRUSTED_DOMAINS)) {
      for (const [trustedDomain, info] of Object.entries(category)) {
        // 完全一致またはサブドメインとして一致
        if (normalizedDomain === trustedDomain || normalizedDomain.endsWith('.' + trustedDomain)) {
          return {
            domain: trustedDomain,
            ...info,
            matched: normalizedDomain
          };
        }
      }
    }

    return null;
  };

  /**
   * ユーザー定義のホワイトリストをチェック
   * @param {string} domain - チェックするドメイン
   * @param {string[]} whitelist - ホワイトリストの配列
   * @returns {boolean} ホワイトリストに含まれている場合はtrue
   */
  globalThis.checkWhitelist = function(domain, whitelist) {
    if (!domain || !Array.isArray(whitelist) || whitelist.length === 0) {
      return false;
    }

    const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');

    for (const whitelistedDomain of whitelist) {
      const normalized = whitelistedDomain.toLowerCase().replace(/^www\./, '').trim();
      if (normalized && (normalizedDomain === normalized || normalizedDomain.endsWith('.' + normalized))) {
        return true;
      }
    }

    return false;
  };

  /**
   * ドメインが信頼できるかチェック（信頼リスト + ユーザーホワイトリスト）
   * @param {string} domain - チェックするドメイン
   * @param {string[]} customWhitelist - ユーザー定義のホワイトリスト（オプション）
   * @returns {Object} { trusted: boolean, reason: string, info: Object|null }
   */
  globalThis.isDomainTrusted = function(domain, customWhitelist = []) {
    // 信頼できるドメインリストをチェック
    const trustedInfo = globalThis.checkTrustedDomain(domain);
    if (trustedInfo) {
      return {
        trusted: true,
        reason: 'trusted_database',
        info: trustedInfo
      };
    }

    // ユーザー定義のホワイトリストをチェック
    if (globalThis.checkWhitelist(domain, customWhitelist)) {
      return {
        trusted: true,
        reason: 'user_whitelist',
        info: { domain, category: 'USER_DEFINED' }
      };
    }

    return {
      trusted: false,
      reason: 'not_in_list',
      info: null
    };
  };

  /**
   * 全ての信頼できるドメインを取得（デバッグ用）
   * @returns {Object} カテゴリ別のドメインリスト
   */
  globalThis.getAllTrustedDomains = function() {
    return TRUSTED_DOMAINS;
  };

  console.log('[TrustedDomains] Module loaded with', 
    Object.values(TRUSTED_DOMAINS).reduce((sum, cat) => sum + Object.keys(cat).length, 0), 
    'trusted domains');
})();
