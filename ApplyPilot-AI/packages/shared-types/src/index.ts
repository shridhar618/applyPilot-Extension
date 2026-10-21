/** API contracts shared by the extension (and, later, the web dashboard). Mirrors backend/app/schemas. */

export type EvidenceStatus = "evidenced" | "stated" | "needs_verification" | "absent" | "not_assessable";
export type ApplicationStatus =
  | "saved" | "preparing" | "ready_to_apply" | "applied" | "assessment" | "interview" | "offer" | "rejected" | "withdrawn";

export interface User { id: number; email: string; full_name: string; ai_consent: boolean }
export interface TokenOut { access_token: string; token_type: string; expires_in: number; user: User }

export interface ParsedResume {
  sections: Record<string, string>;
  contact: Record<string, string>;
  skills_found: string[];
  years_experience: number | null;
  years_note: string;
  education_level: string | null;
  warnings: string[];
}
export interface ResumeSummary {
  id: number; name: string; original_filename: string | null; size_bytes: number;
  is_default: boolean; has_file: boolean; created_at: string; updated_at: string;
}
export interface ResumeDetail extends ResumeSummary { text: string; parsed: ParsedResume }

export interface JobAnalysis {
  required_skills: string[]; preferred_skills: string[]; mentioned_skills: string[];
  classification_confidence: "high" | "low";
  min_years_experience: number | null; education_level: string | null; education_text: string;
  responsibilities: string[]; soft_skills: string[]; certifications: string[];
  ambiguities: string[]; injection_suspected: boolean;
}
export interface JobInput {
  title: string; company?: string; location?: string; employment_type?: string; salary_text?: string;
  url?: string | null; source?: "auto" | "manual"; adapter?: string | null; description: string;
}
export interface JobOut extends Required<Omit<JobInput, "url" | "adapter" | "source">> {
  id: number; url: string | null; source: string; adapter: string | null; analysis: JobAnalysis; created_at: string; duplicate: boolean;
}

export interface ScoreComponent {
  key: string; label: string; weight: number; effective_weight: number; value: number | null; assessable: boolean; detail: string;
}
export interface SkillFinding { skill: string; requirement: "required" | "preferred" | "mentioned"; status: EvidenceStatus; evidence: string | null }
export interface MatchResult {
  label: string; score: number; components: ScoreComponent[]; skill_findings: SkillFinding[];
  strengths: string[]; concerns: string[]; recommended_actions: string[]; semantic_method: string; notes: string[];
}
export interface MatchOut { id: number | null; resume_id: number; job_id: number | null; score: number; result: MatchResult; created_at: string | null }
export interface MatchExplanation { summary: string; top_priorities: string[]; caveats: string[] }
export interface AIStatus { configured: boolean; provider: string | null; model: string | null; consent_given: boolean }

export interface ApplicationOut {
  id: number; job: { id: number; title: string; company: string; location: string; url: string | null };
  resume_id: number | null; status: ApplicationStatus; applied_on: string | null; notes: string; next_action: string;
  follow_up_on: string | null; created_at: string; updated_at: string;
}
export interface Page<T> { items: T[]; total: number; limit: number; offset: number }
export interface ApiErrorBody { error: { code: string; message: string; details: unknown } }

/** What the page-extraction adapters return. */
export interface ExtractedJob {
  title: string; company: string; location: string; employmentType: string; salaryText: string;
  description: string; url: string; adapter: string; confidence: "high" | "medium" | "low";
}
