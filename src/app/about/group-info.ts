import { GroupMember } from '../core/models';

/**
 * ============ EDIT THIS FILE ============
 * Fill in your real group details. The About Our Group page reads everything from here.
 */
export const PROJECT = {
  title: 'SeeCareer',
  tagline: 'AI job finder and career assistant',
  description:
    'SeeCareer is an AI career chat for students and fresh graduates: find real remote jobs, upload or generate a resume (PDF/Word), ' +
    'check job match scores, write cover letters, find skill gaps and practice interviews. ' +
    'Jobs are loaded from the public Himalayas jobs REST API (100,000+ remote jobs) using Angular HttpClient GET.',
  course: 'Mobile Application Development',
  program: 'BSIT',
  year: '3rd Year',
  section: 'IT-PT02',
  school: 'Nueva Ecija University of Science and Technology (NEUST)',
  api: 'Himalayas Jobs API',
  endpoint: 'https://himalayas.app/jobs/api',
};

export const MEMBERS: GroupMember[] = [
  new GroupMember('Member 1 (replace with real name)', 'Project Lead / Developer', 'Planned the app, built the pages and routing.'),
  new GroupMember('Member 2 (replace with real name)', 'UI/UX Designer', 'Designed the interface and the Ionic components used.'),
  new GroupMember('Member 3 (replace with real name)', 'API Developer', 'Connected the Himalayas jobs API and the AI assistant.'),
  new GroupMember('Member 4 (replace with real name)', 'Tester / Documentation', 'Tested the main user flow and wrote the documentation.'),
];

export const TECH = ['Ionic 9', 'Angular 22', 'TypeScript', 'Capacitor (Android)', 'RxJS HttpClient'];
