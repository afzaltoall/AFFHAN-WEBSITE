import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSalesJob, readWorkspaceAuth } from "@/lib/employee-session";
import {
  CARGO_LIMITS, CARGO_STATUS_META, CARGO_TYPES, cargoKey, cargoStatusOf, fmtDay, isCargoStatus, isCargoType, isoDay, officeToday, sameWords,
  type CargoStatus, type CargoTrack,
} from "@/lib/cargo-shared";

/**
 * Cargo tracking (the owner, 2026-10-24): the office's shipment sheet, kept by assigner accounts (Employee.job
 * ASSIGNER) in the staff workspace and read by admins under Shipping › Cargo tracking; and what a customer sees when
 * they type their consignment's number into Live track & trace on /shipping/.
 *
 * A consignment (CargoShipment) is a row of the sheet: its number, the customer, type, ports, ETD and ETA. Its
 * timeline (CargoEvent) is what the customer reads, one line per update: the date, what happened, and the stage it
 * stood at. The consignment's stage is always its newest update's, kept here and nowhere else. Every change is
 * written to CargoChange in the same transaction, with the person who made it, so an admin can see what was done.
 *
 * The public lookup (trackCargo) reads only the number, the stage and the timeline: never the customer, the type,
 * the ports, the dates on the sheet or who changed anything.
 */

export type CargoActor = { id: string | null; name: string; kind: "assigner" | "admin" };

/** Whoever may keep the sheet: an assigner, or an admin. A salesperson may not (their workspace is the pool). */
export async function readCargoActor(): Promise<{ ok: true; actor: CargoActor } | { ok: false; status: 401 | 403; error: string }> {
  const auth = await readWorkspaceAuth();
  if (!auth.ok) return { ok: false, status: 401, error: "Not signed in" };
  if (auth.kind === "admin") {
    return { ok: true, actor: { id: null, name: auth.session.name || auth.session.email || "Administrator", kind: "admin" } };
  }
  if (isSalesJob(auth.employee)) return { ok: false, status: 403, error: "Cargo tracking is kept by assigner accounts." };
  return { ok: true, actor: { id: auth.employee.id, name: auth.employee.name, kind: "assigner" } };
}

/** A refusal with the words to show: the routes answer it with its status. */
export class CargoError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface CargoRow {
  id: string;
  reference: string;
  customer: string;
  type: string | null;
  pol: string | null;
  pod: string | null;
  etd: string | null;
  eta: string | null;
  status: CargoStatus;
  createdAt: string;
  updatedAt: string;
  /** The newest update: the sheet's "loading date" column. */
  latest: { date: string; name: string } | null;
  updates: number;
}

export interface CargoEventRow {
  id: string;
  date: string;
  name: string;
  status: CargoStatus;
}

export interface CargoChangeRow {
  id: string;
  shipmentId: string | null;
  reference: string;
  action: string;
  summary: string;
  byName: string;
  /** Made by an administrator rather than an assigner. */
  byAdmin: boolean;
  createdAt: string;
}

export interface CargoDetail extends CargoRow {
  events: CargoEventRow[];
  changes: CargoChangeRow[];
}

// A row's stage as today's six name it, the first three codes included (cargo-shared's cargoStatusOf).
const statusOf = (s: string): CargoStatus => cargoStatusOf(s);
const labelOf = (s: string) => CARGO_STATUS_META[statusOf(s)].label;
const dayOrNull = (d: Date | null) => (d ? isoDay(d) : null);
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

const ROW_SELECT = {
  id: true, reference: true, customer: true, type: true, pol: true, pod: true, etd: true, eta: true, status: true,
  createdAt: true, updatedAt: true,
  events: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 1, select: { date: true, name: true } },
  _count: { select: { events: true } },
} satisfies Prisma.CargoShipmentSelect;

type RowShape = Prisma.CargoShipmentGetPayload<{ select: typeof ROW_SELECT }>;

function toRow(r: RowShape): CargoRow {
  const latest = r.events[0];
  return {
    id: r.id, reference: r.reference, customer: r.customer, type: r.type, pol: r.pol, pod: r.pod,
    etd: dayOrNull(r.etd), eta: dayOrNull(r.eta), status: statusOf(r.status),
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
    latest: latest ? { date: isoDay(latest.date), name: latest.name } : null,
    updates: r._count.events,
  };
}

