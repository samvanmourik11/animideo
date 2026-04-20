"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  email: string;
  name: string;
}

export default function SettingsClient({ email, name: initialName }: Props) {
  const router = useRouter();

  // Profile
  const [name, setName] = useState(initialName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState("");

  // Email
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState("");

  // Delete account
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function saveName() {
    setNameSaving(true);
    setNameMsg("");
    try {
      const res = await fetch("/api/account/update-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Opslaan mislukt");
      setNameMsg("Naam opgeslagen.");
      router.refresh();
    } catch {
      setNameMsg("Er ging iets mis bij opslaan.");
    } finally {
      setNameSaving(false);
    }
  }

  async function changeEmail() {
    if (!newEmail.includes("@")) {
      setEmailMsg("Voer een geldig e-mailadres in.");
      return;
    }
    setEmailSaving(true);
    setEmailMsg("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      setEmailMsg("Bevestigingsmail verzonden naar " + newEmail + ". Klik op de link om te bevestigen.");
      setNewEmail("");
    } catch (e: unknown) {
      setEmailMsg(e instanceof Error ? e.message : "E-mail wijzigen mislukt.");
    } finally {
      setEmailSaving(false);
    }
  }

  async function changePassword() {
    if (newPassword.length < 8) {
      setPasswordMsg("Wachtwoord moet minimaal 8 tekens zijn.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg("Wachtwoorden komen niet overeen.");
      return;
    }
    setPasswordSaving(true);
    setPasswordMsg("");
    try {
      const supabase = createClient();
      // Re-authenticate first to verify current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (signInError) {
        setPasswordMsg("Huidig wachtwoord is onjuist.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordMsg("Wachtwoord succesvol gewijzigd.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: unknown) {
      setPasswordMsg(e instanceof Error ? e.message : "Wachtwoord wijzigen mislukt.");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== "VERWIJDER") return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Verwijderen mislukt");
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Er ging iets mis.");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-8">

      {/* Profiel */}
      <section className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Profiel</h3>
        <div className="space-y-4">
          <div>
            <label className="label">Naam</label>
            <input
              type="text"
              className="input"
              placeholder="Jouw naam"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">E-mailadres</label>
            <input
              type="email"
              className="input opacity-50 cursor-not-allowed"
              value={email}
              disabled
            />
            <p className="text-xs text-slate-400 mt-1">Wijzig je e-mailadres hieronder.</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={saveName} disabled={nameSaving} className="btn-primary text-sm">
              {nameSaving ? "Opslaan…" : "Naam opslaan"}
            </button>
            {nameMsg && (
              <p className={`text-sm ${nameMsg.includes("mis") ? "text-red-400" : "text-green-400"}`}>
                {nameMsg}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* E-mail wijzigen */}
      <section className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-1">E-mailadres wijzigen</h3>
        <p className="text-xs text-slate-500 mb-4">
          Er wordt een bevestigingsmail gestuurd naar je nieuwe adres.
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">Nieuw e-mailadres</label>
            <input
              type="email"
              className="input"
              placeholder="nieuw@voorbeeld.nl"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={changeEmail} disabled={emailSaving || !newEmail} className="btn-primary text-sm">
              {emailSaving ? "Verzenden…" : "Bevestigingsmail sturen"}
            </button>
            {emailMsg && (
              <p className={`text-sm ${emailMsg.includes("mis") || emailMsg.includes("geldig") ? "text-red-400" : "text-green-400"}`}>
                {emailMsg}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Wachtwoord */}
      <section className="bg-[#0c1428] border border-white/[0.07] rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Wachtwoord wijzigen</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Huidig wachtwoord</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Nieuw wachtwoord</label>
            <input
              type="password"
              className="input"
              placeholder="Minimaal 8 tekens"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Bevestig nieuw wachtwoord</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={changePassword}
              disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
              className="btn-primary text-sm"
            >
              {passwordSaving ? "Wijzigen…" : "Wachtwoord wijzigen"}
            </button>
            {passwordMsg && (
              <p className={`text-sm ${
                passwordMsg.includes("mis") || passwordMsg.includes("onjuist") || passwordMsg.includes("overeen") || passwordMsg.includes("minimaal")
                  ? "text-red-400"
                  : "text-green-400"
              }`}>
                {passwordMsg}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Gevaar zone */}
      <section className="border border-red-500/20 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-red-400 mb-1">Account verwijderen</h3>
        <p className="text-sm text-slate-500 mb-4">
          Dit verwijdert je account en alle bijbehorende projecten, brand kits en data permanent. Deze actie kan niet ongedaan worden gemaakt.
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">
              Typ <span className="text-red-400 font-mono">VERWIJDER</span> om te bevestigen
            </label>
            <input
              type="text"
              className="input border-red-500/20 focus:border-red-500/40"
              placeholder="VERWIJDER"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
            />
          </div>
          {deleteError && <p className="text-sm text-red-400">{deleteError}</p>}
          <button
            onClick={deleteAccount}
            disabled={deleteConfirm !== "VERWIJDER" || deleting}
            className="text-sm px-4 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? "Verwijderen…" : "Account definitief verwijderen"}
          </button>
        </div>
      </section>
    </div>
  );
}
