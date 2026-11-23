// Employee tasks → Duplicates (2026-11-23, the owner: "duplicate users kandupidakanum because naama real money employees
// kuduka porom ... yarula rendu dhadava same ha erukanga"): which applications may be one person twice, and which of
// them are still to decide (src/lib/trip-duplicates.ts).
//   node --import ./tests/helpers/server-modules.mjs --test "tests/trip-repeats/*.test.mjs"
import assert from "node:assert/strict";
import { test } from "node:test";
import { apartLabel, cityKey, duplicateGroups, nameKey, nameLetters, oneDigitApart, stillToCheck } from "@/lib/trip-duplicates";

let seq = 0;
/** A word of its own for each number (names are compared by their letters only, so "Person 1" and "Person 2" match). */
const word = (n) => [...n.toString(26)].map((c) => String.fromCharCode(97 + parseInt(c, 26))).join("");
/** An application: counted through employee e1's link unless told otherwise, `minute` minutes into 1 Nov. */
const app = (over = {}) => {
  seq++;
  return {
    id: `app${seq}`,
    referenceNo: `TRIP-26-${String(seq).padStart(5, "0")}`,
    fullName: `Person ${word(seq)}`,
    customerKey: String(9000000000 + seq * 7919),
    city: `City ${word(seq + 1000)}`,
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, over.minute ?? seq)),
    status: "new",
    referrerId: "e1",
    referralState: "counted",
    paid: false,
    referralDecidedAt: null,
    ...over,
  };
};
const ids = (groups) => groups.map((g) => g.ids);

test("a name is compared without case, accents, dots, spacing or the order of its words", () => {
  assert.equal(nameKey("A. Mohamed  Ali"), nameKey("ali mohamed a"));
  assert.equal(nameKey("MOHAMED ALI A"), nameKey("Ali, Mohamed (A)"));
  assert.equal(nameKey("Abdul Rahman"), nameKey("Abdulrahman"));
  assert.equal(nameKey("José"), nameKey("jose"));
  assert.notEqual(nameKey("Mohamed Ali"), nameKey("Mohamed Alim"));
  // Names in other scripts keep their letters, so they can match too.
  assert.ok(nameKey("முகமது அலி").length > 0);
  assert.equal(nameKey("முகமது அலி"), nameKey("அலி முகமது"));
  assert.equal(nameKey("  ...  "), "");
  assert.equal(cityKey(" Chennai "), cityKey("CHENNAI"));
  assert.equal(cityKey("Navi Mumbai"), cityKey("navi-mumbai"));
  assert.equal(cityKey(""), "");
});

test("names join on either: the words in any order, or the letters in order with the spaces aside", () => {
  assert.equal(nameLetters("Mohamed Abdul Rahman"), nameLetters("mohamed abdulrahman"));
  assert.notEqual(nameKey("Mohamed Abdul Rahman"), nameKey("Mohamed Abdulrahman"), "the words sorted miss this one");
  const a = app({ fullName: "Mohamed Abdul Rahman", city: "Vellore" });
  const b = app({ fullName: "Mohamed Abdulrahman", city: "vellore" });
  const c = app({ fullName: "Abdul Rahman Mohamed", city: "Vellore" });
  const [g] = duplicateGroups([a, b, c], []);
  assert.deepEqual(g.ids, [a.id, b.id, c.id], "b by its letters, c by its words, one group");
  assert.deepEqual(g.reasons, ["name"]);
  // Both changed at once, where sorting the words cannot help (another order and other spaces): not joined; the same
  // ID file still would.
  const d = app({ fullName: "Rahman Abdul Kader", city: "Ooty" });
  const e = app({ fullName: "Kader Abdulrahman", city: "Ooty" });
  assert.deepEqual(duplicateGroups([d, e], []), []);
  // Where sorting does help, it joins them.
  const f = app({ fullName: "Rahman Abdul Salam", city: "Hosur" });
  const g2 = app({ fullName: "Salam Abdulrahman", city: "Hosur" });
  assert.equal(duplicateGroups([f, g2], []).length, 1);
});

test("nobody alike: no group", () => {
  assert.deepEqual(duplicateGroups([app(), app(), app()], []), []);
});