const toChange = (c: { id: string; shipmentId: string | null; reference: string; action: string; summary: string; byId: string | null; byName: string; createdAt: Date }): CargoChangeRow => ({
  id: c.id, shipmentId: c.shipmentId, reference: c.reference, action: c.action, summary: c.summary, byName: c.byName,
  byAdmin: c.byId === null, createdAt: c.createdAt.toISOString(),
});

// ---- reading the input --------------------------------------------------------------------------------------------------

/** A text field: undefined when it was not sent, null when emptied, else trimmed and checked for length. */
function text(raw: unknown, max: number, what: string): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") throw new CargoError(400, `${what} must be text.`);
  const v = raw.replace(/\s+/g, " ").trim();
  if (v.length > max) throw new CargoError(400, `Keep ${what.toLowerCase()} under ${max} characters.`);
  return v || null;
}

/** A day: undefined when not sent, null when emptied, else yyyy-mm-dd between 2000 and 2100. */
function day(raw: unknown, what: string): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new CargoError(400, `${what} must be a date.`);
  const d = asDate(raw);
  if (!Number.isFinite(d.getTime()) || isoDay(d) !== raw || d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) {
    throw new CargoError(400, `${what} is not a real date.`);
  }
  return raw;
}

/**
 * An update's day: what has happened, so never after today in the office's calendar. A later one (an update dated
 * 2 Nov typed on 24 Oct, 2026-10-24) stayed the newest whatever was posted after it, and held the stage there.
 * ETD and ETA are the dates still to come.
 */
function updateDay(raw: unknown, what: string): string | null | undefined {
  const v = day(raw, what);
  if (v && v > officeToday()) {
    throw new CargoError(400, `${what} can't be after today: an update is something that has happened. Put dates still to come in ETD or ETA.`);
  }
  return v;
}

function reference(raw: unknown): { reference: string; referenceKey: string } {
  const v = text(raw, CARGO_LIMITS.reference, "The number");
  const key = v ? cargoKey(v) : "";
  if (!v || key.length < 3) throw new CargoError(400, "Enter the console, FCL or LCL number.");
  return { reference: v.toUpperCase(), referenceKey: key };
}

/** A stage for a new or corrected update: one of today's six only (rows written before keep theirs until corrected). */
function stage(raw: unknown): CargoStatus {
  if (!isCargoStatus(raw)) {
    throw new CargoError(400, "Choose the status: Cargo loaded, Vessel loading, Vessel sailing, Vessel discharged, In customs clearance or In warehouse.");
  }
  return raw;
}

/**
 * The type: one of the sheet's list (20GP, 40GP, 40HQ, AIR, LCL), or none. A consignment written before the list
 * (2026-10-26; "EXWS" on the live sheet) keeps its own type through other corrections, until it is changed.
 */
function cargoType(raw: unknown, kept: string | null = null): string | null | undefined {
  const v = text(raw, CARGO_LIMITS.type, "The type");
  if (v === undefined || v === null) return v;
  if (kept !== null && v === kept) return v;
  const listed = v.toUpperCase();
  if (isCargoType(listed)) return listed;
  throw new CargoError(400, `Choose the type: ${CARGO_TYPES.join(", ")}.`);
}

const fmtOr = (d: string | null) => (d ? fmtDay(d) : "none");
const quote = (s: string) => `“${s}”`;

// ---- the sheet ------------------------------------------------------------------------------------------------------

/** Every consignment, newest first, with its newest update. */
export async function listCargo(): Promise<CargoRow[]> {
  const rows = await prisma.cargoShipment.findMany({ orderBy: { createdAt: "desc" }, take: 2000, select: ROW_SELECT });
  return rows.map(toRow);
}

