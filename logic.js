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

  // 担当になる新上級生を選ぶ。1年生も含めた全体の男女が均等になるよう、男女それぞれポイントの少ない順に取る
  function selectSeniors(candidates, total, rand, freshmen) {
    total = Math.min(Math.max(0, total), candidates.length);
    const sorted = candidates.slice().sort(byPriority(rand));
    const males = sorted.filter(isMale), females = sorted.filter((p) => !isMale(p));
    const fr = freshmen || [];
    const frM = fr.filter(isMale).length, frF = fr.length - frM;
    const out = [];
    let mi = 0, fi = 0;
    while (out.length < total) {
      const m = frM + mi, f = frF + fi;
      let takeMale;
      if (mi >= males.length) takeMale = false;
      else if (fi >= females.length) takeMale = true;
      else if (m !== f) takeMale = m < f;
      else takeMale = byPriority(rand)(males[mi], females[fi]) <= 0;
      out.push(takeMale ? males[mi++] : females[fi++]);
    }
    return out;
  }

  // 1グループの基本ルール違反の数（1年生込み）。3人以下: 男女差1以内、4人以上: 男女それぞれ2人以上
  function baseViolation(freshmen, seniors) {
    const all = freshmen.concat(seniors);
    const n = all.length, m = all.filter(isMale).length, f = n - m;
    if (n >= 4) return Math.max(0, 2 - m) + Math.max(0, 2 - f);
    return Math.max(0, Math.abs(m - f) - 1);
  }
  // 新上級生の男女差が3人以上の分
  function genderSkew(seniors) {
    const m = seniors.filter(isMale).length;
    return Math.max(0, Math.abs(m - (seniors.length - m)) - 2);
  }
  // 新上級生の3年・2年の差が2人以上の分
  function gradeSkew(seniors) {
    const t = seniors.filter(isThird).length;
    return Math.max(0, Math.abs(t - (seniors.length - t)) - 1);
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
  // 1) 3人以下のグループ: 1年生込みで男女 2:1 / 1:2（2人なら1:1）になるようランダムに選ぶ
  // 2) 4人以上のグループ: 1年生込みで男女それぞれ2人以上になるよう残りからランダムに入れる
  // 3) 新上級生の男女差が3人以上のグループは、グループ間で男女を入れ替えて差を2人以下に（できなければそのまま）
  // 4) 新上級生の3年・2年の差が2人以上のグループは、同性同士を入れ替えて差を1人以下に（できなければそのまま）
  // 5) 6人以上で3年が2人未満のグループは、選ばれなかった3年（reserves）のうちポイントが最も低い人と、
  //    グループ内で同性かつポイントが最も高い2年を交換する
  function distribute(groups, chosen, reserves) {
    const pool = { m: shuffle(chosen.filter(isMale)), f: shuffle(chosen.filter((p) => !isMale(p))) };
    const take = (male) => (male ? pool.m : pool.f).pop() || (male ? pool.f : pool.m).pop() || null;
    const slots = groups.map(() => []);
    const need = groups.map((g) => Math.max(0, g.need | 0));
    const size = (gi) => groups[gi].freshmen.length + need[gi];
    const counts = (gi) => {
      const all = groups[gi].freshmen.concat(slots[gi]);
      const m = all.filter(isMale).length;
      return { m, f: all.length - m };
    };
    const order = shuffle(groups.map((_, i) => i));
    const small = order.filter((gi) => size(gi) <= 3), large = order.filter((gi) => size(gi) >= 4);

    small.forEach((gi) => {
      while (slots[gi].length < need[gi]) {
        const c = counts(gi);
        const male = c.m === c.f ? (pool.m.length && pool.f.length ? Math.random() < 0.5 : pool.m.length > 0) : c.m < c.f;
        const p = take(male);
        if (!p) break;
        slots[gi].push(p);
      }
    });
    large.forEach((gi) => {
      while (slots[gi].length < need[gi]) {
        const c = counts(gi);
        const p = c.m < 2 && c.m <= c.f ? take(true) : c.f < 2 ? take(false) : null;
        if (!p) break;
        slots[gi].push(p);
      }
    });
    const rest = shuffle(pool.m.concat(pool.f));
    large.forEach((gi) => { while (slots[gi].length < need[gi] && rest.length) slots[gi].push(rest.pop()); });

    // 入れ替えで skew を減らす。基本ルールと、すでに整えた条件は悪化させない
    const base = () => slots.reduce((a, s, gi) => a + baseViolation(groups[gi].freshmen, s), 0);
    const sum = (fn) => slots.reduce((a, s) => a + fn(s), 0);
    function improve(fn, canSwap, keep) {
      let improved = true;
      while (improved) {
        improved = false;
        for (let a = 0; a < slots.length && !improved; a++) for (let b = 0; b < slots.length && !improved; b++) {
          if (a === b) continue;
          for (let i = 0; i < slots[a].length && !improved; i++) for (let j = 0; j < slots[b].length && !improved; j++) {
            const x = slots[a][i], y = slots[b][j];
            if (!canSwap(x, y)) continue;
            const before = [base(), keep ? sum(keep) : 0, sum(fn)];
            slots[a][i] = y; slots[b][j] = x;
            const after = [base(), keep ? sum(keep) : 0, sum(fn)];
            if (after[0] <= before[0] && after[1] <= before[1] && after[2] < before[2]) improved = true;
            else { slots[a][i] = x; slots[b][j] = y; }
          }
        }
      }
    }
    improve(genderSkew, (x, y) => isMale(x) !== isMale(y));
    improve(gradeSkew, (x, y) => isMale(x) === isMale(y) && isThird(x) !== isThird(y), genderSkew);

    const pts = (p) => Number(p.points) || 0;
    const spare = shuffle((reserves || []).filter(isThird)).sort((p, q) => pts(p) - pts(q));
    slots.forEach((s, gi) => {
      while (groups[gi].freshmen.length + s.length >= 6 && s.filter(isThird).length < 2) {
        let done = false;
        for (let k = 0; k < spare.length && !done; k++) {
          const third = spare[k];
          const seconds = shuffle(s.filter((p) => !isThird(p) && isMale(p) === isMale(third))).sort((p, q) => pts(q) - pts(p));
          if (!seconds.length) continue;
          s[s.indexOf(seconds[0])] = third;
          spare.splice(k, 1);
          done = true;
        }
        if (!done) break;
      }
    });

    return slots.map((s) => s.sort((p, q) => Number(q.grade) - Number(p.grade)).map((p) => p.id));
  }

  // 画面に出す注意。freshmen/seniors は人の配列
  function groupWarnings(freshmen, seniors, need) {
    const w = [];
    if (seniors.length < need) w.push("新上級生が" + (need - seniors.length) + "人足りません");
    if (seniors.length > need) w.push("新上級生が" + (seniors.length - need) + "人多いです");
    const all = freshmen.concat(seniors);
    const m = all.filter(isMale).length, f = all.length - m;
    if (all.length >= 4 && (m < 2 || f < 2)) w.push("4人以上なのに" + (m < 2 ? "男子" : "女子") + "が2人未満");
    else if (Math.abs(m - f) >= 3) w.push("男女の差が大きいです");
    if (genderSkew(seniors)) w.push("新上級生の男女差が3人以上です");
    if (gradeSkew(seniors)) w.push("新上級生の3年・2年の差が2人以上です");
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

  // ご飯会後のポイント反映（回数は今回の分を足してから計算）
  // 減少量 = (最大回数 − 自分の回数 + 1)×15 + 30×(1 − P/(P+50))　P は自分のポイント（0未満は0として扱う）
  // 行った人: ポイント = 100 + (自分の回数 − 最小回数 + 1)×50 − (最大回数 − 自分の回数)×50。最大回数の人でなければ、続けて減少量を引く
  // 行かなかった人: ポイント −= 減少量
  function decrease(points, count, maxCount) {
    const p = Math.max(0, points);
    return (maxCount - count + 1) * 15 + 30 * (1 - p / (p + 50));
  }
  function applyMeal(seniors, attendedIds) {
    const went = new Set(attendedIds);
    const next = {}, before = {};
    seniors.forEach((s) => {
      before[s.id] = { count: Number(s.count) || 0, points: Number(s.points) || 0 };
      next[s.id] = { count: before[s.id].count + (went.has(s.id) ? 1 : 0), points: before[s.id].points };
    });
    const cs = Object.values(next).map((v) => v.count);
    const maxCount = Math.max(0, ...cs), minCount = cs.length ? Math.min(...cs) : 0;
    Object.keys(next).forEach((id) => {
      const v = next[id];
      if (went.has(id)) {
        v.points = 100 + (v.count - minCount + 1) * 50 - (maxCount - v.count) * 50;
        if (v.count < maxCount) v.points -= decrease(v.points, v.count, maxCount);
      } else {
        v.points -= decrease(v.points, v.count, maxCount);
      }
      v.points = Math.round(v.points * 10) / 10;
    });
    return { next, before };
  }

  const api = { byPriority, selectSeniors, distribute, groupWarnings, splitFreshmen, randomSplit, applyMeal };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GohanLogic = api;
})(this);
