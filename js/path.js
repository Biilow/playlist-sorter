// Finds an order that visits every item with small steps between neighbours.
// This is the travelling salesman problem, so it aims for a very good answer
// rather than a perfect one: greedy paths from several starts, then untangling.

const GREEDY_STARTS = 12;
const LARGE_LIST = 2000; // above this, take one greedy path and skip untangling
const MAX_PASSES = 40;

function greedyPath(items, cost, start) {
  const remaining = items.slice();
  let current = remaining.splice(start, 1)[0];
  const path = [current];
  while (remaining.length) {
    let nearest = 0;
    let nearestCost = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const step = cost(current, remaining[i]);
      if (step < nearestCost) {
        nearestCost = step;
        nearest = i;
      }
    }
    current = remaining.splice(nearest, 1)[0];
    path.push(current);
  }
  return path;
}

const pathLength = (path, cost) => path.slice(1).reduce((sum, item, i) => sum + cost(path[i], item), 0);

// 2-opt: reverses any stretch of the path that makes the two joins around it cheaper.
function untangle(path, cost) {
  const last = path.length - 1;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < last; i++) {
      for (let j = i + 1; j <= last; j++) {
        const before = (i > 0 ? cost(path[i - 1], path[i]) : 0) + (j < last ? cost(path[j], path[j + 1]) : 0);
        const after = (i > 0 ? cost(path[i - 1], path[j]) : 0) + (j < last ? cost(path[i], path[j + 1]) : 0);
        if (after + 1e-9 < before) {
          for (let a = i, b = j; a < b; a++, b--) [path[a], path[b]] = [path[b], path[a]];
          improved = true;
        }
      }
    }
    if (!improved) return;
  }
}

// cost(a, b) must equal cost(b, a). The result depends only on the order of
// items, so callers pass them in a fixed order to get a repeatable answer.
export function shortestPath(items, cost) {
  if (items.length < 3) return items.slice();
  const large = items.length > LARGE_LIST;
  const starts = large ? 1 : Math.min(GREEDY_STARTS, items.length);
  let best = null;
  let bestLength = Infinity;
  for (let s = 0; s < starts; s++) {
    const path = greedyPath(items, cost, Math.floor((s * items.length) / starts));
    const length = pathLength(path, cost);
    if (length < bestLength) {
      best = path;
      bestLength = length;
    }
  }
  if (!large) untangle(best, cost);
  return best;
}
