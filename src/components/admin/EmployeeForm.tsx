"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { checkPasswordStrength } from "@/lib/password-rules";
import { preparePhoto } from "@/lib/prepare-photo";

/** A staff account as the console lists it. */
export interface EmployeeRow {
  id: string;
  email: string;
  name: string;
  image: string | null;
  /** ADMIN | EMPLOYEE — their rank, not their session role. */
  role: string;
  region: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  assignedLeads?: number;
  statusUpdates?: number;
}

/**
 * Create or change a staff account.
 *
 * One form for both, because "add" and "edit" differ in three details — where
 * it posts, whether the password is optional, and whether a generated one can
 * be asked for — and two copies of six fields drift apart the first time a
 * column is added.
 *
 * The photo goes straight from the browser to S3 with a presigned POST, the
 * same path the video console uses; only the resulting CloudFront URL is sent
 * here.
 */
export function EmployeeForm({
  mode,
  initial,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: EmployeeRow;
  onSaved: (employee: EmployeeRow, password?: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [region, setRegion] = useState(initial?.region ?? "");
  const [rank, setRank] = useState(initial?.role ?? "EMPLOYEE");
  const [image, setImage] = useState<string | null>(initial?.image ?? null);
  const [generate, setGenerate] = useState(mode === "create");
  const [password, setPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadPhoto = async (chosen: File) => {
    setUploading(true);
    setError(null);
    try {
      // Scaled to 800px and re-encoded here, so a photo straight off a phone
      // camera — often over the 8MB upload limit — goes up as a few hundred KB.
      const file = await preparePhoto(chosen);
      const res = await fetch("/api/admin/employees/upload-url/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });
      const target = await res.json().catch(() => ({}));
      if (!res.ok || !target.success) throw new Error(target.error || "Could not start the upload.");

      const form = new FormData();
      Object.entries(target.uploadFields as Record<string, string>).forEach(([k, v]) => form.append(k, v));
      // Last, and after the policy fields: S3 ignores anything that follows it.
      form.append("file", file);
      const put = await fetch(target.uploadUrl, { method: "POST", body: form });
      if (!put.ok) throw new Error("The photo couldn't be uploaded. Check the connection and try again.");

      setImage(target.publicUrl as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const wantsPassword = mode === "create" ? !generate : password !== "";
    if (wantsPassword) {
      const strength = checkPasswordStrength(password);
      if (!strength.ok) {
        setError(strength.error);
        return;
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        email,
        region,
        image,
        role: rank,
        ...(wantsPassword ? { password } : {}),
      };
      const res = await fetch(
        mode === "create" ? "/api/admin/employees/" : `/api/admin/employees/${initial!.id}/`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save.");
        setSaving(false);
        return;
      }
      setPassword("");
      onSaved(data.employee as EmployeeRow, data.password as string | undefined);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full rounded-xl bg-[#f5f5f7] px-3.5 py-2.5 text-[13px] outline-none ring-1 ring-transparent transition-all focus:bg-white focus:ring-black/[0.08]";
  const label = "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#86868b]";

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-700">{error}</p>
      )}

      {/* Photo. Optional — the table falls back to initials, which is better
          than a placeholder silhouette of nobody. */}
      <div className="flex items-center gap-4">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-16 w-16 rounded-full bg-[#f5f5f7] object-cover ring-1 ring-black/10" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f5f5f7] text-lg font-bold text-[#86868b] ring-1 ring-black/10">
            {(name || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadPhoto(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] disabled:opacity-60"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            {uploading ? "Uploading…" : image ? "Replace photo" : "Upload photo"}
          </button>
          {image && (
            <button
              type="button"
              onClick={() => setImage(null)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold text-red-600 ring-1 ring-black/[0.06] transition-colors hover:bg-red-50"
            >
              <Trash2 size={14} />
              Remove
            </button>
          )}
          <span className="text-[11px] text-[#86868b]">Any photo — it is resized automatically.</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="emp-name">Name</label>
          <input id="emp-name" required value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Sara Karim" />
        </div>
        <div>
          <label className={label} htmlFor="emp-email">Email</label>
          <input id="emp-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} placeholder="sara@affhan.com" />
        </div>
        <div>
          <label className={label} htmlFor="emp-region">Region</label>
          <input id="emp-region" value={region} onChange={(e) => setRegion(e.target.value)} className={field} placeholder="Dubai" />
        </div>
        <div>
          <label className={label} htmlFor="emp-rank">Rank</label>
          <select id="emp-rank" value={rank} onChange={(e) => setRank(e.target.value)} className={field}>
            <option value="EMPLOYEE">Employee</option>
            <option value="ADMIN">Admin</option>
          </select>
          <p className="mt-1 text-[11px] text-[#86868b]">
            Rank is recorded on the staff account. It does not grant access to this console.
          </p>
        </div>
      </div>

      {/* Password. On create, one is generated unless the admin types one; on
          edit, a blank box leaves the existing password alone. */}
      <div className="rounded-xl bg-[#f5f5f7] p-3.5">
        {mode === "create" ? (
          <>
            <span className={label}>Password</span>
            <div className="flex flex-wrap gap-4 text-[13px]">
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={generate} onChange={() => setGenerate(true)} />
                Generate one for me
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" checked={!generate} onChange={() => setGenerate(false)} />
                Set it myself
              </label>
            </div>
            {!generate && (
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${field} mt-3 bg-white`}
                placeholder="At least 8 characters, letters with numbers or symbols"
                autoComplete="new-password"
              />
            )}
            {generate && (
              <p className="mt-2 text-[11px] text-[#86868b]">
                Shown once, on the screen after you save. It is stored hashed and cannot be read back.
              </p>
            )}
          </>
        ) : (
          <>
            <label className={label} htmlFor="emp-password">New password</label>
            <input
              id="emp-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${field} bg-white`}
              placeholder="Leave blank to keep the current password"
              autoComplete="new-password"
            />
            <p className="mt-2 text-[11px] text-[#86868b]">
              Setting a password signs this person out of every device they are signed in on.
            </p>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || uploading}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1d1d1f] px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          {mode === "create" ? "Create account" : "Save changes"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl bg-white px-4 py-2.5 text-[13px] font-semibold ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
