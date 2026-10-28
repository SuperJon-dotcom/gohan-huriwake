// ごはん担当ふりわけ: ポイント計算と自動振り分けのロジック（画面に依存しない純粋な関数）
(function (root) {
  "use strict";

  const isMale = (p) => p && p.gender === "男";
  const isThird = (p) => p && Number(p.grade) === 3;

  // ごはんポイントが少ない順。同点なら行った回数が少ない順、それでも同じならランダム
  function byPriority(rand) {
    return (a, b) =>
      (Number(a.points) || 0) - (Number(b.points) || 0) ||
      (Number(a.count) || 0) - (Number(b.count) || 0) ||
      ((rand && rand[a.id]) || 0) - ((rand && rand[b.id]) || 0);
  }

  // 担当になる新上級生を選ぶ（ポイントの少ない順に total 人）
  function selectSeniors(candidates, total, rand) {
    return candidates.slice().sort(byPriority(rand)).slice(0, Math.max(0, total));
  }

  // 1グループの評価。小さいほど良い。[男女の最低人数不足, 男女差, 3年不在]
  function groupCost(freshmen, seniors, need) {
    const all = freshmen.concat(seniors);
    const n = all.length;
    const m = all.filter(isMale).length;
    const f = n - m;
    const short = n >= 4 ? Math.max(0, 2 - m) + Math.max(0, 2 - f) : 0;
    const imbalance = Math.max(0, Math.abs(m - f) - (n % 2));
    const noThird = need > 0 && !seniors.some(isThird) ? 1 : 0;
    return [short, imbalance, noThird];
  }

  function totalCost(groups, slots) {
    const t = [0, 0, 0];
    groups.forEach((g, i) => {
      const c = groupCost(g.freshmen, slots[i].filter(Boolean), g.need);
      t[0] += c[0]; t[1] += c[1]; t[2] += c[2];
    });
    return t;
  }

  function less(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 選ばれた新上級生を各グループへ。groups: [{freshmen:[人], need:数}]
  // 優先度: 男女の均等（4人以上なら各2人以上） > 各グループに3年1人以上
  function distribute(groups, chosen, restarts) {
    const sizes = groups.map((g) => Math.max(0, g.need | 0));
    const totalSlots = sizes.reduce((a, b) => a + b, 0);
    let best = null, bestCost = null;
    const tries = chosen.length ? (restarts || 60) : 1;
    for (let r = 0; r < tries; r++) {
      const pool = shuffle(chosen);
      while (pool.length < totalSlots) pool.push(null);
      let k = 0;
      const slots = sizes.map((s) => pool.slice(k, (k += s)));
      let cost = totalCost(groups, slots);
      let improved = true;
      while (improved) {
        improved = false;
        for (let a = 0; a < slots.length; a++) for (let b = a + 1; b < slots.length; b++) {
          for (let i = 0; i < slots[a].length; i++) for (let j = 0; j < slots[b].length; j++) {
            const x = slots[a][i], y = slots[b][j];
            if (!x && !y) continue;
            if (x && y && isMale(x) === isMale(y) && isThird(x) === isThird(y)) continue;
            slots[a][i] = y; slots[b][j] = x;
            const c = totalCost(groups, slots);
            if (less(c, cost)) { cost = c; improved = true; }
            else { slots[a][i] = x; slots[b][j] = y; }
          }
        }
      }
      if (!best || less(cost, bestCost)) { best = slots.map((s) => s.slice()); bestCost = cost; }
      if (bestCost.every((v) => v === 0)) break;
    }
    return best.map((s) =>
      s.filter(Boolean).sort((p, q) => Number(q.grade) - Number(p.grade)).map((p) => p.id)
    );
  }

  // 画面に出す注意。freshmen/seniors は人の配列
  function groupWarnings(freshmen, seniors, need) {
    const w = [];
    if (seniors.length < need) w.push("新上級生が" + (need - seniors.length) + "人足りません");
    if (seniors.length > need) w.push("新上級生が" + (seniors.length - need) + "人多いです");
    const all = freshmen.concat(seniors);
    const m = all.filter(isMale).length, f = all.length - m;
    if (all.length >= 4 && (m < 2 || f < 2)) w.push("4人以上なのに" + (m < 2 ? "男子" : "女子") + "が2人未満");
    else if (Math.abs(m - f) > 1) w.push("男女の差が大きいです");
    if (need > 0 && !seniors.some(isThird)) w.push("3年生がいません");
    return { warnings: w, male: m, female: f };
  }

  // 1年生を男女が均等になるようにグループへ分ける。戻り値 {id: グループ番号}
  function splitFreshmen(freshmen, k) {
    const out = {};
    let i = 0;
    const ordered = shuffle(freshmen.filter(isMale)).concat(shuffle(freshmen.filter((p) => !isMale(p))));
    // 人数が少ないグループから順に入れる
    const counts = new Array(k).fill(0);
    ordered.forEach((p) => {
      let g = i % k;
      const min = Math.min.apply(null, counts);
      if (counts[g] > min) g = counts.indexOf(min);
      out[p.id] = g; counts[g]++; i = g + 1;
    });
    return out;
  }

  // 1年生をランダムにグループへ分ける（人数は均等）。戻り値 {id: グループ番号}
  function randomSplit(freshmen, k) {
    const out = {};
    const start = Math.floor(Math.random() * k);
    shuffle(freshmen).forEach((p, i) => { out[p.id] = (start + i) % k; });
    return out;
  }

  // ご飯会後のポイント反映
  // 行った人: 回数+1、ポイント = 100 + 回数×50
  // 行かなかった人: ポイント -= (全員の最大回数 − 自分の回数 + 1) × 15
  function applyMeal(seniors, attendedIds) {
    const went = new Set(attendedIds);
    const next = {}, before = {};
    seniors.forEach((s) => {
      before[s.id] = { count: Number(s.count) || 0, points: Number(s.points) || 0 };
      next[s.id] = { count: before[s.id].count + (went.has(s.id) ? 1 : 0), points: before[s.id].points };
    });
    const maxCount = Math.max(0, ...Object.values(next).map((v) => v.count));
    Object.keys(next).forEach((id) => {
      const v = next[id];
      v.points = went.has(id) ? 100 + v.count * 50 : v.points - (maxCount - v.count + 1) * 15;
    });
    return { next, before };
  }

  const api = { byPriority, selectSeniors, groupCost, distribute, groupWarnings, splitFreshmen, randomSplit, applyMeal };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GohanLogic = api;
})(this);