test("the same mobile number joins two applications; an email key never does", () => {
  const a = app({ customerKey: "9876543210" });
  const b = app({ customerKey: "9876543210" });
  const c = app({ customerKey: "email:x@example.com" });
  const d = app({ customerKey: "email:x@example.com" });
  const groups = duplicateGroups([a, b, c, d], []);
  assert.deepEqual(ids(groups), [[a.id, b.id]]);
  assert.deepEqual(groups[0].reasons, ["number"]);
});

test("the same ID file joins two applications; one application's own two copies, or a file not compared, never do", () => {
  const a = app();
  const b = app();
  const c = app();
  const d = app();
  const files = [
    { applicationId: a.id, checksum: "123:abc" },
    { applicationId: b.id, checksum: "123:abc" },
    // c sent the same photo twice (front and back alike): still only c.
    { applicationId: c.id, checksum: "456:def" },
    { applicationId: c.id, checksum: "456:def" },
    // S3 did not answer for these: never guessed alike.
    { applicationId: c.id, checksum: null },
    { applicationId: d.id, checksum: null },
  ];
  const groups = duplicateGroups([a, b, c, d], files);
  assert.deepEqual(ids(groups), [[a.id, b.id]]);
  assert.deepEqual(groups[0].reasons, ["file"]);
});

test("the same name in the same city joins them; the same name elsewhere, or without a city, does not", () => {
  const a = app({ fullName: "Karthik Raja", city: "Chennai" });
  const b = app({ fullName: "RAJA KARTHIK", city: "chennai" });
  const c = app({ fullName: "Karthik Raja", city: "Madurai" });
  const d = app({ fullName: "Karthik Raja", city: "" });
  const e = app({ fullName: "Karthik Raja", city: "" });
  const groups = duplicateGroups([a, b, c, d, e], []);
  assert.deepEqual(ids(groups), [[a.id, b.id]]);
  assert.deepEqual(groups[0].reasons, ["name"]);
});

test("a chain is one group: a file shared with one, the name with another; reasons strongest first", () => {
  const a = app({ fullName: "Sara Banu", city: "Vellore" });
  const b = app({ fullName: "Sara Banu", city: "Vellore" });
  const c = app();
  const groups = duplicateGroups([c, b, a], [
    { applicationId: b.id, checksum: "9:z" },
    { applicationId: c.id, checksum: "9:z" },
  ]);
  assert.deepEqual(ids(groups), [[a.id, b.id, c.id]]);
  assert.deepEqual(groups[0].reasons, ["file", "name"]);
});

test("spam and deleted applications are in no group: they count for nothing", () => {
  const a = app({ customerKey: "9000000001" });
  const b = app({ customerKey: "9000000001", status: "spam" });
  const c = app({ customerKey: "9000000002" });
  const d = app({ customerKey: "9000000002", status: "deleted" });
  assert.deepEqual(duplicateGroups([a, b, c, d], []), []);
});

test("a group with no application through a link is left out: nobody is paid for it", () => {
  const a = app({ customerKey: "9000000003", referrerId: null, referralState: null });
  const b = app({ customerKey: "9000000003", referrerId: null, referralState: null });
  assert.deepEqual(duplicateGroups([a, b], []), []);
  // One through a link is enough.
  const c = app({ customerKey: "9000000004", referrerId: null, referralState: null });
  const d = app({ customerKey: "9000000004" });
  assert.deepEqual(ids(duplicateGroups([c, d], [])), [[c.id, d.id]]);
});

test("the oldest is the person's; a later one is to check only while it counts, unpaid and undecided, through a link", () => {
  const first = app({ customerKey: "9000000005", minute: 1 });
  const counted = app({ customerKey: "9000000005", minute: 2 });
  const waiting = app({ customerKey: "9000000005", minute: 3, referralState: "waiting" });
  const notCounted = app({ customerKey: "9000000005", minute: 4, referralState: "not_counted", referralDecidedAt: new Date() });
  const kept = app({ customerKey: "9000000005", minute: 5, referralDecidedAt: new Date() });
  const paid = app({ customerKey: "9000000005", minute: 6, paid: true });
  const direct = app({ customerKey: "9000000005", minute: 7, referrerId: null, referralState: null });
  const [g] = duplicateGroups([direct, paid, kept, notCounted, waiting, counted, first], []);
  assert.deepEqual(g.ids, [first.id, counted.id, waiting.id, notCounted.id, kept.id, paid.id, direct.id]);
  assert.deepEqual(g.toCheck, [counted.id, waiting.id]);
  assert.equal(stillToCheck(first), true, "the rule itself would take it; only its place as the first keeps it out");
});

