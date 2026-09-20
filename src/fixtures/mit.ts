/**
 * Recorded MIT campus listings, in the shapes the two public feeds return.
 *
 *   CALENDAR  - the MIT Events Calendar (calendar.mit.edu, a Localist site).
 *               Its JSON API is public, sends CORS headers, and carries a
 *               plain-text description plus event types - so these are the
 *               richest items the app ever sees without inference.
 *   ENGAGE    - MIT Engage's club-event iCal. Titles, times, rooms; no
 *               descriptions. The fixtures below carry descriptions anyway
 *               because they were recorded from listing pages, so they read
 *               richer than the live feed does. Stated rather than hidden.
 */

import { daysFromNow } from './time';

export interface CalendarListing {
  id: string;
  title: string;
  /** Plain text, as Localist's `description_text`. */
  description: string;
  url: string;
  location?: string;
  room?: string;
  /** Posting group or department. */
  group?: string;
  departments: string[];
  /** Localist event-type filter names, e.g. "Conferences/Seminars/Lectures". */
  types: string[];
  /** Localist "Events by interest" theme, e.g. "Religious/Spiritual", "Academic". */
  themes?: string[];
  /** Localist audience, e.g. "Students", "Faculty", "Alumni". */
  audience?: string[];
  keywords: string[];
  start: string;
  end?: string;
  allDay: boolean;
}

