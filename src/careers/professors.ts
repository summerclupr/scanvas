/**
 * Faculty worth talking to, matched to your interests.
 *
 * The rule that shapes this whole file: **no invented contact details.**
 *
 * It would be trivial to generate plausible-looking emails (most MIT faculty
 * are firstname@csail.mit.edu or lastname@mit.edu) and LinkedIn URLs. Both
 * would be wrong often enough to matter, and a student emailing a wrong
 * address or messaging the wrong person is a worse outcome than showing no
 * address at all. So:
 *
 *   homepage   - a real URL, checked by `npm run verify:profs` (HTTP 200)
 *   deptPage   - the department directory entry, same check, when it differs
 *   email      - ONLY when the professor publishes it in plain text on their
 *                own page. Absent for most of them, and the UI says so.
 *   linkedin   - a SEARCH link, never a guessed profile URL
 *   scholar    - a search link, same reasoning
 *
 * Everything here is public directory information. Descriptions are short
 * summaries of publicly stated research areas, not claims about current
 * openings - whether a lab is hiring changes weekly and only the PI knows.
 *
 * Coverage follows the interest chips in onboarding (FIELD_SUGGESTIONS): every
 * field there should surface at least one or two people here.
 */

export interface Professor {
  id: string;
  name: string;
  /** Department plus MIT course number, e.g. "EECS (Course 6)". */
  department: string;
  /** Lab or center affiliation. */
  lab?: string;
  /** Research areas, matched against your interest fields. */
  areas: string[];
  /** Two sentences on what they actually work on. */
  blurb: string;
  /** Verified official page - usually the group or personal site. */
  homepage: string;
  /** Department directory entry, when it's a different page from `homepage`. */
  deptPage?: string;
  /** Only when published in plain text on a public page. */
  email?: string;
  /** Courses they're commonly associated with, for coursework matching. */
  teaches?: string[];
  /**
   * How the MIT subject listing prints them, when it differs from the name
   * people use - "M. Kaashoek" for Frans Kaashoek. Used to find the classes
   * they're listed for this term.
   */
  listedAs?: string;
}

/** LinkedIn has no public person-lookup API; a search is the honest link. */
export function linkedinSearch(name: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
    `${name} MIT`,
  )}`;
}

export function scholarSearch(name: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(`${name} MIT`)}`;
}

/** MIT's people directory, for the email when the homepage doesn't list one. */
export function mitDirectory(name: string): string {
  return `https://web.mit.edu/people/?q=${encodeURIComponent(name)}`;
}