test("an application sent without a link first makes the link's later one a repeat to check", () => {
  const own = app({ fullName: "Fathima", city: "Trichy", minute: 1, referrerId: null, referralState: null });
  const viaLink = app({ fullName: "Fathima", city: "Trichy", minute: 90 });
  const [g] = duplicateGroups([viaLink, own], []);
  assert.deepEqual(g.toCheck, [viaLink.id]);
});

test("two made in the same minute keep the order they were made in (Trip ID)", () => {
  const at = { minute: 30, customerKey: "9000000006" };
  const a = app(at);
  const b = app(at);
  const [g] = duplicateGroups([b, a], []);
  assert.deepEqual(g.ids, [a.id, b.id]);
  assert.deepEqual(g.toCheck, [b.id]);
});

test("what makes it likelier: one employee, minutes apart, numbers a digit apart", () => {
  const a = app({ fullName: "Imran Khan", city: "Salem", customerKey: "9840012345", minute: 100 });
  const b = app({ fullName: "Imran Khan", city: "Salem", customerKey: "9840012346", minute: 103 });
  const [g] = duplicateGroups([a, b], []);
  assert.equal(g.oneEmployee, true);
  assert.equal(g.closestMinutes, 3);
  assert.equal(g.numbersOneDigitApart, true);
  const c = app({ fullName: "Imran Khan", city: "Erode", customerKey: "9000000100", minute: 200, referrerId: "e1" });
  const d = app({ fullName: "Imran Khan", city: "Erode", customerKey: "9111111111", minute: 2000, referrerId: "e2" });
  const [h] = duplicateGroups([c, d], []);
  assert.equal(h.oneEmployee, false);
  assert.equal(h.numbersOneDigitApart, false);
  assert.equal(oneDigitApart("9840012345", "9840012345"), false);
  assert.equal(oneDigitApart("9840012345", "984001234"), false);
  assert.equal(oneDigitApart("9840012345", "9840012354"), false);
});

test("order: something to check first, then the surest (number, file, name), then the newest", () => {
  const settled = [app({ customerKey: "9000000200", minute: 1 }), app({ customerKey: "9000000200", minute: 2, referralState: "not_counted", referralDecidedAt: new Date() })];
  const byName = [app({ fullName: "Ravi", city: "Ooty", minute: 3 }), app({ fullName: "Ravi", city: "Ooty", minute: 4000 })];
  const byNameNewer = [app({ fullName: "Anu", city: "Ooty", minute: 5 }), app({ fullName: "Anu", city: "Ooty", minute: 5000 })];
  const byFile = [app({ minute: 6 }), app({ minute: 6000 })];
  const byNumber = [app({ customerKey: "9000000300", minute: 7 }), app({ customerKey: "9000000300", minute: 7000 })];
  const files = byFile.map((a) => ({ applicationId: a.id, checksum: "77:same" }));
  const groups = duplicateGroups([...settled, ...byName, ...byNameNewer, ...byFile, ...byNumber], files);
  assert.deepEqual(ids(groups), [
    byNumber.map((a) => a.id),
    byFile.map((a) => a.id),
    byNameNewer.map((a) => a.id),
    byName.map((a) => a.id),
    settled.map((a) => a.id),
  ]);
});

test("how far apart, in words, and nothing from a day on", () => {
  assert.equal(apartLabel(0), "less than a minute apart");
  assert.equal(apartLabel(1), "1 minute apart");
  assert.equal(apartLabel(45), "45 minutes apart");
  assert.equal(apartLabel(60), "1 hour apart");
  assert.equal(apartLabel(23 * 60 + 59), "23 hours apart");
  assert.equal(apartLabel(24 * 60), "");
});