/** One consignment, its timeline in order, and what has been changed on it. */
export async function getCargo(id: string): Promise<CargoDetail | null> {
  const r = await prisma.cargoShipment.findUnique({
    where: { id },
    select: {
      ...ROW_SELECT,
      changes: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!r) return null;
  const events = await prisma.cargoEvent.findMany({
    where: { shipmentId: id },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: { id: true, date: true, name: true, status: true },
  });
  return {
    ...toRow(r),
    events: events.map((e) => ({ id: e.id, date: isoDay(e.date), name: e.name, status: statusOf(e.status) })),
    changes: r.changes.map(toChange),
  };
}

/** A transaction's client, as lib/lead-pool.ts types it: the project's client is an extended one. */
type Tx = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/** The consignment's stage is its newest update's: called after every change to the timeline. */
async function settleStatus(tx: Tx, shipmentId: string) {
  const newest = await tx.cargoEvent.findFirst({
    where: { shipmentId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { status: true },
  });
  if (newest) await tx.cargoShipment.update({ where: { id: shipmentId }, data: { status: newest.status } });
}

async function log(tx: Tx, actor: CargoActor, shipment: { id: string | null; reference: string }, action: string, summary: string) {
  await tx.cargoChange.create({
    data: { shipmentId: shipment.id, reference: shipment.reference, action, summary, byId: actor.id, byName: actor.name },
  });
}

/** A new consignment, with its first update (what the customer will see first). */
export async function createCargo(body: Record<string, unknown>, actor: CargoActor): Promise<CargoDetail> {
  const ref = reference(body.reference);
  const customer = text(body.customer, CARGO_LIMITS.customer, "The customer");
  if (!customer) throw new CargoError(400, "Enter who the cargo is for.");
  const type = cargoType(body.type) ?? null;
  const pol = text(body.pol, CARGO_LIMITS.port, "The port of loading") ?? null;
  const pod = text(body.pod, CARGO_LIMITS.port, "The port of discharge") ?? null;
  const etd = day(body.etd, "ETD") ?? null;
  const eta = day(body.eta, "ETA") ?? null;
  const status = stage(body.status);
  const eventName = text(body.event, CARGO_LIMITS.event, "The update") || CARGO_STATUS_META[status].event;
  const eventDay = updateDay(body.date, "The update's date") || officeToday();

  try {
    const id = await prisma.$transaction(async (tx) => {
      const created = await tx.cargoShipment.create({
        data: {
          ...ref, customer, type, pol, pod, status, createdById: actor.id,
          etd: etd ? asDate(etd) : null, eta: eta ? asDate(eta) : null,
          events: { create: { date: asDate(eventDay), name: eventName, status, createdById: actor.id } },
        },
        select: { id: true, reference: true },
      });
      const route = pol || pod ? ` · ${pol ?? "?"} → ${pod ?? "?"}` : "";
      await log(tx, actor, created, "CREATED", `Created for ${customer}${type ? ` · ${type}` : ""}${route}, first update ${fmtDay(eventDay)} ${quote(eventName)} (${labelOf(status)})`);
      return created.id;
    });
    return (await getCargo(id))!;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CargoError(409, `${ref.reference} is already on the sheet.`);
    }
    throw error;
  }
}

/** The sheet's own fields: number, customer, type, ports, ETD and ETA. The stage moves only with an update. */
export async function updateCargo(id: string, body: Record<string, unknown>, actor: CargoActor): Promise<CargoDetail> {
  const was = await prisma.cargoShipment.findUnique({ where: { id } });
  if (!was) throw new CargoError(404, "That consignment is no longer on the sheet.");

  const data: Prisma.CargoShipmentUpdateInput = {};
  const said: string[] = [];
  if (body.reference !== undefined) {
    const ref = reference(body.reference);
    if (ref.reference !== was.reference) {
      Object.assign(data, ref);
      said.push(`Number ${was.reference} → ${ref.reference}`);
    }
  }
  const fields: [keyof typeof body & ("customer" | "type" | "pol" | "pod"), string, number][] = [
    ["customer", "Customer", CARGO_LIMITS.customer],
    ["type", "Type", CARGO_LIMITS.type],
    ["pol", "POL", CARGO_LIMITS.port],
    ["pod", "POD", CARGO_LIMITS.port],
  ];
  for (const [key, label, max] of fields) {
    const v = key === "type" ? cargoType(body.type, was.type) : text(body[key], max, label);
    if (v === undefined) continue;
    if (key === "customer" && !v) throw new CargoError(400, "Enter who the cargo is for.");
    if ((v ?? null) !== (was[key] ?? null)) {
      (data as Record<string, unknown>)[key] = v;
      said.push(`${label} ${was[key] ?? "none"} → ${v ?? "none"}`);
    }
  }
  for (const [key, label] of [["etd", "ETD"], ["eta", "ETA"]] as const) {
    const v = day(body[key], label);
    if (v === undefined) continue;
    const before = dayOrNull(was[key]);
    if (v !== before) {
      data[key] = v ? asDate(v) : null;
      said.push(`${label} ${fmtOr(before)} → ${fmtOr(v)}`);
    }
  }
  if (said.length === 0) return (await getCargo(id))!;

  try {
    await prisma.$transaction(async (tx) => {
      const now = await tx.cargoShipment.update({ where: { id }, data, select: { id: true, reference: true } });
      await log(tx, actor, now, "UPDATED", said.join("; "));
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new CargoError(409, "Another consignment already has that number.");
    }
    throw error;
  }
  return (await getCargo(id))!;
}

/** Off the sheet for good, its timeline with it. The change log keeps the number and what was done. */
export async function deleteCargo(id: string, actor: CargoActor): Promise<void> {
  const was = await prisma.cargoShipment.findUnique({ where: { id }, select: { id: true, reference: true, customer: true, status: true } });
  if (!was) throw new CargoError(404, "That consignment is no longer on the sheet.");
  await prisma.$transaction(async (tx) => {
    await log(tx, actor, was, "DELETED", `Deleted (${was.customer}, last ${labelOf(was.status)})`);
    await tx.cargoShipment.delete({ where: { id } });
  });
}

// ---- the timeline -------------------------------------------------------------------------------------------------------

/**
 * A new update: the customer sees it at once, and the consignment's stage follows the newest. An update dated before
 * the newest one fills in the past and leaves the stage where it is. The sheet's status dropdown sends `current`:
 * its update must become the newest, or nothing is written and the answer names the update in the way.
 */
export async function addCargoEvent(id: string, body: Record<string, unknown>, actor: CargoActor): Promise<CargoDetail> {
  const was = await prisma.cargoShipment.findUnique({ where: { id }, select: { id: true, reference: true } });
  if (!was) throw new CargoError(404, "That consignment is no longer on the sheet.");
  const status = stage(body.status);
  const name = text(body.name, CARGO_LIMITS.event, "The update") || CARGO_STATUS_META[status].event;
  const date = updateDay(body.date, "The date") || officeToday();
  // The same update twice (a second press, a second person) is not posted again: the customer saw four
  // "In customs clearance" on one day on the live sheet (2026-10-26).
  const twins = await prisma.cargoEvent.findMany({ where: { shipmentId: id, date: asDate(date), status }, select: { name: true } });
  if (twins.some((t) => sameWords(t.name, name))) {
    throw new CargoError(409, `That update is already on the timeline: ${quote(name)}, ${fmtDay(date)}.`);
  }
  await prisma.$transaction(async (tx) => {
    const made = await tx.cargoEvent.create({ data: { shipmentId: id, date: asDate(date), name, status, createdById: actor.id }, select: { id: true } });
    if (body.current === true) {
      const newest = await tx.cargoEvent.findFirst({
        where: { shipmentId: id },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        select: { id: true, date: true, name: true },
      });
      if (newest && newest.id !== made.id) {
        throw new CargoError(409, `${was.reference} has a later update, dated ${fmtDay(isoDay(newest.date))} (${quote(newest.name)}). Open it and correct that date first.`);
      }
    }
    await settleStatus(tx, id);
    await tx.cargoShipment.update({ where: { id }, data: { updatedAt: new Date() } });
    await log(tx, actor, was, "EVENT_ADDED", `Update ${fmtDay(date)}: ${quote(name)} · ${labelOf(status)}`);
  });
  return (await getCargo(id))!;
}

/** A correction to an update: its date, its words or its stage. */
export async function editCargoEvent(id: string, eventId: string, body: Record<string, unknown>, actor: CargoActor): Promise<CargoDetail> {
  const ev = await prisma.cargoEvent.findFirst({ where: { id: eventId, shipmentId: id }, include: { shipment: { select: { id: true, reference: true } } } });
  if (!ev) throw new CargoError(404, "That update is no longer on the timeline.");
  const data: Prisma.CargoEventUpdateInput = {};
  const said: string[] = [];
  const date = updateDay(body.date, "The date");
  if (date && date !== isoDay(ev.date)) {
    data.date = asDate(date);
    said.push(`date ${fmtDay(isoDay(ev.date))} → ${fmtDay(date)}`);
  }
  if (body.name !== undefined) {
    const name = text(body.name, CARGO_LIMITS.event, "The update");
    if (!name) throw new CargoError(400, "Say what happened.");
    if (name !== ev.name) {
      data.name = name;
      said.push(`${quote(ev.name)} → ${quote(name)}`);
    }
  }
  if (body.status !== undefined) {
    const status = stage(body.status);
    if (status !== ev.status) {
      data.status = status;
      said.push(`${labelOf(ev.status)} → ${labelOf(status)}`);
    }
  }
  if (said.length === 0) return (await getCargo(id))!;
  await prisma.$transaction(async (tx) => {
    await tx.cargoEvent.update({ where: { id: eventId }, data });
    await settleStatus(tx, id);
    await tx.cargoShipment.update({ where: { id }, data: { updatedAt: new Date() } });
    await log(tx, actor, ev.shipment, "EVENT_EDITED", `Update of ${fmtDay(isoDay(ev.date))} corrected: ${said.join("; ")}`);
  });
  return (await getCargo(id))!;
}

/** An update taken off the timeline. The first one stays: a consignment always says where it is. */
export async function deleteCargoEvent(id: string, eventId: string, actor: CargoActor): Promise<CargoDetail> {
  const ev = await prisma.cargoEvent.findFirst({ where: { id: eventId, shipmentId: id }, include: { shipment: { select: { id: true, reference: true } } } });
  if (!ev) throw new CargoError(404, "That update is no longer on the timeline.");
  const count = await prisma.cargoEvent.count({ where: { shipmentId: id } });
  if (count <= 1) throw new CargoError(409, "A consignment keeps at least one update. Correct this one instead.");
  await prisma.$transaction(async (tx) => {
    await tx.cargoEvent.delete({ where: { id: eventId } });
    await settleStatus(tx, id);
    await tx.cargoShipment.update({ where: { id }, data: { updatedAt: new Date() } });
    await log(tx, actor, ev.shipment, "EVENT_DELETED", `Update of ${fmtDay(isoDay(ev.date))} removed: ${quote(ev.name)} · ${labelOf(ev.status)}`);
  });
  return (await getCargo(id))!;
}

// ---- the admin's view of what was done ----------------------------------------------------------------------------------

/** The change log, newest first, optionally one person's. */
export async function listCargoChanges(opts: { take?: number; byName?: string } = {}): Promise<{ changes: CargoChangeRow[]; people: string[] }> {
  const [rows, people] = await Promise.all([
    prisma.cargoChange.findMany({
      where: opts.byName ? { byName: opts.byName } : {},
      orderBy: { createdAt: "desc" },
      take: Math.min(500, Math.max(1, opts.take ?? 200)),
    }),
    prisma.cargoChange.findMany({ distinct: ["byName"], select: { byName: true }, orderBy: { byName: "asc" } }),
  ]);
  return { changes: rows.map(toChange), people: people.map((p) => p.byName) };
}

// ---- the public lookup ----------------------------------------------------------------------------------------------------

/**
 * What Live track & trace shows for a number: the number, the stage and the timeline, nothing else. Null when there
 * is no such consignment, which is all an unknown number is ever told.
 */
export async function trackCargo(input: string): Promise<CargoTrack | null> {
  const key = cargoKey(input);
  if (key.length < 3 || key.length > CARGO_LIMITS.reference) return null;
  const r = await prisma.cargoShipment.findUnique({
    where: { referenceKey: key },
    select: {
      reference: true,
      status: true,
      etd: true,
      eta: true,
      events: { orderBy: [{ date: "asc" }, { createdAt: "asc" }], select: { date: true, name: true, status: true } },
    },
  });
  if (!r) return null;
  // Each change once (the owner, 2026-10-26: "repetative words ... once with change dha katanum per change"): an
  // update that says again exactly what the one before it said is left out of the customer's timeline. The staff
  // still see every row, to take the repeats off.
  const events: CargoTrack["events"] = [];
  for (const e of r.events) {
    const row = { date: isoDay(e.date), name: e.name, status: statusOf(e.status) };
    const before = events[events.length - 1];
    if (before && before.status === row.status && sameWords(before.name, row.name)) continue;
    events.push(row);
  }
  return {
    reference: r.reference,
    status: statusOf(r.status),
    etd: dayOrNull(r.etd),
    eta: dayOrNull(r.eta),
    events,
  };
}
