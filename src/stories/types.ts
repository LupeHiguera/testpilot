export type StoryStatus = 'new' | 'generated' | 'passing' | 'failing' | 'needs-review';

export interface Story {
  id: string;
  projectId: string;
  source: 'upload' | 'github' | 'jira';
  /** External identifier, e.g. a GitHub issue number or Jira key. */
  externalId?: string;
  title: string;
  body: string;
  status: StoryStatus;
  createdAt: number;
}
