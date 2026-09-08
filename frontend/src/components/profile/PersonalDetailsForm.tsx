import { useState, FormEvent } from "react";
import { ProfileAPI, UserProfile } from "../../services/profileApi";
import { PCard, PForm, PField, PBtn, PMsg } from "./ProfileUI";

export default function PersonalDetailsForm({ name, profile, onSaved }: { name: string; profile: UserProfile; onSaved: () => void }) {
  const [fullName, setFullName] = useState(name);
  const [dob,      setDob]      = useState(profile.dateOfBirth?.slice(0, 10) ?? "");
  const [gender,   setGender]   = useState(profile.gender ?? "");
  const [msg,      setMsg]      = useState<{ text: string; ok: boolean } | null>(null);
  const [saving,   setSaving]   = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setMsg(null);
    try {
      await ProfileAPI.updatePersonal({ name: fullName, dateOfBirth: dob || undefined, gender: gender || undefined });
      setMsg({ text: "Personal details saved.", ok: true }); onSaved();
    } catch (err: any) {
      setMsg({ text: err.response?.data?.error ?? "Could not save", ok: false });
    } finally { setSaving(false); }
  }

  return (
    <PCard title="Personal Details" icon="👤">
      <PForm onSubmit={submit}>
        <PField label="Full Name" required>
          <input className="p-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Your full legal name" />
        </PField>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <PField label="Date of Birth">
            <input className="p-input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </PField>
          <PField label="Gender">
            <select className="p-select" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">Prefer not to say</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </PField>
        </div>
        <PBtn loading={saving}>Save Personal Details</PBtn>
        {msg && <PMsg ok={msg.ok}>{msg.text}</PMsg>}
      </PForm>
    </PCard>
  );
}
