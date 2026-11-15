import { GroupMember } from '../core/models';

export const PROJECT = {
  title: 'SeeCareer',
  tagline: 'AI job finder and career assistant',
  description:
    'SeeCareer is an AI career app for students and fresh graduates. You can find real remote jobs, upload or make a resume (PDF or Word), ' +
    'check how well you fit a job, write cover letters, see the skills you are missing and practice interviews. ' +
    'The jobs come from the free Himalayas Jobs REST API (100,000+ remote jobs) using Angular HttpClient GET.',
  group: 'Group 2',
  course: 'IT-PT02 Mobile Application Development',
  program: 'BSIT',
  year: '3rd Year',
  section: 'BSIT 3E',
  school: 'Nueva Ecija University of Science and Technology (NEUST)',
  instructor: 'Sir Angelito Cunanan Jr.',
  api: 'Himalayas Jobs API',
  endpoint: 'https://himalayas.app/jobs/api',
};

export const MEMBERS: GroupMember[] = [
  new GroupMember('Jomar D. Alcantara', 'Leader / Developer', 'Planned the app, built the AI chat, job search and resume features, and set up the free AI server.', 'assets/team/jomarAlcantara'),
  new GroupMember('Evia Cassandra Eliz D. Sindac', 'Member / Designer', 'Made the pixel theme and icons, and designed the look of every page.', 'assets/team/eviaSindac'),
  new GroupMember('Anjo T. Adriano', 'Member / Tester', 'Tested every page and feature on phones and laptops, checked the job APIs and reported the bugs we fixed.', 'assets/team/anjoAdriano'),
  new GroupMember('Khimberly M. Bautista', 'Member / Documentation', 'Wrote the documentation, the setup guide and the test results of the project.', 'assets/team/khimberlyBautista'),
];

export const TECH = ['Ionic 9', 'Angular 22', 'TypeScript', 'Capacitor (Android)', 'RxJS HttpClient'];

export interface ApiInfo {
  name: string;
  use: string;
  url: string;
}

export const APIS: ApiInfo[] = [
  { name: 'Himalayas Jobs API', use: 'Remote job listings (main source, HttpClient GET, no key)', url: 'https://himalayas.app/jobs/api' },
  { name: 'Remotive', use: 'More remote jobs', url: 'https://remotive.com/api/remote-jobs' },
  { name: 'Jobicy', use: 'More remote jobs, with place filter', url: 'https://jobicy.com/api/v2/remote-jobs' },
  { name: 'RemoteOK', use: 'More remote jobs', url: 'https://remoteok.com/api' },
  { name: 'Arbeitnow', use: 'More jobs, including Europe', url: 'https://www.arbeitnow.com/api/job-board-api' },
  { name: 'Wikipedia', use: 'Web lookup and public photos for the assistant', url: 'https://en.wikipedia.org/w/api.php' },
  { name: 'Company icons', use: 'Logos of the hiring companies', url: 'https://www.google.com/s2/favicons' },
  { name: 'SeeCareer free AI', use: 'The built-in AI for chat, resume and matching', url: 'https://api.jomstaid.com/v1' },
];
