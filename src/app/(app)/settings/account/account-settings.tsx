"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";

import {
  SettingsGroup,
  SettingRow,
  PreferenceChoice,
} from "@/components/settings/setting-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Micro } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { compressImage } from "@/lib/images";
import type { Preferences } from "@/lib/preferences";
import { updateProfileBasics } from "../preferences-actions";
import { removeAvatar, uploadAvatar } from "./account-actions";

/**
 * Timezones people plausibly use, rather than all ~600 IANA names.
 *
 * A searchable list of every zone is the "complete" answer and a worse one on a
 * phone. Alan's life is Winnipeg and India with travel in between; anything
 * missing here is a two-line addition when it's actually needed.
 */
const TIMEZONES = [
  { value: "America/Winnipeg", label: "Winnipeg (Central)" },
  { value: "America/Toronto", label: "Toronto (Eastern)" },
  { value: "America/Vancouver", label: "Vancouver (Pacific)" },
  { value: "America/Edmonton", label: "Edmonton (Mountain)" },
  { value: "America/St_Johns", label: "St John's (Newfoundland)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Dublin", label: "Dublin" },
  { value: "America/New_York", label: "New York" },
  { value: "America/Los_Angeles", label: "Los Angeles" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "UTC", label: "UTC" },
];

export function AccountSettings({
  initial,
  displayName,
  email,
  timezone,
  avatarUrl,
}: {
  initial: Preferences;
  displayName: string | null;
  email: string | null;
  timezone: string;
  avatarUrl: string | null;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [name, setName] = useState(displayName ?? "");
  const [tz, setTz] = useState(timezone);
  const [avatar, setAvatar] = useState(avatarUrl);
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveName() {
    if (name.trim() === (displayName ?? "")) return;
    setSavingName(true);
    const result = await updateProfileBasics({ displayName: name });
    setSavingName(false);
    if (result.error) {
      toast.error("Couldn't save that.");
      return;
    }
    toast.success("Name updated");
  }

  async function saveTimezone(next: string) {
    const previous = tz;
    setTz(next);
    const result = await updateProfileBasics({ timezone: next });
    if (result.error) {
      setTz(previous);
      toast.error("Couldn't save that.");
      return;
    }
    toast.success("Timezone updated");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      // 512px: an avatar is never shown bigger than about 40px, and shipping a
      // camera-sized photo to every crew feed card would be absurd.
      const compressed = await compressImage(file, 512);
      const formData = new FormData();
      formData.append("file", compressed);
      const result = await uploadAvatar(formData);
      if (result.error || !result.url) {
        toast.error(result.error ?? "Couldn't upload that.");
        return;
      }
      setAvatar(result.url);
      toast.success("Photo updated");
    } catch {
      toast.error("That photo didn't go through.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    const result = await removeAvatar();
    setUploading(false);
    if (result.error) {
      toast.error("Couldn't remove that.");
      return;
    }
    setAvatar(null);
    toast.success("Photo removed");
  }

  return (
    <>
      <SettingsGroup title="You">
        <div className="flex items-center gap-3 border-b border-hairline px-3 py-3">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-rule bg-muted">
            {avatar ? (
              // A plain <img>: it's a small public URL that changes rarely, and
              // next/image's optimiser would add a round trip for no gain.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="size-full object-cover" />
            ) : (
              <span className="font-heading text-lg font-extrabold">
                {(name || email || "?").slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Micro>Profile photo</Micro>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Camera className="size-3.5" />
                )}
                {avatar ? "Change" : "Add"}
              </Button>
              {avatar && (
                <Button type="button" size="sm" variant="ghost" disabled={uploading} onClick={handleRemove}>
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </div>

          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </div>

        <SettingRow
          label="Name"
          hint="What the app calls you, and what your crew sees."
          stacked
          control={
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              disabled={savingName}
              placeholder="Your name"
            />
          }
        />

        <SettingRow
          label="Email"
          hint="Changing this isn't supported yet — it's what you sign in with."
          last
          control={<span className="text-sm text-muted-foreground">{email ?? "—"}</span>}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Where and when"
        description="Your repeating reminders stay anchored to this timezone, not the one your phone happens to be in — so travelling doesn't drag everything by a few hours."
      >
        <SettingRow
          label="Timezone"
          stacked
          control={
            <Select value={tz} onChange={(e) => saveTimezone(e.target.value)}>
              {TIMEZONES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          }
        />
        <PreferenceChoice
          label="Weeks start on"
          hint="Used by streaks, the workout week strip and the Timeline."
          value={prefs.weekStart}
          options={[
            { value: "monday", label: "Monday" },
            { value: "sunday", label: "Sunday" },
          ]}
          onSaved={setPrefs}
          patch={(v) => ({ weekStart: v })}
          last
        />
      </SettingsGroup>
    </>
  );
}
