// Video's uit de Studio's (Storytelling, Dialoog) in de bibliotheek van de nieuwe app.
//
// Die tools hebben hun eigen werkwijze en hun eigen afschrijving; alleen de eindvideo
// komt als creatie in de bibliotheek, met een verwijzing terug naar het project. Zo staat
// alles wat iemand maakte op één plek, ongeacht met welke tool.

import { createServiceClient } from "@/lib/supabase/service";

export type StudioMaker = "storytelling" | "dialoog";

export async function bewaarStudioVideo(o: {
  userId: string;
  maker: StudioMaker;
  url: string;
  titel: string;
  formaat: string;
  projectId?: string | null;
}): Promise<void> {
  try {
    const { error } = await createServiceClient()
      .from("creaties")
      .insert({
        user_id: o.userId,
        soort: "video",
        status: "klaar",
        maker: o.maker,
        // De downloadlink dwingt een download af; in de bibliotheek moet hij gewoon spelen.
        url: o.url.split("?")[0],
        prompt: o.titel.slice(0, 200) || null,
        invoer: { formaat: o.formaat, ...(o.projectId ? { projectId: o.projectId } : {}) },
        // Afgeschreven is er al in de tool zelf, per stap; de export kost niets extra.
        credits: 0,
        klaar_op: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
  } catch (e) {
    // De klant heeft zijn video al; een gemiste bibliotheekregel mag de export niet breken.
    console.error(`[studio-video] niet in de bibliotheek gezet (${o.maker}):`, e instanceof Error ? e.message : e);
  }
}
