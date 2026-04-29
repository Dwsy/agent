// 糖果问题暴力验证
// 6种糖果: RA(圆苹果)=7, SA(星苹果)=7, RP(圆桃)=9, SP(星桃)=6, RW(圆瓜)=8, SW(星瓜)=4
// 条件: (RA≥1 ∧ SP≥1) ∨ (SA≥1 ∧ RP≥1)

const MAX = { RA: 7, SA: 7, RP: 9, SP: 6, RW: 8, SW: 4 };
const TOTAL = 41;

// ==========================================
// 解法1: 纯随机抽取（不能选择形状）
// 找最大的N使得存在一种取法条件不满足
// ==========================================
function solve_random() {
  let maxFail = 0;
  let bestConfig: any = null;
  const allMaxFails: any[] = [];

  for (let ra = 0; ra <= MAX.RA; ra++)
    for (let sa = 0; sa <= MAX.SA; sa++)
      for (let rp = 0; rp <= MAX.RP; rp++)
        for (let sp = 0; sp <= MAX.SP; sp++)
          for (let rw = 0; rw <= MAX.RW; rw++)
            for (let sw = 0; sw <= MAX.SW; sw++) {
              const condA = ra >= 1 && sp >= 1;
              const condB = sa >= 1 && rp >= 1;
              if (!condA && !condB) {
                const total = ra + sa + rp + sp + rw + sw;
                if (total > maxFail) {
                  maxFail = total;
                  bestConfig = { ra, sa, rp, sp, rw, sw };
                  allMaxFails.length = 0;
                  allMaxFails.push({ ...bestConfig });
                } else if (total === maxFail) {
                  allMaxFails.push({ ra, sa, rp, sp, rw, sw });
                }
              }
            }

  console.log("=== 解法1: 纯随机抽取（不利用手感） ===");
  console.log(`最大失败数: ${maxFail}`);
  console.log(`最差配置数量: ${allMaxFails.length}`);
  allMaxFails.forEach((c, i) => console.log(`  配置${i + 1}:`, c));
  console.log(`答案: ${maxFail + 1}`);
  return maxFail + 1;
}

// ==========================================
// 解法2: 可以通过手感选择形状（博弈论/策略）
// 参赛者决定取r个圆形+s个星形，对手选最差的flavor分配
// ==========================================
function canAdversaryFail(r: number, s: number): { fail: boolean; config?: any } {
  for (let ra = 0; ra <= Math.min(r, MAX.RA); ra++)
    for (let rp = 0; rp <= Math.min(r - ra, MAX.RP); rp++) {
      const rw = r - ra - rp;
      if (rw < 0 || rw > MAX.RW) continue;
      for (let sa = 0; sa <= Math.min(s, MAX.SA); sa++)
        for (let sp = 0; sp <= Math.min(s - sa, MAX.SP); sp++) {
          const sw = s - sa - sp;
          if (sw < 0 || sw > MAX.SW) continue;
          const condA = ra >= 1 && sp >= 1;
          const condB = sa >= 1 && rp >= 1;
          if (!condA && !condB) {
            return { fail: true, config: { ra, sa, rp, sp, rw, sw } };
          }
        }
    }
  return { fail: false };
}

function solve_strategic() {
  console.log("\n=== 解法2: 利用手感选择形状（策略优化） ===");
  for (let N = 1; N <= TOTAL; N++) {
    let canGuarantee = false;
    let bestStrategy: any = null;
    for (let r = 0; r <= Math.min(N, 24); r++) {
      const s = N - r;
      if (s < 0 || s > 17) continue;
      const result = canAdversaryFail(r, s);
      if (!result.fail) {
        canGuarantee = true;
        bestStrategy = { r, s };
        break;
      }
    }
    if (canGuarantee) {
      console.log(`最小N=${N}: 策略 = 取${bestStrategy.r}个圆形 + ${bestStrategy.s}个星形`);
      console.log(`答案: ${N}`);
      // 验证N-1不行
      console.log(`\n验证 N-1=${N - 1} 无解:`);
      let any_ok = false;
      for (let r = 0; r <= Math.min(N - 1, 24); r++) {
        const s = N - 1 - r;
        if (s < 0 || s > 17) continue;
        const result = canAdversaryFail(r, s);
        if (!result.fail) {
          console.log(`  r=${r}, s=${s}: 可保证!（不应出现）`);
          any_ok = true;
        }
      }
      if (!any_ok) console.log(`  确认 N-1=${N - 1} 所有策略都可被对手破解 ✓`);
      return N;
    }
  }
  return -1;
}

const ans1 = solve_random();
const ans2 = solve_strategic();

console.log("\n=== 总结 ===");
console.log(`不利用手感（纯最不利原则）答案: ${ans1}`);
console.log(`利用手感选择形状（策略）答案: ${ans2}`);
