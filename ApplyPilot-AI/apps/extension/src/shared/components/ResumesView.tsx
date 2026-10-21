import type { ResumeSummary } from "@applypilot/shared-types";
import { FileText, FileUp, Star, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../api";
import { useAction } from "../hooks";
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, SectionTitle, Skeleton, SuccessNote, TextArea } from "../ui";

interface Props { resumes: ResumeSummary[]; loading: boolean; error: string | null; reload: () => Promise<void>; select: (id: number) => void }
const MAX = 5 * 1024 * 1024;

export function ResumesView({ resumes, loading, error, reload, select }: Props) {
  const file = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const upload = useAction(async (f: File) => {
    if (f.size > MAX) throw new Error("That file is over 5 MB. Export a smaller PDF or paste the text.");
    const r = await api.uploadResume(f); setWarnings(r.parsed.warnings); select(r.id); await reload();
  });
  const create = useAction(async () => { const r = await api.createManualResume(name.trim() || "Pasted resume", text); setWarnings(r.parsed.warnings); select(r.id); setPaste(false); setText(""); setName(""); await reload(); });
  const makeDefault = useAction(async (id: number) => { await api.setDefaultResume(id); select(id); await reload(); });
  const del = useAction(async (id: number) => { await api.deleteResume(id); setConfirmId(null); await reload(); });

  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        <SectionTitle>Add a resume</SectionTitle>
        <input ref={file} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" aria-label="Upload resume file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload.run(f); }} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="subtle" loading={upload.loading} icon={<FileUp size={15} />} onClick={() => file.current?.click()}>Upload PDF/DOCX</Button>
          <Button variant="subtle" icon={<FileText size={15} />} onClick={() => setPaste(!paste)}>Paste text</Button>
        </div>
        <p className="text-[11px] text-ink-dim">Stored privately on your server and visible only to your account. PDF or DOCX, up to 5 MB.</p>
        {upload.error && <ErrorBanner message={upload.error} />}
        {paste && (
          <form className="space-y-2 pt-1" onSubmit={(e) => { e.preventDefault(); void create.run(); }}>
            <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Data engineering resume" />
            <TextArea label="Resume text" rows={8} value={text} onChange={(e) => setText(e.target.value)} hint="Use headings like Skills, Experience, Education, Projects for better analysis." />
            {create.error && <ErrorBanner message={create.error} />}
            <Button type="submit" block loading={create.loading} disabled={text.trim().length < 50}>Save resume</Button>
          </form>)}
        {warnings.map((w) => <ErrorBanner key={w} tone="warn" message={w} />)}
      </Card>

      <div>
        <SectionTitle>Your resumes</SectionTitle>
        {error && <ErrorBanner message={error} onRetry={() => void reload()} />}
        {loading ? <div className="space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
          : resumes.length === 0 ? <EmptyState icon={<FileText size={18} />} title="No resumes yet">Upload or paste one to start comparing it with job postings.</EmptyState>
          : <ul className="space-y-2">{resumes.map((r) => (
            <li key={r.id}><Card className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-medium">{r.name}</p><p className="truncate text-[11px] text-ink-dim">{r.original_filename ?? "Pasted text"} · {(r.size_bytes / 1024).toFixed(0)} KB</p></div>
                {r.is_default && <Badge tone="info" icon={<Star size={11} />}>Default</Badge>}
              </div>
              {confirmId === r.id ? (
                <div className="flex items-center gap-2"><span className="flex-1 text-[12px]">Delete permanently?</span><Button variant="danger" loading={del.loading} onClick={() => void del.run(r.id)}>Delete</Button><Button variant="ghost" onClick={() => setConfirmId(null)}>Keep</Button></div>
              ) : (
                <div className="flex gap-2">
                  {!r.is_default && <Button variant="subtle" className="flex-1" loading={makeDefault.loading} onClick={() => void makeDefault.run(r.id)}>Make default</Button>}
                  <Button variant="ghost" aria-label={`Delete ${r.name}`} icon={<Trash2 size={15} />} onClick={() => setConfirmId(r.id)} />
                </div>)}
            </Card></li>))}</ul>}
        {(makeDefault.error || del.error) && <div className="mt-2"><ErrorBanner message={(makeDefault.error ?? del.error)!} /></div>}
        {!loading && resumes.length > 0 && <div className="mt-2"><SuccessNote>Pick which resume to use from the selector on the Job Match tab.</SuccessNote></div>}
      </div>
    </div>
  );
}