/** "Design and Analysis of Algorithms" -> "design and analysis of algorithms"; strips punctuation for series matching. */
export function seriesKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(week|session|part|no\.?|#)\s*\d+\b/g, ' ')
    .replace(/\b\d{1,2}(\/|-)\d{1,2}\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Does this professor work in (or near) a named field? Substring both ways. */
export function worksIn(prof: Professor, field: string): boolean {
  const f = field.toLowerCase().trim();
  if (f.length < 3) return false;
  return prof.areas.some((a) => {
    const an = a.toLowerCase();
    return an.includes(f) || f.includes(an);
  });
}

export const PROFESSORS: Professor[] = [
  // --- EECS / CSAIL: machine learning, vision, NLP -------------------------
  {
    id: 'barzilay',
    name: 'Regina Barzilay',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / Jameel Clinic',
    areas: ['machine learning', 'natural language processing', 'computational biology'],
    blurb:
      'Machine learning for drug discovery and clinical medicine, plus core NLP. Her group built the mammogram risk models now used in real screening programs.',
    homepage: 'https://www.csail.mit.edu/person/regina-barzilay',
    email: 'regina@csail.mit.edu',
    teaches: ['6.3900', '6.8610'],
  },
  {
    id: 'jaakkola',
    name: 'Tommi Jaakkola',
    department: 'EECS (Course 6)',
    lab: 'CSAIL',
    areas: ['machine learning', 'computational biology', 'theory'],
    blurb:
      'Statistical machine learning: generative models, inference, and learning theory, with a long line of work applying it to molecules and biology. Co-teaches the graduate machine learning course.',
    homepage: 'https://people.csail.mit.edu/tommi/',
    teaches: ['6.7900'],
  },
  {
    id: 'isola',
    name: 'Phillip Isola',
    department: 'EECS (Course 6)',
    lab: 'CSAIL',
    areas: ['computer vision', 'machine learning'],
    blurb:
      'Vision and representation learning - how machines build useful internal pictures of the world. Co-created pix2pix and CycleGAN.',
    homepage: 'https://web.mit.edu/phillipi/',
    teaches: ['6.7960', '6.8300'],
  },
  {
    id: 'andreas',
    name: 'Jacob Andreas',
    department: 'EECS (Course 6)',
    lab: 'CSAIL',
    areas: ['natural language processing', 'machine learning', 'artificial intelligence'],
    blurb:
      'Language as a tool for learning and reasoning: how models ground instructions, explain themselves, and pick up new tasks from a few words. Runs the Language & Intelligence group.',
    homepage: 'https://www.mit.edu/~jda/',
    teaches: ['6.8611'],
  },
  {
    id: 'yoonkim',
    name: 'Yoon Kim',
    department: 'EECS (Course 6)',
    lab: 'CSAIL',
    areas: ['natural language processing', 'machine learning'],
    blurb:
      'Language models and their structure - efficient architectures, in-context learning, and what these systems actually represent. Undergraduates with strong 6.3900 backgrounds have found projects here.',
    homepage: 'https://people.csail.mit.edu/yoonkim/',
    teaches: ['6.8611'],
  },
  {
    id: 'agrawal',
    name: 'Pulkit Agrawal',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / Improbable AI Lab',
    areas: ['robotics', 'machine learning', 'computer vision'],
    blurb:
      'Robot learning: reinforcement learning and sim-to-real for legged locomotion and dexterous manipulation. The lab regularly runs undergraduate projects on real hardware.',
    homepage: 'https://people.csail.mit.edu/pulkitag/',
    email: 'pulkitag@mit.edu',
    teaches: ['6.8200'],
  },
  {
    id: 'tedrake',
    name: 'Russ Tedrake',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / Robot Locomotion Group',
    areas: ['robotics', 'controls', 'machine learning'],
    blurb:
      'Control, planning, and perception for manipulation and walking robots; author of the open Underactuated Robotics and Robotic Manipulation courses. Deep on the mathematics of making robots move.',
    homepage: 'https://groups.csail.mit.edu/locomotion/russt.html',
    teaches: ['6.4210', '6.8210'],
  },
  {
    id: 'rus',
    name: 'Daniela Rus',
    department: 'EECS (Course 6)',
    lab: 'CSAIL (Director)',
    areas: ['robotics', 'machine learning', 'controls'],
    blurb:
      'Distributed robotics, soft robots, and self-driving systems. Directs CSAIL, and the Distributed Robotics Lab regularly takes undergraduate UROPs.',
    homepage: 'https://danielarus.csail.mit.edu/',
    teaches: ['6.4200'],
  },

  // --- EECS / CSAIL: systems, security, data, networks ---------------------
  {
    id: 'zeldovich',
    name: 'Nickolai Zeldovich',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / PDOS',
    areas: ['systems & networking', 'security & cryptography', 'software engineering'],
    blurb:
      'Operating systems and security: verified systems software, and building things whose correctness you can actually prove. The PDOS group is a common home for systems-inclined undergrads.',
    homepage: 'https://www.csail.mit.edu/person/nickolai-zeldovich',
    email: 'nickolai@csail.mit.edu',
    teaches: ['6.1810', '6.5660'],
  },
  {
    id: 'kaashoek',
    name: 'Frans Kaashoek',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / PDOS',
    areas: ['systems & networking', 'software engineering'],
    blurb:
      'Operating systems and distributed systems - the xv6 teaching kernel and MIT’s systems curriculum came out of this group. Co-teaches the OS and distributed-systems classes.',
    homepage: 'https://pdos.csail.mit.edu/~kaashoek/',
    email: 'kaashoek@mit.edu',
    listedAs: 'M. Kaashoek',
    teaches: ['6.1810', '6.5840'],
  },
  {
    id: 'balakrishnan',
    name: 'Hari Balakrishnan',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / Networks & Mobile Systems',
    areas: ['systems & networking', 'mobile computing', 'data science'],
    blurb:
      'Networked and mobile systems: congestion control, sensing from phones and cars, and the data systems behind them. Co-founded Cambridge Mobile Telematics from that research.',
    homepage: 'https://www.csail.mit.edu/person/hari-balakrishnan',
    deptPage: 'https://www.eecs.mit.edu/people/hari-balakrishnan/',
    teaches: ['6.5820'],
  },
  {
    id: 'madden',
    name: 'Sam Madden',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / Data Systems Group',
    areas: ['data science', 'systems & networking', 'machine learning'],
    blurb:
      'Databases and data-intensive systems, from query processing to learned components and data-cleaning tools. Leads the Data Systems Group with Tim Kraska.',
    homepage: 'https://db.csail.mit.edu/madden/',
    teaches: ['6.5830'],
  },
  {
    id: 'kraska',
    name: 'Tim Kraska',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / Data Systems',
    areas: ['data science', 'systems & networking', 'machine learning'],
    blurb:
      'Where databases meet machine learning - learned index structures and systems that tune themselves. Good fit if you like both infrastructure and models.',
    homepage: 'https://www.csail.mit.edu/person/tim-kraska',
    email: 'kraska@mit.edu',
    teaches: ['6.5830'],
  },
  {
    id: 'sanchez',
    name: 'Daniel Sanchez',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / Computer Architecture',
    areas: ['computer architecture', 'hardware', 'systems & networking'],
    blurb:
      'Computer architecture: parallel and specialized hardware, memory systems, and the simulation tools to study them. A natural next step after 6.1910 and 6.5900.',
    homepage: 'https://people.csail.mit.edu/sanchez/',
    teaches: ['6.5900'],
  },
  {
    id: 'vaikuntanathan',
    name: 'Vinod Vaikuntanathan',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / Theory of Computation',
    areas: ['security & cryptography', 'theory', 'mathematics'],
    blurb:
      'Cryptography: lattice-based and fully homomorphic encryption, and the theory of computing on encrypted data. Teaches the core cryptography sequence.',
    homepage: 'https://people.csail.mit.edu/vinodv/',
    email: 'vinodv@csail.mit.edu',
    teaches: ['6.5620', '6.1600'],
  },
  {
    id: 'devadas',
    name: 'Srini Devadas',
    department: 'EECS (Course 6)',
    lab: 'CSAIL',
    areas: ['security & cryptography', 'computer architecture', 'hardware'],
    blurb:
      'Hardware and systems security - secure processors, side channels, and physical unclonable functions. Also a longtime champion of undergraduate teaching and UROPs in Course 6.',
    homepage: 'https://people.csail.mit.edu/devadas/',
    email: 'devadas@mit.edu',
    teaches: ['6.1600', '6.1220'],
  },

  // --- Theory & mathematics -------------------------------------------------
  {
    id: 'demaine',
    name: 'Erik Demaine',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / Theory of Computation',
    areas: ['theory', 'mathematics', 'algorithms'],
    blurb:
      'Computational geometry, folding, and the theory of games and puzzles. Famously open to students who show up with an interesting problem.',
    homepage: 'https://erikdemaine.org/',
    email: 'edemaine@mit.edu',
    teaches: ['6.1220', '6.5440'],
  },
  {
    id: 'rrw',
    name: 'Ryan Williams',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / Theory of Computation',
    areas: ['theory', 'algorithms', 'mathematics'],
    blurb:
      'Computational complexity and algorithms - circuit lower bounds, fine-grained complexity, and the surprising connections between fast algorithms and hardness proofs.',
    homepage: 'https://people.csail.mit.edu/rrw/',
    teaches: ['6.1400'],
  },
  {
    id: 'virgi',
    name: 'Virginia Vassilevska Williams',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / Theory of Computation',
    areas: ['algorithms', 'theory', 'mathematics'],
    blurb:
      'Graph algorithms, matrix multiplication, and fine-grained complexity: what the true running time of fundamental problems is. Teaches the undergraduate algorithms sequence.',
    homepage: 'https://people.csail.mit.edu/virgi/',
    teaches: ['6.1220', '6.5210'],
  },
  {
    id: 'moitra',
    name: 'Ankur Moitra',
    department: 'Mathematics (Course 18)',
    lab: 'CSAIL / Theory of Computation',
    areas: ['theory', 'machine learning', 'mathematics', 'algorithms'],
    blurb:
      'Algorithmic foundations of machine learning - provable guarantees for problems like mixture models, tensor decomposition, and robust statistics. Co-teaches 18.C06.',
    homepage: 'https://people.csail.mit.edu/moitra/',
    teaches: ['18.C06', '18.408'],
  },
  {
    id: 'parrilo',
    name: 'Pablo Parrilo',
    department: 'EECS (Course 6) / LIDS',
    lab: 'Laboratory for Information and Decision Systems',
    areas: ['optimization', 'controls', 'mathematics', 'theory'],
    blurb:
      'Optimization and control: semidefinite programming, sums of squares, and algebraic methods that turn hard nonconvex questions into tractable ones. Co-teaches 18.C06.',
    homepage: 'https://www.mit.edu/~parrilo/',
    email: 'parrilo@mit.edu',
    teaches: ['18.C06', '6.7230'],
  },
  {
    id: 'shor',
    name: 'Peter Shor',
    department: 'Mathematics (Course 18)',
    lab: 'Center for Theoretical Physics',
    areas: ['quantum computing', 'theory', 'mathematics'],
    blurb:
      'Quantum information and quantum algorithms - the factoring algorithm and the first quantum error-correcting codes are his. Teaches the quantum computation class.',
    homepage: 'https://math.mit.edu/~shor/',
    teaches: ['18.435'],
  },

  {
    id: 'goemans',
    name: 'Michel Goemans',
    department: 'Mathematics (Course 18)',
    areas: ['optimization', 'algorithms', 'mathematics', 'theory'],
    blurb:
      'Combinatorial optimization and approximation algorithms - the Goemans-Williamson semidefinite rounding for MAX-CUT is his. Long-time head of the Mathematics department.',
    homepage: 'https://math.mit.edu/~goemans/',
    teaches: ['18.433', '18.453'],
  },
  {
    id: 'kelner',
    name: 'Jonathan Kelner',
    department: 'Mathematics (Course 18)',
    lab: 'CSAIL / Theory of Computation',
    areas: ['algorithms', 'theory', 'mathematics', 'optimization'],
    blurb:
      'Spectral graph theory and fast algorithms: near-linear-time Laplacian solvers, max-flow, and the interplay between linear algebra and graph algorithms.',
    homepage: 'https://math.mit.edu/~kelner/',
  },
  {
    id: 'guth',
    name: 'Larry Guth',
    department: 'Mathematics (Course 18)',
    areas: ['mathematics', 'analysis', 'geometry', 'combinatorics'],
    blurb:
      'Harmonic analysis, geometric measure theory and combinatorics - the polynomial method and its uses in incidence geometry and Fourier restriction. Teaches core analysis.',
    homepage: 'https://math.mit.edu/~lguth/',
  },
  {
    id: 'poonen',
    name: 'Bjorn Poonen',
    department: 'Mathematics (Course 18)',
    areas: ['mathematics', 'number theory', 'algebraic geometry'],
    blurb:
      'Arithmetic geometry: rational points on curves and varieties, and undecidability questions in number theory. Runs the undergraduate number theory sequence some years.',
    homepage: 'https://math.mit.edu/~poonen/',
    teaches: ['18.781'],
  },
  {
    id: 'rigollet',
    name: 'Philippe Rigollet',
    department: 'Mathematics (Course 18)',
    lab: 'Statistics and Data Science Center / IDSS',
    areas: ['statistics', 'machine learning', 'mathematics', 'data science'],
    blurb:
      'High-dimensional statistics, optimal transport and the mathematics of machine learning - what can and cannot be learned from finite data. Teaches the statistics sequence.',
    homepage: 'https://math.mit.edu/~rigollet/',
    teaches: ['18.650', '18.657'],
  },
  {
    id: 'edelman',
    name: 'Alan Edelman',
    department: 'Mathematics (Course 18)',
    lab: 'CSAIL / Julia Lab',
    areas: ['numerical computing', 'mathematics', 'data science', 'software engineering'],
    blurb:
      'Numerical linear algebra, random matrix theory and scientific computing; co-created the Julia language and leads the Julia Lab. Undergraduates contribute to Julia itself.',
    homepage: 'https://math.mit.edu/~edelman/',
    teaches: ['18.337', '18.06'],
  },
  {
    id: 'stevenj',
    name: 'Steven G. Johnson',
    department: 'Mathematics (Course 18) / Physics',
    areas: ['numerical computing', 'mathematics', 'physics', 'photonics'],
    blurb:
      'Computational nanophotonics and numerical methods - the FFTW library and photonic-crystal design come from his group. Teaches numerical analysis and matrix calculus.',
    homepage: 'https://math.mit.edu/~stevenj/',
    teaches: ['18.335', '18.S096'],
  },
  {
    id: 'sheffield',
    name: 'Scott Sheffield',
    department: 'Mathematics (Course 18)',
    areas: ['probability', 'mathematics', 'physics'],
    blurb:
      'Probability theory: random geometry, Liouville quantum gravity, Schramm-Loewner evolution and their links to statistical physics. Teaches the probability courses.',
    homepage: 'https://math.mit.edu/~sheffield/',
    teaches: ['18.600', '18.675'],
  },
  {
    id: 'staffilani',
    name: 'Gigliola Staffilani',
    department: 'Mathematics (Course 18)',
    areas: ['mathematics', 'analysis', 'partial differential equations', 'physics'],
    blurb:
      'Dispersive partial differential equations - nonlinear Schrödinger and wave equations, and what happens to solutions over long times. A frequent undergraduate research mentor.',
    homepage: 'https://math.mit.edu/~gigliola/',
  },
  {
    id: 'dyatlov',
    name: 'Semyon Dyatlov',
    department: 'Mathematics (Course 18)',
    areas: ['mathematics', 'analysis', 'physics', 'quantum chaos'],
    blurb:
      'Microlocal analysis and quantum chaos - scattering resonances, wave decay on black-hole spacetimes, and the fractal uncertainty principle.',
    homepage: 'https://math.mit.edu/~dyatlov/',
  },
  {
    id: 'yun',
    name: 'Zhiwei Yun',
    department: 'Mathematics (Course 18)',
    areas: ['mathematics', 'number theory', 'representation theory', 'algebraic geometry'],
    blurb:
      'Geometric representation theory and the Langlands program - using algebraic geometry to answer questions in number theory.',
    homepage: 'https://math.mit.edu/~zyun/',
  },
  {
    id: 'jerison',
    name: 'David Jerison',
    department: 'Mathematics (Course 18)',
    areas: ['mathematics', 'analysis', 'partial differential equations'],
    blurb:
      'Analysis and partial differential equations - free boundary problems, harmonic analysis, and eigenfunctions. Longtime lecturer of the calculus and analysis sequence, including 18.01/18.02 on OpenCourseWare.',
    homepage: 'https://math.mit.edu/~jerison/',
    teaches: ['18.02', '18.100'],
  },
  {
    id: 'mrowka',
    name: 'Tomasz Mrowka',
    department: 'Mathematics (Course 18)',
    areas: ['mathematics', 'geometry', 'topology'],
    blurb:
      'Low-dimensional topology and gauge theory - instanton and monopole Floer homology, and the structure of knots and 3- and 4-manifolds.',
    homepage: 'https://math.mit.edu/~mrowka/',
    teaches: ['18.901', '18.965'],
  },

  // --- Quantum & physics ----------------------------------------------------
  {
    id: 'chuang',
    name: 'Isaac Chuang',
    department: 'Physics (Course 8) / EECS',
    lab: 'Quanta / RLE',
    areas: ['quantum computing', 'physics', 'hardware'],
    blurb:
      'Quantum computation and trapped-ion systems; co-author of the standard quantum information textbook. Also deeply involved in MIT education research.',
    homepage: 'https://physics.mit.edu/faculty/isaac-chuang/',
    email: 'ichuang@mit.edu',
    teaches: ['8.370', '6.6410'],
  },
  {
    id: 'oliver',
    name: 'William Oliver',
    department: 'EECS (Course 6) / Physics',
    lab: 'Engineering Quantum Systems (EQuS) / RLE',
    areas: ['quantum computing', 'hardware', 'physics'],
    blurb:
      'Superconducting qubits: building and characterizing the actual devices, from coherence and control to multi-qubit processors. Directs the Center for Quantum Engineering.',
    homepage: 'https://equs.mit.edu/',
  },
  {
    id: 'mavalvala',
    name: 'Nergis Mavalvala',
    department: 'Physics (Course 8)',
    lab: 'LIGO / Kavli Institute',
    areas: ['physics', 'astrophysics', 'quantum computing'],
    blurb:
      'Gravitational-wave detection and quantum measurement - squeezed light and the instrumentation that let LIGO hear black-hole mergers. Dean of the School of Science.',
    homepage: 'https://physics.mit.edu/faculty/nergis-mavalvala/',
    email: 'nergis@ligo.mit.edu',
  },
  {
    id: 'tegmark',
    name: 'Max Tegmark',
    department: 'Physics (Course 8)',
    lab: 'Center for Brains, Minds and Machines / IAIFI',
    areas: ['physics', 'machine learning', 'artificial intelligence', 'AI safety', 'cosmology'],
    blurb:
      'Started in precision cosmology and now works on the physics of intelligence - machine learning for physics, mechanistic interpretability, and AI safety. Co-founded the Future of Life Institute.',
    homepage: 'https://physics.mit.edu/faculty/max-tegmark/',
  },
  {
    id: 'thaler',
    name: 'Jesse Thaler',
    department: 'Physics (Course 8)',
    lab: 'Center for Theoretical Physics / IAIFI',
    areas: ['physics', 'machine learning', 'particle physics'],
    blurb:
      'Theoretical particle physics and jet substructure at the LHC, increasingly through machine learning. Directs the NSF AI Institute for Artificial Intelligence and Fundamental Interactions.',
    homepage: 'https://jthaler.net/',
    email: 'jthaler@mit.edu',
    deptPage: 'https://physics.mit.edu/faculty/jesse-thaler/',
  },

  // --- Brain, cognition, biology --------------------------------------------
  {
    id: 'tenenbaum',
    name: 'Joshua Tenenbaum',
    department: 'Brain & Cognitive Sciences (Course 9)',
    lab: 'CoCoSci / CSAIL',
    areas: ['neuroscience', 'machine learning', 'artificial intelligence'],
    blurb:
      'Computational models of human cognition - how people learn so much from so little, and what that implies for AI. Sits between BCS and CSAIL.',
    homepage: 'https://cocosci.mit.edu/josh',
    teaches: ['9.66', '6.4110'],
  },
  {
    id: 'fiete',
    name: 'Ila Fiete',
    department: 'Brain & Cognitive Sciences (Course 9)',
    lab: 'McGovern Institute',
    areas: ['neuroscience', 'computational neuroscience', 'machine learning', 'physics'],
    blurb:
      'Theoretical neuroscience: how neural circuits represent and compute, from grid cells to memory and error correction in the brain. Co-teaches the neural computation class.',
    homepage: 'https://fietelab.mit.edu/',
    teaches: ['9.40'],
  },
  {
    id: 'kanwisher',
    name: 'Nancy Kanwisher',
    department: 'Brain & Cognitive Sciences (Course 9)',
    lab: 'McGovern Institute',
    areas: ['neuroscience', 'cognitive science', 'computer vision'],
    blurb:
      'Functional organization of the human brain - the face and place regions discovered through fMRI, and lately whether deep networks explain them. Her 9.11 lectures are all online.',
    homepage: 'https://web.mit.edu/bcs/nklab/',
    teaches: ['9.11'],
  },
  {
    id: 'boyden',
    name: 'Ed Boyden',
    department: 'Media Lab / BCS (Course 9)',
    lab: 'Synthetic Neurobiology',
    areas: ['neuroscience', 'synthetic biology', 'medical devices'],
    blurb:
      'Tools for reading and writing brain activity - optogenetics and expansion microscopy came out of this group. Strongly hardware- and wet-lab-oriented.',
    homepage: 'https://syntheticneurobiology.org/',
    email: 'edboyden@mit.edu',
  },
  {
    id: 'zhang',
    name: 'Feng Zhang',
    department: 'Biological Engineering (Course 20) / BCS',
    lab: 'Zhang Lab, Broad Institute',
    areas: ['synthetic biology', 'biology', 'computational biology'],
    blurb:
      'CRISPR genome editing and molecular tools for studying and treating disease. The Broad runs a structured undergraduate research pipeline.',
    homepage: 'https://zlab.mit.edu/',
  },
  {
    id: 'berger',
    name: 'Bonnie Berger',
    department: 'Mathematics (Course 18) / EECS',
    lab: 'CSAIL / Computation & Biology group',
    areas: ['computational biology', 'algorithms', 'machine learning'],
    blurb:
      'Algorithms for biology: protein structure and design, compressive genomics, and privacy-preserving analysis of genomic data. Long record of undergraduate coauthors.',
    homepage: 'https://people.csail.mit.edu/bab/',
  },
  {
    id: 'kellis',
    name: 'Manolis Kellis',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / Broad Institute',
    areas: ['computational biology', 'machine learning', 'biology'],
    blurb:
      'Computational genomics and epigenomics - disease circuitry, regulatory genomics, and large-scale human genetics, mostly with machine learning. Teaches the core computational biology class.',
    homepage: 'https://compbio.mit.edu/',
    teaches: ['6.8701'],
  },
  {
    id: 'alm',
    name: 'Eric Alm',
    department: 'Biological Engineering (Course 20)',
    lab: 'Alm Lab / Center for Microbiome Informatics',
    areas: ['computational biology', 'biology', 'data science'],
    blurb:
      'The human microbiome: sequencing, statistics, and engineering of microbial communities, with a strong translational streak. Co-directs the Center for Microbiome Informatics and Therapeutics.',
    homepage: 'https://be.mit.edu/faculty/eric-alm/',
  },

  // --- Chemistry, materials, medical devices -------------------------------
  {
    id: 'swager',
    name: 'Timothy Swager',
    department: 'Chemistry (Course 5)',
    lab: 'Swager Group',
    areas: ['chemistry', 'materials science', 'sensors'],
    blurb:
      'Conjugated polymers and molecular sensors - materials that change their electronic properties when they detect explosives, pathogens, or food spoilage. Several spinouts came from the lab.',
    homepage: 'https://swagergroup.mit.edu/',
  },
  {
    id: 'langer',
    name: 'Robert Langer',
    department: 'Chemical Engineering (Course 10)',
    lab: 'Langer Lab / Koch Institute',
    areas: ['medical devices', 'chemistry', 'biology', 'materials science'],
    blurb:
      'Drug delivery and biomaterials - controlled-release polymers, tissue engineering, and the nanoparticle chemistry behind mRNA vaccines. One of the largest labs at MIT, with many undergraduates.',
    homepage: 'https://langerlab.mit.edu/',
  },
  {
    id: 'roche',
    name: 'Ellen Roche',
    department: 'Mechanical Engineering (Course 2) / IMES',
    lab: 'Therapeutic Technology Design & Development Lab',
    areas: ['medical devices', 'mechanical design', 'soft robotics'],
    blurb:
      'Soft robotic and implantable devices for the heart and other organs - devices that assist, deliver, or repair. Very hands-on; prototyping and benchtop testing are the daily work.',
    homepage: 'https://meche.mit.edu/people/faculty/etr@mit.edu',
    email: 'etr@mit.edu',
  },
  {
    id: 'chiang',
    name: 'Yet-Ming Chiang',
    department: 'Materials Science & Engineering (Course 3)',
    areas: ['materials science', 'energy & climate', 'chemistry'],
    blurb:
      'Battery and electrochemical materials - lithium-ion cathodes, flow batteries, and low-carbon cement. Co-founded A123, 24M, and Form Energy from lab results.',
    homepage: 'https://energy.mit.edu/profile/yet-ming-chiang/',
  },
  {
    id: 'masic',
    name: 'Admir Masic',
    department: 'Civil & Environmental Engineering (Course 1)',
    lab: 'Masic Lab',
    areas: ['materials science', 'chemistry', 'sustainability'],
    blurb:
      'Materials chemistry across millennia - why Roman concrete self-heals, and how those mechanisms inform low-carbon building materials today. Runs an undergraduate archaeological materials program.',
    homepage: 'https://cee.mit.edu/people_individual/admir-masic/',
  },

  // --- Mechanical, aero, energy ----------------------------------------------
  {
    id: 'kim',
    name: 'Sangbae Kim',
    department: 'Mechanical Engineering (Course 2)',
    lab: 'Biomimetic Robotics Lab',
    areas: ['robotics', 'mechanical design', 'controls'],
    blurb:
      'Legged robots that move like animals - the MIT Cheetah came from this lab. Heavy on mechanical design and real hardware.',
    homepage: 'https://meche.mit.edu/people/faculty/sangbae@mit.edu',
    email: 'sangbae@mit.edu',
    teaches: ['2.74', '2.12'],
  },
  {
    id: 'varanasi',
    name: 'Kripa Varanasi',
    department: 'Mechanical Engineering (Course 2)',
    lab: 'Varanasi Research Group',
    areas: ['mechanical design', 'energy & climate', 'materials science'],
    blurb:
      'Interfaces and surfaces: coatings that shed water, ice, and condiment bottles’ last drops, applied to power plants, agriculture, and manufacturing. Several startups spun out of the group.',
    homepage: 'https://varanasi.mit.edu/',
  },
  {
    id: 'gershenfeld',
    name: 'Neil Gershenfeld',
    department: 'Media Lab / Physics (Course 8)',
    lab: 'Center for Bits and Atoms',
    areas: ['hardware', 'materials science', 'mechanical design'],
    blurb:
      'Digital fabrication and the physics of computation - started the global Fab Lab network. Runs "How To Make (Almost) Anything".',
    homepage: 'https://cba.mit.edu/',
    teaches: ['MAS.863'],
  },
  {
    id: 'newman',
    name: 'Dava Newman',
    department: 'Aeronautics & Astronautics (Course 16)',
    lab: 'Media Lab (Director)',
    areas: ['aero/astro', 'medical devices', 'mechanical design'],
    blurb:
      'Human spaceflight and wearable systems - the BioSuit skinsuit concept for planetary EVA. Former NASA Deputy Administrator.',
    homepage: 'https://aeroastro.mit.edu/people/dava-j-newman/',
    email: 'dnewman@mit.edu',
  },
  {
    id: 'how',
    name: 'Jonathan How',
    department: 'Aeronautics & Astronautics (Course 16)',
    lab: 'Aerospace Controls Laboratory',
    areas: ['aero/astro', 'robotics', 'controls', 'machine learning'],
    blurb:
      'Planning and control for autonomous vehicles - multi-agent coordination, learning under uncertainty, and drones and rovers that fly in the lab downstairs.',
    homepage: 'https://acl.mit.edu/',
    teaches: ['16.32', '16.413'],
  },
  {
    id: 'karaman',
    name: 'Sertac Karaman',
    department: 'Aeronautics & Astronautics (Course 16)',
    lab: 'Laboratory for Information and Decision Systems',
    areas: ['aero/astro', 'robotics', 'controls'],
    blurb:
      'Autonomy for fast vehicles: motion planning, perception, and the tiny-drone racing course that became a real class. Co-founded Optimus Ride.',
    homepage: 'https://karaman.mit.edu/',
    teaches: ['16.485'],
  },
  {
    id: 'cahoy',
    name: 'Kerri Cahoy',
    department: 'Aeronautics & Astronautics (Course 16)',
    lab: 'Space Telecommunications, Astronomy and Radiation (STAR) Lab',
    areas: ['aero/astro', 'hardware', 'physics'],
    blurb:
      'Small satellites and space instruments - laser communication CubeSats, exoplanet imaging, and weather sensing from orbit. Students build flight hardware.',
    homepage: 'https://aeroastro.mit.edu/people/kerri-cahoy/',
    email: 'kcahoy@mit.edu',
  },
  {
    id: 'trancik',
    name: 'Jessika Trancik',
    department: 'Institute for Data, Systems, and Society',
    lab: 'Trancik Lab',
    areas: ['energy & climate', 'data science', 'policy & governance', 'economics'],
    blurb:
      'How energy technologies improve and how fast - cost trajectories of solar, batteries, and hydrogen, and what that means for climate policy. Data-heavy, policy-relevant.',
    homepage: 'https://trancik.mit.edu/',
  },
  {
    id: 'selin',
    name: 'Noelle Selin',
    department: 'IDSS / Earth, Atmospheric & Planetary Sciences (Course 12)',
    lab: 'Selin Group',
    areas: ['energy & climate', 'policy & governance', 'chemistry'],
    blurb:
      'Air pollution, mercury, and climate: atmospheric chemistry models coupled to the policy decisions they inform. Directs the Center for Sustainability Science and Strategy.',
    homepage: 'https://idss.mit.edu/staff/noelle-selin/',
  },
  {
    id: 'ferrari',
    name: 'Raffaele Ferrari',
    department: 'Earth, Atmospheric & Planetary Sciences (Course 12)',
    lab: 'Program in Atmospheres, Oceans and Climate',
    areas: ['energy & climate', 'physics', 'mathematics', 'ocean science'],
    blurb:
      'Ocean physics and climate - turbulence, the overturning circulation, and how the ocean takes up heat and carbon. Leads the Climate Modeling Alliance’s ocean effort.',
    homepage: 'https://eaps.mit.edu/people/faculty/raffaele-ferrari/',
  },

  // --- Design, HCI, urbanism ------------------------------------------------
  {
    id: 'satyanarayan',
    name: 'Arvind Satyanarayan',
    department: 'EECS (Course 6)',
    lab: 'CSAIL / Visualization Group',
    areas: ['design & HCI', 'data science', 'human-computer interaction'],
    blurb:
      'Data visualization and interactive systems - Vega-Lite came out of his work, and the group studies how people read, build, and are misled by charts. Teaches the visualization class.',
    homepage: 'https://arvindsatya.com/',
    email: 'arvindsatya@mit.edu',
    teaches: ['6.C35'],
  },
  {
    id: 'mueller',
    name: 'Stefanie Mueller',
    department: 'EECS (Course 6) / MechE',
    lab: 'CSAIL / HCI Engineering Group',
    areas: ['design & HCI', 'hardware', 'mechanical design'],
    blurb:
      'Human-computer interaction meets fabrication: programmable materials, reprogrammable surfaces, and personal fabrication tools. Projects tend to involve lasers, printers, and a lot of prototyping.',
    homepage: 'https://hcie.csail.mit.edu/',
    teaches: ['6.8510'],
  },
  {
    id: 'tibbits',
    name: 'Skylar Tibbits',
    department: 'Architecture (Course 4)',
    lab: 'Self-Assembly Lab',
    areas: ['design & HCI', 'materials science', 'mechanical design'],
    blurb:
      'Self-assembling and programmable materials - structures that build themselves from turbulence, 4D printing, and active textiles. Architecture and engineering students work side by side.',
    homepage: 'https://selfassemblylab.mit.edu/',
  },
  {
    id: 'williams-s',
    name: 'Sarah Williams',
    department: 'Urban Studies & Planning (Course 11)',
    lab: 'Civic Data Design Lab',
    areas: ['urban studies', 'data science', 'design & HCI', 'policy & governance'],
    blurb:
      'Data, maps, and cities: using civic data and visualization to make urban policy legible and contestable, from Nairobi’s matatu routes to housing in New York.',
    homepage: 'https://civicdatadesignlab.mit.edu/',
  },
  {
    id: 'ratti',
    name: 'Carlo Ratti',
    department: 'Urban Studies & Planning (Course 11)',
    lab: 'Senseable City Lab',
    areas: ['urban studies', 'data science', 'design & HCI'],
    blurb:
      'Sensing cities: mobility, waste, and social data at urban scale, turned into research and design projects with cities around the world. The lab is large and takes undergraduates.',
    homepage: 'https://dusp.mit.edu/people/carlo-ratti',
  },

  // --- Economics, policy, entrepreneurship ----------------------------------
  {
    id: 'duflo',
    name: 'Esther Duflo',
    department: 'Economics (Course 14)',
    lab: 'J-PAL (Co-founder)',
    areas: ['economics', 'policy & governance', 'development'],
    blurb:
      'Development economics through randomized evaluations - what actually reduces poverty, measured. Nobel laureate; co-teaches the undergraduate poverty class.',
    homepage: 'https://economics.mit.edu/people/faculty/esther-duflo',
    email: 'eduflo@mit.edu',
    teaches: ['14.73'],
  },
  {
    id: 'acemoglu',
    name: 'Daron Acemoglu',
    department: 'Economics (Course 14)',
    areas: ['economics', 'policy & governance', 'artificial intelligence'],
    blurb:
      'Political economy, institutions, and lately the economics of automation and AI - who gains, who loses, and what policy can do. Nobel laureate.',
    homepage: 'https://economics.mit.edu/people/faculty/daron-acemoglu',
    email: 'daron@mit.edu',
  },
  {
    id: 'finkelstein',
    name: 'Amy Finkelstein',
    department: 'Economics (Course 14)',
    lab: 'J-PAL North America (Co-scientific director)',
    areas: ['economics', 'policy & governance', 'health'],
    blurb:
      'Health economics and public finance - the Oregon health insurance experiment, hospital spending, and what insurance markets do. Empirical, data-intensive work with undergraduate RAs.',
    homepage: 'https://economics.mit.edu/people/faculty/amy-finkelstein',
    email: 'afink@mit.edu',
  },
  {
    id: 'lo',
    name: 'Andrew Lo',
    department: 'Sloan (Course 15)',
    lab: 'Laboratory for Financial Engineering',
    areas: ['quantitative finance', 'economics', 'data science'],
    blurb:
      'Quantitative finance and the economics of drug development - adaptive markets, and financing biomedical research with portfolio theory.',
    homepage: 'https://alo.mit.edu/',
    teaches: ['15.401', '15.450'],
  },
  {
    id: 'aulet',
    name: 'Bill Aulet',
    department: 'Sloan (Course 15)',
    lab: 'Martin Trust Center for MIT Entrepreneurship (Managing Director)',
    areas: ['entrepreneurship', 'design & HCI'],
    blurb:
      'Teaches entrepreneurship as a discipline - the "Disciplined Entrepreneurship" framework and the New Enterprises class that many MIT startups begin in. Runs the Trust Center and delta v.',
    homepage: 'https://entrepreneurship.mit.edu/profile/bill-aulet/',
    teaches: ['15.390'],
  },
  {
    id: 'stern',
    name: 'Scott Stern',
    department: 'Sloan (Course 15)',
    areas: ['entrepreneurship', 'economics', 'policy & governance'],
    blurb:
      'Economics of innovation and entrepreneurial strategy - how startups choose which market to enter and how regions build innovation ecosystems. Teaches the entrepreneurial strategy class.',
    homepage: 'https://mitsloan.mit.edu/faculty/directory/scott-stern',
    email: 'sstern@mit.edu',
    teaches: ['15.911'],
  },
];
