// Oud adres. De drie bibliotheken staan sinds 24-09-2026 samen onder /bibliotheek;
// bestaande links en bladwijzers komen hier binnen en gaan door naar het juiste tabje.
import { redirect } from "next/navigation";

export default function Pagina() {
  redirect("/bibliotheek?tab=omgevingen");
}
