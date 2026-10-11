/* 公開データ専用。所持記録や個人の読み取り結果は保存しない。 */
(() => {
  const key = "card-public-catalog-v1:" + window.APP_CONFIG.supabaseUrl;
  let cache = null;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (
      saved &&
      Number.isSafeInteger(saved.version) &&
      Array.isArray(saved.cards) &&
      Array.isArray(saved.overrides)
    )
      cache = saved;
  } catch (_) {
    /* 保存不可でも通常の通信で利用可能 */
  }
  let pending = null,
    lastResult = cache?.state && Number.isFinite(cache.checkedAt) ? { ...cache, state: cache.state } : null,
    checkedAt = cache?.checkedAt || 0;
  window.PUBLIC_CATALOG_CACHE = {
    peek: () => cache,
    load(db) {
      if (pending) return pending;
      if (lastResult && Date.now() >= checkedAt && Date.now() - checkedAt < 300000 && !lastResult.state?.running && !(lastResult.state?.cycle_started_at && !lastResult.state?.cycle_finished_at))
        return Promise.resolve(lastResult);
      pending = request(db).finally(() => {
        pending = null;
      });
      return pending;
    },
  };
  async function request(db) {
    const { data, error } = await db.rpc("card_album_catalog_cached", {
      p_version: cache?.version ?? null,
    });
    if (error) {
      if (["PGRST202", "42883"].includes(error.code)) return null;
      throw Error(
        "カード情報を確認できませんでした。時間をおいて再読み込みしてください。",
      );
    }
    if (!data || !Number.isSafeInteger(data.version))
      throw Error("カード取得設定を確認してください。");
    if (Array.isArray(data.cards) && Array.isArray(data.overrides)) {
      cache = {
        version: data.version,
        cards: data.cards,
        overrides: data.overrides,
      };

    }
    if (!cache || cache.version !== data.version)
      throw Error("カード情報を再読み込みしてください。");
    lastResult = { ...cache, state: data.state };
    checkedAt = Date.now();
    cache = { ...cache, state: data.state, checkedAt };
    try { localStorage.setItem(key, JSON.stringify(cache)); } catch (_) {}
    return lastResult;
  }
})();
