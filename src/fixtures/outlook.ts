/**
 * Recorded Microsoft Graph payloads (MIT's Outlook tenant).
 *   GET /me/events
 *   GET /me/mailFolders/inbox/messages
 *
 * Email is the messy one: half of MIT's opportunities arrive as dorm-spam and
 * department mailing-list blasts with the real date buried in prose. Those go
 * to the LLM extractor.
 */

import { daysFromNow, hoursFromNow, daysAgo } from './time';

export interface GraphDateTime {
  dateTime: string;
  timeZone: string;
}

export interface GraphEvent {
  id: string;
  subject: string;
  bodyPreview: string;
  start: GraphDateTime;
  end: GraphDateTime;
  isAllDay: boolean;
  location: { displayName: string };
  organizer: { emailAddress: { name: string; address: string } };
  webLink: string;
}

export interface GraphMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  body: { contentType: 'html' | 'text'; content: string };
  from: { emailAddress: { name: string; address: string } };
  receivedDateTime: string;
  webLink: string;
}

export const EVENTS: GraphEvent[] = [
  {
    id: 'AAMkAGI1_evt_8812',
    subject: '6.3900 Recitation R05',
    bodyPreview: 'Weekly recitation.',
    start: { dateTime: hoursFromNow(26), timeZone: 'America/New_York' },
    end: { dateTime: hoursFromNow(27), timeZone: 'America/New_York' },
    isAllDay: false,
    location: { displayName: '4-231' },
    organizer: {
      emailAddress: { name: '6.3900 Staff', address: '6.3900-staff@mit.edu' },
    },
    webLink: 'https://outlook.office365.com/calendar/item/AAMkAGI1_evt_8812',
  },
  {
    id: 'AAMkAGI1_evt_9034',
    subject: 'Coffee chat — Prof. Nickolai Zeldovich',
    bodyPreview:
      'Following up on your email about UROP openings in the PDOS group. Stata 32-G992.',
    start: { dateTime: daysFromNow(3, 15, 0), timeZone: 'America/New_York' },
    end: { dateTime: daysFromNow(3, 15, 30), timeZone: 'America/New_York' },
    isAllDay: false,
    location: { displayName: '32-G992 (Stata)' },
    organizer: {
      emailAddress: { name: 'Nickolai Zeldovich', address: 'nickolai@csail.mit.edu' },
    },
    webLink: 'https://outlook.office365.com/calendar/item/AAMkAGI1_evt_9034',
  },
];

export const MESSAGES: GraphMessage[] = [
  {
    id: 'AAMkAGI1_msg_5501',
    subject: '[csail-announce] CSAIL Colloquium: Foundation Models for Robot Manipulation',
    bodyPreview:
      'Please join us Thursday for a talk by Prof. Chelsea Finn (Stanford) on scaling robot learning.',
    body: {
      contentType: 'html',
      content:
        '<p>Please join us <strong>this Thursday at 4:00pm in 32-G449 (Kiva)</strong> for a talk by Prof. Chelsea Finn (Stanford CS) titled <em>Foundation Models for Robot Manipulation</em>.</p>' +
        '<p>Abstract: We discuss how large-scale pretraining on diverse robot data yields policies that generalize to unseen objects and environments, and what remains hard about long-horizon manipulation.</p>' +
        '<p>Refreshments will be served at 3:45pm. Hosted by the Embodied Intelligence group.</p>',
    },
    from: {
      emailAddress: { name: 'CSAIL Announcements', address: 'csail-announce@csail.mit.edu' },
    },
    receivedDateTime: daysAgo(1, 11, 4),
    webLink: 'https://outlook.office365.com/mail/id/AAMkAGI1_msg_5501',
  },
  {
    id: 'AAMkAGI1_msg_5620',
    subject: 'UROP opening — computer vision for cell microscopy (Broad / MIT)',
    bodyPreview:
      'We are looking for 1-2 undergrads for spring UROP. Python + PyTorch required.',
    body: {
      contentType: 'html',
      content:
        '<p>Hi all,</p><p>The Imaging Platform is recruiting <strong>1–2 undergraduates</strong> for a Spring UROP on self-supervised representation learning for high-content cell microscopy. ' +
        'You would work with Dr. Anne Carpenter and a senior graduate student.</p>' +
        '<p>Requirements: Python, some PyTorch, one of 6.3900 / 6.8300. Prior imaging experience not required.</p>' +
        '<p><strong>Applications due Friday, October 2 at 5pm.</strong> Send a CV and a short paragraph to imaging-urop@broadinstitute.org.</p>',
    },
    from: {
      emailAddress: { name: 'MIT UROP Digest', address: 'urop-digest@mit.edu' },
    },
    receivedDateTime: daysAgo(2, 8, 30),
    webLink: 'https://outlook.office365.com/mail/id/AAMkAGI1_msg_5620',
  },
  {
    id: 'AAMkAGI1_msg_5701',
    subject: '[dormspam] FREE PIZZA + a cappella auditions tonight!!!',
    bodyPreview: 'Come to the Student Center tonight at 8pm. Pizza. Singing. You know the drill.',
    body: {
      contentType: 'html',
      content:
        '<p>hey everyone!! auditions for the Chorallaries are TONIGHT 8pm in W20-407. ' +
        'no prep needed, we teach you everything. FREE PIZZA (a lot of it).</p>',
    },
    from: {
      emailAddress: { name: 'Chorallaries of MIT', address: 'chorallaries@mit.edu' },
    },
    receivedDateTime: hoursFromNow(-6),
    webLink: 'https://outlook.office365.com/mail/id/AAMkAGI1_msg_5701',
  },
  {
    id: 'AAMkAGI1_msg_5788',
    subject: 'Quantum Information Seminar — error correction below threshold',
    bodyPreview: 'Tuesday 12pm, 26-214. Pizza provided.',
    body: {
      contentType: 'html',
      content:
        '<p>The Quantum Information Science seminar meets <strong>Tuesday at 12:00pm in 26-214</strong>. ' +
        'Speaker: Prof. Isaac Chuang. Topic: what operating below the surface-code threshold actually buys you. Pizza provided.</p>',
    },
    from: {
      emailAddress: { name: 'MIT-Harvard CUA', address: 'cua-seminars@mit.edu' },
    },
    receivedDateTime: daysAgo(1, 16, 22),
    webLink: 'https://outlook.office365.com/mail/id/AAMkAGI1_msg_5788',
  },
  {
    id: 'AAMkAGI1_msg_5810',
    subject: 'Reminder: Fall Career Fair registration closes Sunday',
    bodyPreview: 'Over 300 employers. Register on Handshake before Sunday 11:59pm.',
    body: {
      contentType: 'html',
      content:
        '<p>The MIT Fall Career Fair is <strong>September 29–30 in Johnson Athletic Center</strong>. ' +
        'Student registration closes <strong>Sunday at 11:59pm</strong>. Bring printed resumes; some employers do same-day interviews.</p>',
    },
    from: {
      emailAddress: { name: 'MIT Career Advising', address: 'careers@mit.edu' },
    },
    receivedDateTime: daysAgo(3, 10, 0),
    webLink: 'https://outlook.office365.com/mail/id/AAMkAGI1_msg_5810',
  },
];
