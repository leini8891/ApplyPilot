import React from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';

import type { CandidateProfile, JobPosting, TailoredResume } from '@applypilot/domain';

const styles = StyleSheet.create({
  page: {
    fontSize: 11,
    padding: 32,
    lineHeight: 1.45,
    fontFamily: 'Helvetica',
  },
  section: {
    marginBottom: 14,
  },
  name: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 4,
  },
  title: {
    fontSize: 12,
    color: '#2f5f4f',
    marginBottom: 8,
  },
  heading: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bullet: {
    marginBottom: 4,
  },
});

function ResumePdfDocument({
  profile,
  job,
  tailoredResume,
}: {
  profile: CandidateProfile;
  job: JobPosting;
  tailoredResume: TailoredResume;
}) {
  const bulletPoints = tailoredResume.markdownContent
    .split('\n')
    .map((line) => line.replace(/^[-#*\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 18);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.section}>
          <Text style={styles.name}>{profile.fullName || 'Candidate'}</Text>
          <Text>{[profile.email, profile.phone, profile.location].filter(Boolean).join(' | ')}</Text>
          <Text style={styles.title}>{job.title} at {job.company}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Profile</Text>
          <Text>{profile.summary}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Highlights</Text>
          {bulletPoints.map((item) => (
            <Text key={item} style={styles.bullet}>
              - {item}
            </Text>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Experience</Text>
          {profile.workExperiences.slice(0, 3).map((experience) => (
            <View key={`${experience.company}-${experience.title}`} style={{ marginBottom: 8 }}>
              <Text>{experience.title} | {experience.company}</Text>
              <Text>{experience.startDate} - {experience.endDate ?? 'Present'}</Text>
              <Text>{experience.summary}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Skills</Text>
          <Text>{profile.skills.join(' • ')}</Text>
        </View>
      </Page>
    </Document>
  );
}

export const renderTailoredResumePdf = async ({
  profile,
  job,
  tailoredResume,
}: {
  profile: CandidateProfile;
  job: JobPosting;
  tailoredResume: TailoredResume;
}) =>
  renderToBuffer(
    <ResumePdfDocument profile={profile} job={job} tailoredResume={tailoredResume} />,
  );