export const CALENDAR: CalendarListing[] = [
  {
    id: 'cal-48812',
    title: 'CSAIL Seminar: Foundation Models for Robot Manipulation',
    description:
      'Large pretrained models have changed perception; this talk asks what they change about ' +
      'control. Recent results on language-conditioned grasping and long-horizon manipulation, ' +
      'and the failure modes that still separate benchmarks from kitchens. Undergraduates welcome; ' +
      'lunch served.',
    url: 'https://calendar.mit.edu/event/csail-seminar-foundation-models-robot-manipulation',
    location: 'Stata Center',
    room: '32-G449 (Kiva)',
    group: 'Computer Science and Artificial Intelligence Laboratory (CSAIL)',
    departments: ['Computer Science and Artificial Intelligence Laboratory (CSAIL)'],
    types: ['Conferences/Seminars/Lectures'],
    keywords: ['robotics', 'machine learning'],
    start: daysFromNow(2, 16, 0),
    end: daysFromNow(2, 17, 0),
    allDay: false,
  },
  {
    id: 'cal-48901',
    title: 'UROP Info Session: Finding a Lab in Course 6',
    description:
      'How Course 6 undergraduates actually land UROPs: reading group pages, writing the first ' +
      'email to a PI, what "no openings" really means, and the direct-funding timeline. Run by the ' +
      'EECS Undergraduate Office with current UROP students on a panel.',
    url: 'https://calendar.mit.edu/event/urop-info-session-course-6',
    location: 'Building 34',
    room: '34-101',
    group: 'Electrical Engineering and Computer Science (EECS)',
    departments: ['Electrical Engineering and Computer Science (EECS)'],
    types: ['Workshops/Fairs'],
    keywords: ['UROP', 'research'],
    start: daysFromNow(3, 17, 0),
    end: daysFromNow(3, 18, 0),
    allDay: false,
  },
  {
    id: 'cal-48955',
    title: 'Physics Colloquium: Gravitational-wave detectors beyond LIGO',
    description:
      'What the next generation of interferometers will see, and the quantum measurement ' +
      'techniques that make it possible. Refreshments at 3:30 in the Pappalardo Room.',
    url: 'https://calendar.mit.edu/event/physics-colloquium-gw-detectors',
    location: 'Building 10',
    room: '10-250',
    group: 'Department of Physics',
    departments: ['Department of Physics'],
    types: ['Conferences/Seminars/Lectures'],
    keywords: ['physics', 'astrophysics'],
    start: daysFromNow(4, 16, 0),
    end: daysFromNow(4, 17, 0),
    allDay: false,
  },
  {
    id: 'cal-49010',
    title: 'Resume Reviews with Career Advising & Professional Development',
    description:
      'Drop-in 15-minute reviews ahead of the Fall Career Fair. Bring a printed copy or your ' +
      'laptop. First-years and sophomores especially encouraged.',
    url: 'https://calendar.mit.edu/event/resume-reviews-fall-career-fair',
    location: 'Building E17',
    room: 'E17-294',
    group: 'Career Advising & Professional Development (CAPD)',
    departments: ['Career Advising & Professional Development (CAPD)'],
    types: ['Career Development'],
    keywords: ['career', 'internships'],
    start: daysFromNow(5, 12, 0),
    end: daysFromNow(5, 15, 0),
    allDay: false,
  },
  {
    id: 'cal-49077',
    title: 'Undergraduate Math Seminar: Spectral Graph Theory and Fast Linear Solvers',
    description:
      'An accessible introduction to Laplacian solvers and why they matter for optimization and ' +
      'machine learning. Aimed at students who have taken 18.06 or 18.C06.',
    url: 'https://calendar.mit.edu/event/undergrad-math-seminar-spectral-graph-theory',
    location: 'Building 2',
    room: '2-190',
    group: 'Department of Mathematics',
    departments: ['Department of Mathematics'],
    types: ['Conferences/Seminars/Lectures'],
    keywords: ['mathematics', 'algorithms'],
    start: daysFromNow(6, 14, 30),
    end: daysFromNow(6, 15, 30),
    allDay: false,
  },
  {
    id: 'cal-49102',
    title: 'Thesis Defense: Learned Index Structures for Cloud Databases',
    description:
      'PhD thesis defense, Data Systems Group. Open to the MIT community.',
    url: 'https://calendar.mit.edu/event/thesis-defense-learned-index-structures',
    location: 'Stata Center',
    room: '32-D463 (Star)',
    group: 'Computer Science and Artificial Intelligence Laboratory (CSAIL)',
    departments: ['Computer Science and Artificial Intelligence Laboratory (CSAIL)'],
    types: ['Thesis defense'],
    keywords: ['databases', 'machine learning'],
    start: daysFromNow(8, 10, 0),
    end: daysFromNow(8, 12, 0),
    allDay: false,
  },
  {
    id: 'cal-49150',
    title: 'MITEI Seminar: The Economics of Grid-Scale Storage',
    description:
      'How battery costs, capacity markets, and renewables curtailment interact, with new ' +
      'results from the MIT Energy Initiative. Lunch provided; RSVP requested.',
    url: 'https://calendar.mit.edu/event/mitei-seminar-grid-scale-storage',
    location: 'Building E19',
    room: 'E19-319',
    group: 'MIT Energy Initiative',
    departments: ['MIT Energy Initiative'],
    types: ['Conferences/Seminars/Lectures'],
    keywords: ['energy', 'climate', 'economics'],
    start: daysFromNow(9, 12, 0),
    end: daysFromNow(9, 13, 0),
    allDay: false,
  },
  {
    id: 'cal-49188',
    title: 'Anime Club Weekly Screening',
    description: 'Two episodes, snacks, and a vote on next term’s lineup.',
    url: 'https://calendar.mit.edu/event/anime-club-weekly-screening',
    location: 'Building 4',
    room: '4-237',
    group: 'MIT Anime Club',
    departments: [],
    types: ['Meetings/Gatherings'],
    keywords: [],
    start: daysFromNow(1, 19, 0),
    end: daysFromNow(1, 21, 0),
    allDay: false,
  },
];

export interface EngageListing {
  id: string;
  title: string;
  organization: string;
  start: string;
  end: string;
  location: string;
  description: string;
  categories: string[];
  perks: string[];
  url: string;
}

