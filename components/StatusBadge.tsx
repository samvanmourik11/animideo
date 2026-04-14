import { ProjectStatus } from "@/lib/types";

const colors: Record<ProjectStatus, string> = {
  Draft:        "bg-gray-100 text-gray-600",
  ScriptReady:  "bg-blue-100 text-blue-700",
  ImagesReady:  "bg-indigo-100 text-indigo-700",
  MotionReady:  "bg-violet-100 text-violet-700",
  VoiceReady:   "bg-purple-100 text-purple-700",
  Rendering:    "bg-yellow-100 text-yellow-700",
  Done:         "bg-green-100 text-green-700",
  Error:        "bg-red-100 text-red-700",
};

const labels: Record<ProjectStatus, string> = {
  Draft:        "Draft",
  ScriptReady:  "Script Ready",
  ImagesReady:  "Images Ready",
  MotionReady:  "Motion Ready",
  VoiceReady:   "Voice Ready",
  Rendering:    "Rendering",
  Done:         "Done",
  Error:        "Error",
};

export default function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}
