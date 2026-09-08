import { useState, FormEvent } from "react";
import { ProfileAPI, UserProfile } from "../../services/profileApi";
import { PCard, PForm, PField, PBtn, PMsg } from "./ProfileUI";

export default function AddressDetailsForm({ profile, onSaved }: { profile: UserProfile; onSaved: () => void }) {
  const [line1,   setLine1]   = useState(profile.addressLine1 ?? "");
  const [line2,   setLine2]   = useState(profile.addressLine2 ?? "");
  const [city,    setCity]    = useState(profile.city ?? "");
  const [state,   setState]   = useState(profile.state ?? "");
  const [pincode, setPincode] = useState(profile.pincode ?? "");
  const [country, setCountry] = useState(profile.country ?? "India");
  const [msg,     setMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const [saving,  setSaving]  = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setMsg(null);
    try {
      await ProfileAPI.updateAddress({ addressLine1: line1, addressLine2: line2, city, state, pincode, country });
      setMsg({ text: "Address saved.", ok: true }); onSaved();
    } catch (err: any) {
      setMsg({ text: err.response?.data?.error ?? "Could not save address", ok: false });
    } finally { setSaving(false); }
  }

  return (
    <PCard title="Address Details" icon="📍" subtitle="Your registered residential address">
      <PForm onSubmit={submit}>
        <PField label="Address Line 1">
          <input className="p-input" value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="House / Flat no., Street" />
        </PField>
        <PField label="Address Line 2">
          <input className="p-input" value={line2} onChange={(e) => setLine2(e.target.value)} placeholder="Area, Landmark (optional)" />
        </PField>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <PField label="City">
            <input className="p-input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" />
          </PField>
          <PField label="State">
            <input className="p-input" value={state} onChange={(e) => setState(e.target.value)} placeholder="Maharashtra" />
          </PField>
          <PField label="PIN Code">
            <input className="p-input" value={pincode} onChange={(e) => setPincode(e.target.value)} maxLength={6} placeholder="400001" />
          </PField>
          <PField label="Country">
            <input className="p-input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="India" />
          </PField>
        </div>
        <PBtn loading={saving}>Save Address</PBtn>
        {msg && <PMsg ok={msg.ok}>{msg.text}</PMsg>}
      </PForm>
    </PCard>
  );
}
