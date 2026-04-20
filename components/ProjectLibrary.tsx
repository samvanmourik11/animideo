"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Project, ProjectStatus } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import NewProjectButton from "@/components/NewProjectButton";

const STATUS_OPTIONS: { value: ProjectStatus | "all"; label: string }[] = [
  { value: "all",          label: "Alle statussen" },
  { value: "Draft",        label: "Draft" },
  { value: "ScriptReady",  label: "Script klaar" },
  { value: "ImagesReady",  label: "Afbeeldingen klaar" },
  { value: "MotionReady",  label: "Motion klaar" },
  { value: "VoiceReady",   label: "Voice klaar" },
  { value: "Done",         label: "Klaar" },
];

interface Props {
  projects: Project[];
  userId: string;
}

function projectHref(p: Project) {
  if (p.mode === "free") return `/project/${p.id}/free`;
  if (p.mode === "t2v")  return `/project/${p.id}/t2v`;
  return `/project/${p.id}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

export default function ProjectLibrary({ projects: initial, userId }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      const matchSearch = p.title.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [projects, search, statusFilter]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch("/api/save-project", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
      });
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // silently fail — project stays in list
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  }

  if (projects.length === 0) {
    return (
      <div className="card text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🎬</span>
        </div>
        <p className="text-white font-semibold text-lg mb-1">Nog geen projecten</p>
        <p className="text-slate-500 text-sm mb-6">
          Klik op <strong className="text-slate-300">Nieuw project</strong> om te beginnen.
        </p>
        <div className="flex justify-center">
          <NewProjectButton userId={userId} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="text"
          placeholder="Zoek project…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-0 bg-[#0c1428] border border-white/[0.07] rounded-xl px-4 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | "all")}
          className="bg-[#0c1428] border border-white/[0.07] rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-[#0c1428] border border-white/[0.07] rounded-xl p-1">
          <button
            onClick={() => setView("grid")}
            className={`p-1.5 rounded-lg transition-colors ${view === "grid" ? "bg-blue-500/20 text-blue-400" : "text-slate-500 hover:text-slate-300"}`}
            title="Grid"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z" />
            </svg>
          </button>
          <button
            onClick={() => setView("list")}
            className={`p-1.5 rounded-lg transition-colors ${view === "list" ? "bg-blue-500/20 text-blue-400" : "text-slate-500 hover:text-slate-300"}`}
            title="Lijst"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-500 text-sm">
          Geen projecten gevonden voor je zoekopdracht.
        </div>
      )}

      {/* Grid view */}
      {view === "grid" && filtered.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {filtered.map((project) => {
            const thumb = project.scenes?.find((s) => s.image_url)?.image_url ?? null;
            return (
              <div
                key={project.id}
                className="group relative bg-[#0c1428] border border-white/[0.07] hover:border-blue-500/30 rounded-2xl overflow-hidden transition-all hover:shadow-[0_4px_24px_rgba(59,130,246,0.1)]"
              >
                <Link href={projectHref(project)}>
                  {/* Thumbnail */}
                  <div className="aspect-video bg-[#060d1f] relative flex items-center justify-center overflow-hidden">
                    {thumb ? (
                      <Image src={thumb} alt="" fill className="object-cover" unoptimized />
                    ) : (
                      <span className="text-3xl opacity-20">🎬</span>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-3">
                      <StatusBadge status={project.status} />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <p className="font-semibold text-white text-sm group-hover:text-blue-300 transition-colors truncate">
                      {project.title}
                    </p>
                    <p className="text-xs text-slate-300 mt-1">
                      {project.format} · {project.language} · {formatDate(project.created_at)}
                    </p>
                    {project.scenes && project.scenes.length > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">{project.scenes.length} scenes</p>
                    )}
                  </div>
                </Link>

                {/* Delete button */}
                <div className="absolute top-2 right-2">
                  {confirmDelete === project.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDelete(project.id)}
                        disabled={deletingId === project.id}
                        className="text-xs px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30"
                      >
                        {deletingId === project.id ? "…" : "Ja"}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs px-2 py-1 rounded-lg bg-white/10 text-slate-400 hover:bg-white/20"
                      >
                        Nee
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.preventDefault(); setConfirmDelete(project.id); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg bg-black/60 border border-white/10 text-slate-400 hover:text-red-400 flex items-center justify-center"
                      title="Verwijderen"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List view */}
      {view === "list" && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((project) => (
            <div
              key={project.id}
              className="group flex items-center justify-between bg-[#0c1428] border border-white/[0.07] hover:border-blue-500/30 rounded-2xl px-5 py-4 transition-all hover:shadow-[0_4px_24px_rgba(59,130,246,0.1)]"
            >
              <Link href={projectHref(project)} className="flex items-center gap-4 min-w-0 flex-1">
                {/* Mini thumb */}
                <div className="w-14 h-9 rounded-lg overflow-hidden bg-[#060d1f] shrink-0 relative">
                  {project.scenes?.find((s) => s.image_url)?.image_url ? (
                    <Image
                      src={project.scenes.find((s) => s.image_url)!.image_url!}
                      alt=""
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-lg opacity-20">🎬</span>
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="font-semibold text-white group-hover:text-blue-300 transition-colors truncate text-sm">
                    {project.title}
                  </p>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {project.language} · {project.format} · {formatDate(project.created_at)}
                    {project.scenes && project.scenes.length > 0 && ` · ${project.scenes.length} scenes`}
                  </p>
                </div>
              </Link>

              <div className="flex items-center gap-3 shrink-0 ml-4">
                <StatusBadge status={project.status} />
                {confirmDelete === project.id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleDelete(project.id)}
                      disabled={deletingId === project.id}
                      className="text-xs px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30"
                    >
                      {deletingId === project.id ? "…" : "Verwijderen"}
                    </button>
                    <button onClick={() => setConfirmDelete(null)} className="text-xs px-2 py-1 rounded-lg bg-white/10 text-slate-400">
                      Annuleren
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(project.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-400"
                    title="Verwijderen"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
