// One recompute at a time per key (src/lib/singleFlight.ts): callers that arrive while a run is under way share
// it, a failure reaches every one of them, and nothing is kept once it has settled.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inFlightCount, singleFlight } from "../../src/lib/singleFlight.ts";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

test("callers that arrive together share one run", async () => {
  let runs = 0;
  const gate = deferred();
  const work = () => {
    runs++;
    return gate.promise;
  };
  const all = Promise.all([singleFlight("k", work), singleFlight("k", work), singleFlight("k", work)]);
  assert.equal(runs, 1);
  assert.equal(inFlightCount(), 1);
  gate.resolve(42);
  assert.deepEqual(await all, [42, 42, 42]);
  assert.equal(inFlightCount(), 0);
});

test("different keys run apart", async () => {
  let runs = 0;
  const work = async () => ++runs;
  const [a, b] = await Promise.all([singleFlight("a", work), singleFlight("b", work)]);
  assert.equal(runs, 2);
  assert.notEqual(a, b);
});

test("nothing is kept: a call after the run has settled runs again", async () => {
  let runs = 0;
  const work = async () => ++runs;
  assert.equal(await singleFlight("again", work), 1);
  assert.equal(await singleFlight("again", work), 2);
});

test("a failure reaches every waiter, and the next call runs afresh", async () => {
  let runs = 0;
  const gate = deferred();
  const work = () => {
    runs++;
    return gate.promise;
  };
  const first = singleFlight("fails", work);
  const second = singleFlight("fails", work);
  gate.reject(new Error("database not ready"));
  await assert.rejects(first, /database not ready/);
  await assert.rejects(second, /database not ready/);
  assert.equal(inFlightCount(), 0);
  assert.equal(await singleFlight("fails", async () => "ok"), "ok");
  assert.equal(runs, 1);
});

test("a function that throws before it awaits is a rejection, not a throw at the call", async () => {
  const call = singleFlight("sync-throw", () => {
    throw new Error("boom");
  });
  await assert.rejects(call, /boom/);
  assert.equal(inFlightCount(), 0);
});
