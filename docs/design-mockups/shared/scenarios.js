(function (factory) {
  var api = factory();
  var root =
    typeof window !== 'undefined'
      ? window
      : typeof globalThis !== 'undefined'
        ? globalThis
        : this;

  if (root) {
    root.AKAMONEY_SCENARIOS = api;
  }

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
    module.exports.default = api;
  }
})(function () {
  var SCENARIO_NAMES = [
    'default',
    'large250',
    'empty',
    'noResults',
    'edgeCases',
    'zeroAnalytics',
    'apiError',
  ];
  var BASE_TIMESTAMP = Date.UTC(2026, 7, 24, 9, 0, 0);
  var DAILY_CLICK_TEMPLATE = [
    18, 43, 45, 47, 49, 46, 20, 17, 42, 44,
    48, 50, 47, 19, 16, 43, 46, 117, 51, 49,
    18, 15, 44, 47, 49, 52, 48, 20, 17, 52,
  ];
  var DAILY_START_DATE = '2026-07-26';
  var EDGE_LONG_URL =
    'https://campaigns.example.com/zh-tw/summer-membership/preview/' +
    'feature-highlight/'.repeat(12) +
    '?utm_source=design-bakeoff&utm_medium=prototype&utm_campaign=summer_refresh&utm_content=hero_banner&utm_term=long-form-preview';

  function deepClone(value) {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
  }

  function buildShortUrl(shortCode) {
    return 'https://aka.money/' + shortCode;
  }

  function formatDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function addDays(dateString, offset) {
    var date = new Date(dateString + 'T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + offset);
    return formatDate(date);
  }

  function sumClicks(urls) {
    return urls.reduce(function (total, url) {
      return total + url.click_count;
    }, 0);
  }

  function scaleDailySeries(totalClicks) {
    if (totalClicks <= 0) {
      return DAILY_CLICK_TEMPLATE.map(function (_, index) {
        return { date: addDays(DAILY_START_DATE, index), clicks: 0 };
      });
    }

    var templateTotal = DAILY_CLICK_TEMPLATE.reduce(function (total, clicks) {
      return total + clicks;
    }, 0);
    var provisional = DAILY_CLICK_TEMPLATE.map(function (clicks) {
      return Math.floor((clicks / templateTotal) * totalClicks);
    });
    var allocated = provisional.reduce(function (total, clicks) {
      return total + clicks;
    }, 0);
    var remainder = totalClicks - allocated;
    var cursor = 0;

    while (remainder > 0) {
      provisional[cursor % provisional.length] += 1;
      remainder -= 1;
      cursor += 1;
    }

    return provisional.map(function (clicks, index) {
      return { date: addDays(DAILY_START_DATE, index), clicks: clicks };
    });
  }

  function splitTotal(total, weightedEntries) {
    var base = weightedEntries.map(function (entry) {
      return { label: entry[0], weight: entry[1], value: 0 };
    });
    var weightTotal = base.reduce(function (sum, entry) {
      return sum + entry.weight;
    }, 0);
    var assigned = 0;

    for (var index = 0; index < base.length; index += 1) {
      var value =
        index === base.length - 1
          ? total - assigned
          : Math.floor((total * base[index].weight) / weightTotal);
      base[index].value = value;
      assigned += value;
    }

    return base.reduce(function (distribution, entry) {
      distribution[entry.label] = entry.value;
      return distribution;
    }, {});
  }

  function createAnalytics(urls, options) {
    var totalClicks = options.totalClicks;
    var dailySeries =
      options.emptySeries === true ? [] : scaleDailySeries(totalClicks);
    var spikePoint = null;

    if (dailySeries.length > 0) {
      spikePoint = dailySeries.reduce(function (currentMax, point) {
        if (!currentMax || point.clicks > currentMax.clicks) {
          return point;
        }

        return currentMax;
      }, null);
    }

    return {
      totalClicks: totalClicks,
      dailySeries: dailySeries,
      countryDistribution: splitTotal(totalClicks, [
        ['臺灣', 56],
        ['日本', 18],
        ['美國', 14],
        ['新加坡', 12],
      ]),
      deviceDistribution: splitTotal(totalClicks, [
        ['手機', 60],
        ['桌機', 26],
        ['平板', 14],
      ]),
      browserDistribution: splitTotal(totalClicks, [
        ['Safari', 37],
        ['Chrome', 34],
        ['Edge', 16],
        ['Firefox', 13],
      ]),
      campaignSpike: spikePoint
        ? {
            date: spikePoint.date,
            clicks: spikePoint.clicks,
            label: '夏季活動加碼曝光',
          }
        : null,
      highlights:
        totalClicks > 0
          ? ['週末流量較低', '活動檔期帶動單日高峰']
          : ['目前尚無可視化點擊資料'],
    };
  }

  function createOverallStats(urls, analytics) {
    var activeLinks = urls.filter(function (url) {
      return url.is_active;
    }).length;
    var totalClicks = sumClicks(urls);
    var topLinks = urls
      .slice()
      .sort(function (left, right) {
        return right.click_count - left.click_count;
      })
      .slice(0, 5)
      .map(function (url) {
        return {
          short_code: url.short_code,
          original_url: url.original_url,
          click_count: url.click_count,
          title: url.title,
        };
      });
    var dailySeries = analytics.dailySeries || [];

    return {
      total_clicks: totalClicks,
      active_links: activeLinks,
      total_links: urls.length,
      archived_links: urls.length - activeLinks,
      average_clicks_per_link:
        urls.length === 0 ? 0 : Number((totalClicks / urls.length).toFixed(1)),
      click_trend: dailySeries.reduce(function (trend, point) {
        trend[point.date] = point.clicks;
        return trend;
      }, {}),
      top_links: topLinks,
      country_distribution: analytics.countryDistribution,
      device_distribution: analytics.deviceDistribution,
      date_range: {
        start: dailySeries.length > 0 ? dailySeries[0].date : '',
        end: dailySeries.length > 0 ? dailySeries[dailySeries.length - 1].date : '',
      },
    };
  }

  function buildUrlRecord(index, overrides) {
    var createdAt = BASE_TIMESTAMP - index * 86400000;
    var defaultRecord = {
      id: 'mock-url-' + String(index).padStart(3, '0'),
      short_code: 'm' + String(index).padStart(4, '0'),
      original_url:
        'https://campaign.example.com/zh-tw/landing-' +
        String(index).padStart(3, '0') +
        '?utm_source=akamoney&utm_medium=design&utm_campaign=proposal-foundation',
      short_url: buildShortUrl('m' + String(index).padStart(4, '0')),
      title: '設計提案示範連結 ' + index,
      description: '用於 AkaMoney 設計提案評估的示範資料 ' + index,
      image_url:
        'https://images.example.com/akamoney/mockups/cover-' +
        String((index % 9) + 1) +
        '.jpg',
      created_at: createdAt,
      updated_at: createdAt + 21600000,
      expires_at: undefined,
      is_active: true,
      click_count: 0,
    };
    var record = Object.assign({}, defaultRecord, overrides || {});

    if (!record.short_url) {
      record.short_url = buildShortUrl(record.short_code);
    }

    return record;
  }

  function makeScenario(name, urls, metaOverrides, analyticsOverrides) {
    var analytics = createAnalytics(urls, Object.assign({
      totalClicks: sumClicks(urls),
      emptySeries: false,
    }, analyticsOverrides || {}));
    var meta = Object.assign(
      {
        locale: 'zh-TW',
        generatedAt: BASE_TIMESTAMP,
        summary: '提供設計提案共用的情境資料。',
      },
      metaOverrides || {},
    );

    return {
      name: name,
      urls: urls,
      analytics: analytics,
      overallStats: createOverallStats(urls, analytics),
      user: {
        id: 'user-design-review',
        email: 'reviewer@aka.money',
        name: '設計評審小組',
        role: 'admin',
      },
      meta: meta,
    };
  }

  var defaultUrls = [
    buildUrlRecord(1, {
      short_code: 'spring24',
      short_url: buildShortUrl('spring24'),
      title: '春季會員招募主頁',
      description: '主打 AkaMoney 會員招募活動的首頁短網址',
      click_count: 152,
    }),
    buildUrlRecord(2, {
      short_code: 'budgetkit',
      short_url: buildShortUrl('budgetkit'),
      title: '預算工具下載頁',
      description: '提供新手下載預算規劃工具包',
      click_count: 134,
    }),
    buildUrlRecord(3, {
      short_code: 'summergo',
      short_url: buildShortUrl('summergo'),
      title: '夏季旅遊回饋頁',
      description: '旅遊支出回饋活動的導流短網址',
      click_count: 128,
    }),
    buildUrlRecord(4, {
      short_code: 'receiptai',
      short_url: buildShortUrl('receiptai'),
      title: '拍照記帳功能介紹',
      description: '介紹拍照記帳與 AI 辨識的功能頁',
      click_count: 120,
    }),
    buildUrlRecord(5, {
      short_code: 'saveplan',
      short_url: buildShortUrl('saveplan'),
      title: '年度儲蓄計畫頁',
      description: '鼓勵使用者建立年度儲蓄目標',
      click_count: 110,
    }),
    buildUrlRecord(6, {
      short_code: 'monecard',
      short_url: buildShortUrl('monecard'),
      title: '聯名卡優惠整理',
      description: '集中整理聯名卡權益與回饋方案',
      click_count: 95,
    }),
    buildUrlRecord(7, {
      short_code: 'giftloop',
      short_url: buildShortUrl('giftloop'),
      title: '分享抽獎活動頁',
      description: '邀請好友參加抽獎的活動短網址',
      click_count: 90,
    }),
    buildUrlRecord(8, {
      short_code: 'q3report',
      short_url: buildShortUrl('q3report'),
      title: '第三季績效報告頁',
      description: '提供季度成效摘要給合作夥伴',
      click_count: 82,
    }),
    buildUrlRecord(9, {
      short_code: 'taxready',
      short_url: buildShortUrl('taxready'),
      title: '報稅整理清單',
      description: '彙整報稅季需要準備的檔案與流程',
      click_count: 76,
    }),
    buildUrlRecord(10, {
      short_code: 'freshstart',
      short_url: buildShortUrl('freshstart'),
      title: '新手上路導覽',
      description: '幫助新使用者完成第一筆記帳',
      click_count: 65,
    }),
    buildUrlRecord(11, {
      short_code: 'cashflow',
      short_url: buildShortUrl('cashflow'),
      title: '現金流檢視頁',
      description: '整理每月現金流與異常提醒',
      click_count: 58,
    }),
    buildUrlRecord(12, {
      short_code: 'couplepay',
      short_url: buildShortUrl('couplepay'),
      title: '共同記帳教學頁',
      description: '協助伴侶快速理解共同記帳流程',
      click_count: 49,
    }),
    buildUrlRecord(13, {
      short_code: 'legacy01',
      short_url: buildShortUrl('legacy01'),
      title: '舊版活動備份頁',
      description: '已封存的歷史活動導流頁',
      click_count: 35,
      is_active: false,
    }),
    buildUrlRecord(14, {
      short_code: 'legacy02',
      short_url: buildShortUrl('legacy02'),
      title: '封存教學短網址',
      description: '舊版教學內容保留供內部參考',
      click_count: 18,
      is_active: false,
    }),
    buildUrlRecord(15, {
      short_code: 'legacy03',
      short_url: buildShortUrl('legacy03'),
      title: '下架活動回顧頁',
      description: '已下架活動的歷史回顧頁',
      click_count: 7,
      is_active: false,
    }),
  ];

  var defaultAnalytics = {
    totalClicks: sumClicks(defaultUrls),
    dailySeries: DAILY_CLICK_TEMPLATE.map(function (clicks, index) {
      return { date: addDays(DAILY_START_DATE, index), clicks: clicks };
    }),
    countryDistribution: {
      臺灣: 683,
      日本: 214,
      美國: 170,
      新加坡: 152,
    },
    deviceDistribution: {
      手機: 731,
      桌機: 317,
      平板: 171,
    },
    browserDistribution: {
      Safari: 438,
      Chrome: 414,
      Edge: 195,
      Firefox: 172,
    },
    campaignSpike: {
      date: '2026-08-12',
      clicks: 117,
      label: '夏季活動加碼曝光',
    },
    highlights: ['週末流量較低', '八月中旬活動曝光明顯放大'],
  };

  var defaultScenario = {
    name: 'default',
    urls: defaultUrls,
    analytics: defaultAnalytics,
    overallStats: createOverallStats(defaultUrls, defaultAnalytics),
    user: {
      id: 'user-design-review',
      email: 'reviewer@aka.money',
      name: '設計評審小組',
      role: 'admin',
    },
    meta: {
      locale: 'zh-TW',
      generatedAt: BASE_TIMESTAMP,
      summary: '主儀表板的標準狀態，包含常見的連結管理與成效概覽。',
    },
  };

  var largeUrls = [];
  for (var largeIndex = 1; largeIndex <= 246; largeIndex += 1) {
    largeUrls.push(
      buildUrlRecord(100 + largeIndex, {
        id: 'large-url-' + String(largeIndex).padStart(3, '0'),
        short_code: 'p' + String(largeIndex).padStart(4, '0'),
        short_url: buildShortUrl('p' + String(largeIndex).padStart(4, '0')),
        title: '大量資料示範連結 ' + largeIndex,
        description: '提供設計稿測試大量列表滾動與篩選 ' + largeIndex,
        click_count: 12 + ((largeIndex * 17) % 190),
        is_active: largeIndex % 9 !== 0,
        expires_at:
          largeIndex % 23 === 0 ? BASE_TIMESTAMP + largeIndex * 3600000 : undefined,
      }),
    );
  }

  largeUrls.push(
    buildUrlRecord(900, {
      id: 'large-edge-long',
      short_code: 'longview',
      short_url: buildShortUrl('longview'),
      original_url: EDGE_LONG_URL,
      title: '超長網址壓力測試',
      description: '驗證極長原始網址在列表中的顯示方式',
      click_count: 188,
    }),
    buildUrlRecord(901, {
      id: 'large-edge-missing-title',
      short_code: 'notitle',
      short_url: buildShortUrl('notitle'),
      title: undefined,
      description: '故意缺少標題，測試預設文案與版面回退',
      click_count: 64,
    }),
    buildUrlRecord(902, {
      id: 'large-edge-expired',
      short_code: 'expired',
      short_url: buildShortUrl('expired'),
      title: '已過期的限時頁面',
      description: '測試過期狀態與提醒樣式',
      expires_at: BASE_TIMESTAMP - 172800000,
      click_count: 29,
    }),
    buildUrlRecord(903, {
      id: 'large-edge-archived',
      short_code: 'archived',
      short_url: buildShortUrl('archived'),
      title: '已封存的大型活動頁',
      description: '測試封存狀態與批次操作樣式',
      is_active: false,
      click_count: 11,
    }),
  );

  var edgeCaseUrls = [
    buildUrlRecord(1000, {
      id: 'edge-long-url',
      short_code: 'edge-long',
      short_url: buildShortUrl('edge-long'),
      original_url: EDGE_LONG_URL,
      title: '超長網址邊界測試',
      description: '檢查多行截斷與 tooltip 呈現',
      click_count: 41,
    }),
    buildUrlRecord(1001, {
      id: 'edge-missing-title',
      short_code: 'edge-null',
      short_url: buildShortUrl('edge-null'),
      title: undefined,
      description: '檢查缺少標題時的替代文案',
      click_count: 9,
    }),
    buildUrlRecord(1002, {
      id: 'edge-expired',
      short_code: 'edge-exp',
      short_url: buildShortUrl('edge-exp'),
      title: '已過期的短網址',
      description: '測試過期標籤與排序顯示',
      expires_at: BASE_TIMESTAMP - 259200000,
      click_count: 6,
    }),
    buildUrlRecord(1003, {
      id: 'edge-archived',
      short_code: 'edge-arc',
      short_url: buildShortUrl('edge-arc'),
      title: '封存中的短網址',
      description: '測試封存狀態的篩選與徽章',
      is_active: false,
      click_count: 3,
    }),
  ];

  var zeroUrls = [
    buildUrlRecord(1101, {
      id: 'zero-001',
      short_code: 'zero001',
      short_url: buildShortUrl('zero001'),
      title: '尚未曝光的募資頁',
      description: '尚未開始投放的測試連結',
      click_count: 0,
    }),
    buildUrlRecord(1102, {
      id: 'zero-002',
      short_code: 'zero002',
      short_url: buildShortUrl('zero002'),
      title: '靜待審核的宣傳頁',
      description: '等待核准前暫不對外曝光',
      click_count: 0,
    }),
    buildUrlRecord(1103, {
      id: 'zero-003',
      short_code: 'zero003',
      short_url: buildShortUrl('zero003'),
      title: '預備中的合作頁',
      description: '合作活動尚未上線，先建立資料骨架',
      click_count: 0,
      is_active: false,
    }),
  ];

  var scenarios = {
    default: defaultScenario,
    large250: makeScenario(
      'large250',
      largeUrls,
      {
        summary: '250 筆固定資料，提供長列表、批次操作與效能壓力測試。',
      },
      {},
    ),
    empty: makeScenario(
      'empty',
      [],
      {
        summary: '全新帳戶的空白狀態，方便設計空畫面與引導流程。',
      },
      { totalClicks: 0 },
    ),
    noResults: makeScenario(
      'noResults',
      defaultUrls.slice(0, 8).map(function (url, index) {
        return Object.assign({}, url, {
          id: 'no-results-' + index,
          short_code: 'nr' + String(index + 1).padStart(3, '0'),
          short_url: buildShortUrl('nr' + String(index + 1).padStart(3, '0')),
          title: '搜尋測試示範連結 ' + (index + 1),
          description: '建立搜尋零結果畫面的示範資料 ' + (index + 1),
        });
      }),
      {
        summary: '有資料但搜尋不到結果，方便設計空搜尋回饋。',
        searchQuery: '永遠不會命中的查詢詞',
      },
      {},
    ),
    edgeCases: makeScenario(
      'edgeCases',
      edgeCaseUrls,
      {
        summary: '集中收錄極端資料，方便驗證截斷、徽章與狀態呈現。',
      },
      {},
    ),
    zeroAnalytics: makeScenario(
      'zeroAnalytics',
      zeroUrls,
      {
        summary: '有連結但尚未累積點擊，方便設計零資料圖表狀態。',
      },
      { totalClicks: 0, emptySeries: true },
    ),
    apiError: makeScenario(
      'apiError',
      [],
      {
        summary: '模擬 API 失敗時的頁面骨架與錯誤提示。',
        error: '目前無法載入設計資料，請稍後再試。',
      },
      { totalClicks: 0, emptySeries: true },
    ),
  };

  function listScenarios() {
    return SCENARIO_NAMES.slice();
  }

  function getScenario(name) {
    if (!Object.prototype.hasOwnProperty.call(scenarios, name)) {
      throw new Error('找不到情境：' + name);
    }

    return deepClone(scenarios[name]);
  }

  return {
    getScenario: getScenario,
    listScenarios: listScenarios,
  };
});
