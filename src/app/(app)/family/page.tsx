import { redirect } from "next/navigation";
import { changePin, saveMember, saveSettings, setMemberActive } from "@/actions/family";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Avatar, Disclosure, PageHeader, Pill, Section } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { getDb } from "@/lib/db";
import type { User } from "@/lib/types";

const COLORS = ["sky", "violet", "emerald", "amber", "rose", "teal"] as const;
const EMOJI_SUGGESTIONS = ["🧒", "👦", "👧", "🧑‍🍼", "👨", "👩", "🦊", "🐼", "🚀", "⚽", "🎸", "🐙"];

function allMembers(): User[] {
  return getDb()
    .prepare("SELECT id, name, role, emoji, color, active FROM users ORDER BY active DESC, role DESC, name")
    .all() as User[];
}

export default async function FamilyPage() {
  const user = await requireUser();
  if (user.role !== "PARENT") redirect("/");

  const settings = getSettings();
  const members = allMembers();

  return (
    <>
      <PageHeader title="Family" subtitle="Profiles, PINs and how the app talks about money." />

      <Section title="Add someone">
        <Disclosure label="+ Add a family member" tone="primary">
          <MemberForm />
        </Disclosure>
      </Section>

      <Section title="Members" count={members.filter((member) => member.active === 1).length}>
        <ul className="grid gap-2">
          {members.map((member) => (
            <li key={member.id} className={`card ${member.active ? "" : "opacity-60"}`}>
              <div className="flex items-center gap-3">
                <Avatar emoji={member.emoji} color={member.color} size="lg" />
                <div className="min-w-0">
                  <div className="font-semibold">{member.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <Pill>{member.role === "PARENT" ? "Parent" : "Child"}</Pill>
                    {!member.active && <Pill tone="warn">archived</Pill>}
                  </div>
                </div>

                <form action={setMemberActive} className="ml-auto">
                  <input type="hidden" name="id" value={member.id} />
                  <input type="hidden" name="active" value={member.active ? "0" : "1"} />
                  {member.active ? (
                    <ConfirmSubmit
                      variant="quiet"
                      message={`Archive ${member.name}? Their history stays, but they can no longer sign in.`}
                    >
                      Archive
                    </ConfirmSubmit>
                  ) : (
                    <SubmitButton variant="quiet" size="sm">
                      Restore
                    </SubmitButton>
                  )}
                </form>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Disclosure label="Edit profile">
                  <MemberForm member={member} />
                </Disclosure>
                <Disclosure label={member.id === user.id ? "Change my PIN" : "Reset PIN"}>
                  <PinForm member={member} isSelf={member.id === user.id} />
                </Disclosure>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Settings">
        <ActionForm action={saveSettings} className="card grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="set-family">
                Family name
              </label>
              <input id="set-family" name="familyName" className="field" defaultValue={settings.familyName} />
            </div>
            <div>
              <label className="label" htmlFor="set-points">
                What to call points
              </label>
              <input id="set-points" name="pointsLabel" className="field" defaultValue={settings.pointsLabel} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="set-symbol">
                Currency symbol
              </label>
              <input id="set-symbol" name="currencySymbol" className="field" defaultValue={settings.currencySymbol} />
            </div>
            <div>
              <label className="label" htmlFor="set-position">
                Symbol goes
              </label>
              <select
                id="set-position"
                name="currencyPosition"
                className="field"
                defaultValue={settings.currencyPosition}
              >
                <option value="before">Before the amount</option>
                <option value="after">After the amount</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="set-tz">
                Timezone
              </label>
              <input id="set-tz" name="timezone" className="field" defaultValue={settings.timezone} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="set-gmin">
                Worst school mark
              </label>
              <input
                id="set-gmin"
                name="gradeMin"
                type="number"
                min={0}
                className="field"
                defaultValue={settings.gradeMin}
              />
            </div>
            <div>
              <label className="label" htmlFor="set-gmax">
                Best school mark
              </label>
              <input
                id="set-gmax"
                name="gradeMax"
                type="number"
                min={1}
                className="field"
                defaultValue={settings.gradeMax}
              />
            </div>
            <div>
              <label className="label" htmlFor="set-gdir">
                Which end is better
              </label>
              <select
                id="set-gdir"
                name="gradeDirection"
                className="field"
                defaultValue={settings.gradeBestIsHigh ? "true" : "false"}
              >
                <option value="true">Higher is better (1–5, 1–100)</option>
                <option value="false">Lower is better (German 1–6)</option>
              </select>
            </div>
          </div>

          <p className="text-xs text-ink-muted">
            The timezone decides when a day ends, so it controls when tasks count as missed and when pocket money is
            released. The grading scale is what a mark is measured against when no other total is given, and what
            subject averages are shown on.
          </p>

          <div>
            <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
          </div>
        </ActionForm>
      </Section>
    </>
  );
}

function MemberForm({ member }: { member?: User }) {
  const key = member?.id ?? "new";
  return (
    <ActionForm action={saveMember} className="card grid gap-3" resetOnSuccess={!member} onSuccessCollapse={!member}>
      {member && <input type="hidden" name="id" value={member.id} />}

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div>
          <label className="label" htmlFor={`mname-${key}`}>
            Name
          </label>
          <input id={`mname-${key}`} name="name" className="field" defaultValue={member?.name ?? ""} maxLength={40} />
        </div>
        <div>
          <label className="label" htmlFor={`mrole-${key}`}>
            Role
          </label>
          <select id={`mrole-${key}`} name="role" className="field" defaultValue={member?.role ?? "CHILD"}>
            <option value="CHILD">Child</option>
            <option value="PARENT">Parent</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`memoji-${key}`}>
            Emoji
          </label>
          <input
            id={`memoji-${key}`}
            name="emoji"
            className="field"
            defaultValue={member?.emoji ?? "🧒"}
            list={`emoji-list-${key}`}
            maxLength={8}
          />
          <datalist id={`emoji-list-${key}`}>
            {EMOJI_SUGGESTIONS.map((emoji) => (
              <option key={emoji} value={emoji} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor={`mcolor-${key}`}>
            Colour
          </label>
          <select id={`mcolor-${key}`} name="color" className="field" defaultValue={member?.color ?? "sky"}>
            {COLORS.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!member && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="mpin-new">
              Their PIN
            </label>
            <input
              id="mpin-new"
              name="pin"
              type="password"
              inputMode="numeric"
              className="field"
              placeholder="4–8 digits"
              maxLength={8}
            />
          </div>
          <div>
            <label className="label" htmlFor="mallowance-new">
              Weekly pocket money (optional)
            </label>
            <input id="mallowance-new" name="allowance" className="field" inputMode="decimal" placeholder="5.00" />
          </div>
        </div>
      )}

      <div>
        <SubmitButton pendingLabel="Saving…">{member ? "Save profile" : "Add member"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function PinForm({ member, isSelf }: { member: User; isSelf: boolean }) {
  return (
    <ActionForm action={changePin} className="card grid gap-3" resetOnSuccess>
      <input type="hidden" name="id" value={member.id} />

      {isSelf && (
        <div>
          <label className="label" htmlFor={`cur-${member.id}`}>
            Current PIN
          </label>
          <input
            id={`cur-${member.id}`}
            name="currentPin"
            type="password"
            inputMode="numeric"
            className="field"
            maxLength={8}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`new-${member.id}`}>
            New PIN
          </label>
          <input
            id={`new-${member.id}`}
            name="newPin"
            type="password"
            inputMode="numeric"
            className="field"
            maxLength={8}
          />
        </div>
        <div>
          <label className="label" htmlFor={`conf-${member.id}`}>
            Repeat
          </label>
          <input
            id={`conf-${member.id}`}
            name="confirmPin"
            type="password"
            inputMode="numeric"
            className="field"
            maxLength={8}
          />
        </div>
      </div>

      <div>
        <SubmitButton pendingLabel="Saving…">Update PIN</SubmitButton>
      </div>
    </ActionForm>
  );
}