export const ENGAGE: EngageListing[] = [
  {
    id: 'engage-2291',
    title: 'Solar Electric Vehicle Team — New Member Night',
    organization: 'MIT Solar Electric Vehicle Team',
    start: daysFromNow(0, 19, 0),
    end: daysFromNow(0, 20, 30),
    location: 'N51-115',
    description:
      'Come see the car. We build a road-legal solar car and race it across Australia. ' +
      'Subteams: composites, electrical, battery, strategy, business. No experience needed, we train you.',
    categories: ['Engineering', 'Club', 'Vehicles'],
    perks: ['Free food'],
    url: 'https://engage.mit.edu/event/2291',
  },
  {
    id: 'engage-2310',
    title: 'Undergraduate Research Opportunities Fair',
    organization: 'MIT UROP Office',
    start: daysFromNow(8, 12, 0),
    end: daysFromNow(8, 15, 0),
    location: 'Walker Memorial (50-340)',
    description:
      'Over 90 labs tabling across all five schools. Talk directly to PIs and grad students about ' +
      'spring UROP openings. Bring a one-page resume. Especially strong turnout this year from CSAIL, ' +
      'the McGovern Institute, and the Koch Institute.',
    categories: ['Research', 'UROP', 'Career'],
    perks: ['Free food', 'Free t-shirt'],
    url: 'https://engage.mit.edu/event/2310',
  },
  {
    id: 'engage-2344',
    title: 'Neurotech@MIT — Intro to BCI Workshop',
    organization: 'Neurotech@MIT',
    start: daysFromNow(4, 13, 0),
    end: daysFromNow(4, 16, 0),
    location: '46-3002 (Singleton Auditorium)',
    description:
      'Hands-on workshop building an EEG-based brain-computer interface. We supply OpenBCI headsets. ' +
      'Signal processing in Python. Good entry point if you are interested in computational neuroscience ' +
      'or neural engineering UROPs.',
    categories: ['Research', 'Workshop', 'Neuroscience'],
    perks: ['Free food'],
    url: 'https://engage.mit.edu/event/2344',
  },
  {
    id: 'engage-2350',
    title: 'Ballroom Dance Team — Beginner Lessons',
    organization: 'MIT Ballroom Dance Team',
    start: daysFromNow(5, 18, 0),
    end: daysFromNow(5, 20, 0),
    location: 'Walker Memorial',
    description: 'No partner or experience needed. First lesson free, $40 for the semester after that.',
    categories: ['Dance', 'Club', 'Social'],
    perks: [],
    url: 'https://engage.mit.edu/event/2350',
  },
  {
    id: 'engage-2377',
    title: 'Sloan VC Panel: Breaking into Venture as a Technical Founder',
    organization: 'MIT Entrepreneurship Club',
    start: daysFromNow(6, 17, 30),
    end: daysFromNow(6, 19, 0),
    location: 'E62-250',
    description:
      'Partners from three seed funds on what they actually look for in technical founders, ' +
      'and how MIT students should think about the research-to-startup path.',
    categories: ['Entrepreneurship', 'Career', 'Panel'],
    perks: ['Free food'],
    url: 'https://engage.mit.edu/event/2377',
  },
  {
    id: 'engage-2390',
    title: 'MIT Outing Club — White Mountains Day Hike',
    organization: 'MIT Outing Club',
    start: daysFromNow(11, 6, 30),
    end: daysFromNow(11, 21, 0),
    location: 'Departs from 77 Mass Ave',
    description: 'Franconia Ridge loop, ~9 miles, strenuous. Gear available to borrow. Sign up in advance, 12 spots.',
    categories: ['Outdoors', 'Club', 'Social'],
    perks: [],
    url: 'https://engage.mit.edu/event/2390',
  },
  {
    id: 'engage-2401',
    title: 'Koch Institute Seminar: Engineering T cells for solid tumors',
    organization: 'Koch Institute for Integrative Cancer Research',
    start: daysFromNow(7, 16, 0),
    end: daysFromNow(7, 17, 0),
    location: '76-156 (Luria Auditorium)',
    description:
      'Prof. Darrell Irvine presents recent work on lymph-node-targeting vaccines that amplify CAR-T ' +
      'activity in solid tumors. Open to undergraduates.',
    categories: ['Research', 'Seminar', 'Biology'],
    perks: [],
    url: 'https://engage.mit.edu/event/2401',
  },
];
