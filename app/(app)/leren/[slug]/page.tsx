import { redirect } from "next/navigation";

// De losse lespagina's speelden een Dailymotion-video af die niet meer werkt
// (zie de toelichting in ../page.tsx). Oude links en bladwijzers komen daarom op
// de mededeling uit in plaats van op een kapotte speler. De vorige versie van
// deze pagina staat in de git-geschiedenis.
export default function LessonPage() {
  redirect("/leren");
}
