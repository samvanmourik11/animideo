import { ProjectStatus } from "@/lib/types";

const colors: Record<ProjectStatus, string> = {
  Draft:        "bg-slate-500/15 text-slate-400 border-slate-500/20",
  ScriptReady:  "bg-blue-500/15 text-blue-400 border-blue-500/20",
  ImagesReady:  "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
  MotionReady:  "bg-violet-500/15 text-violet-400 border-violet-500/20",
  VoiceReady:   "bg-purple-500/15 text-purple-400 border-purple-500/20",
  Rendering:    "bg-amber-500/15 text-amber-400 border-amber-500/20",
  Done:         "bg-green-500/15 text-green-400 border-green-500/20",
  Error:        "bg-red-500/15 text-red-400 border-red-500/20",
};

const labels: Record<ProjectStatus, string> = {
  Draft:        "Draft",
  ScriptReady:  "Script klaar",
  ImagesReady:  "Afbeeldingen klaar",
  MotionReady:  "Motion klaar",
  VoiceReady:   "Voice klaar",
  Rendering:    "Rendering",
  Done:         "Klaar",
  Error:        "Fout",
};

export default function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}
