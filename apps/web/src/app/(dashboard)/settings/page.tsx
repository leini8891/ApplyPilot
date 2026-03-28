import { SectionCard } from '@applypilot/ui';

import { DataControls } from '@/components/data-controls';
import { PreferencesForm } from '@/components/preferences-form';
import { ResumeUploadForm } from '@/components/resume-upload-form';
import { getDashboardData } from '@/server/services/app-service';

export default async function SettingsPage() {
  const snapshot = await getDashboardData();

  return (
    <div className="page-grid">
      <div className="two-column-grid">
        <SectionCard
          description="PDF and DOCX are supported. Uploading triggers AI-assisted profile extraction."
          eyebrow="Resume"
          title="Master resume"
        >
          <ResumeUploadForm />
          <div className="simple-list compact-list">
            {snapshot.resumes.map((resume) => (
              <article className="list-row" key={resume.id}>
                <div>
                  <strong>{resume.label}</strong>
                  <p>{resume.sourceFileName}</p>
                </div>
                <span className="muted-copy">{resume.sourceFileType}</span>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          description="Structured data extracted from the latest resume parse."
          eyebrow="Profile"
          title={snapshot.profile?.fullName ?? 'No profile yet'}
        >
          <div className="profile-summary">
            <p className="muted-copy">{snapshot.profile?.summary ?? 'Upload a resume to generate a profile.'}</p>
            <div className="tag-row">
              {(snapshot.profile?.skills ?? []).map((skill) => (
                <span className="tag" key={skill}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        description="Preferences drive scoring, review routing, and run quotas."
        eyebrow="Preferences"
        title="Job targeting"
      >
        <PreferencesForm preference={snapshot.preference} />
      </SectionCard>

      <SectionCard
        description="Export your single-user data snapshot or wipe the workspace clean."
        eyebrow="Privacy"
        title="Data controls"
      >
        <DataControls />
      </SectionCard>
    </div>
  );
}
