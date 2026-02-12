// SMART fetch-competitions.js - AUTO-UPDATES DEADLINES!
// GitHub Actions runs this daily to keep competitions fresh

const fs = require('fs');
const path = require('path');

// COMPETITION TEMPLATES with annual patterns
// GitHub Actions auto-calculates next year's deadline!
const COMPETITION_TEMPLATES = [
  // STEM - 8 TOTAL
  {
    title: 'Big Bang Competition',
    organisation: 'EngineeringUK',
    category: 'stem',
    ageRange: '11-19',
    deadlineMonth: 2,  // February
    deadlineDay: 28,
    description: 'Design and build a STEM project to solve a real-world problem. National finals at The Big Bang Fair.',
    link: 'https://www.thebigbangcompetition.co.uk/',
    annual: true
  },
  {
    title: 'UKMT Maths Challenge - Senior',
    organisation: 'UK Maths Trust',
    category: 'stem',
    ageRange: '16-18',
    deadlineMonth: 10,  // October
    deadlineDay: 15,
    description: 'Multiple choice maths challenge testing problem-solving skills. Top scorers invited to follow-on rounds.',
    link: 'https://www.ukmt.org.uk/',
    annual: true
  },
  {
    title: 'UKMT Maths Challenge - Intermediate',
    organisation: 'UK Maths Trust',
    category: 'stem',
    ageRange: '13-16',
    deadlineMonth: 1,  // January
    deadlineDay: 30,
    description: 'Fun maths challenge encouraging logical thinking. Over 250,000 students participate annually.',
    link: 'https://www.ukmt.org.uk/',
    annual: true
  },
  {
    title: 'Bebras Computing Challenge',
    organisation: 'Bebras UK',
    category: 'stem',
    ageRange: '11-18',
    deadlineMonth: 11,  // November
    deadlineDay: 20,
    description: 'International challenge introducing computational thinking through fun puzzles. No coding experience needed!',
    link: 'https://www.bebras.uk/',
    annual: true
  },
  {
    title: 'CREST Awards',
    organisation: 'British Science Association',
    category: 'stem',
    ageRange: '11-18',
    deadline: 'Rolling',
    description: 'Complete your own STEM project at Bronze, Silver or Gold level. Recognized by UCAS.',
    link: 'https://www.crestawards.org/',
    annual: false
  },
  {
    title: 'Teen Tech Awards',
    organisation: 'Teen Tech',
    category: 'stem',
    ageRange: '11-18',
    deadlineMonth: 3,  // March
    deadlineDay: 31,
    description: 'Invent something to make life better, simpler, safer or more fun using technology.',
    link: 'https://teentech.com/',
    annual: true
  },
  {
    title: 'Nuffield Research Placements',
    organisation: 'Nuffield Foundation',
    category: 'stem',
    ageRange: '16-17',
    deadlineMonth: 2,  // February
    deadlineDay: 20,
    description: 'Four-week paid research placement with scientists or engineers. Excellent for university applications.',
    link: 'https://www.nuffieldresearchplacements.org/',
    annual: true
  },
  {
    title: 'First Lego League',
    organisation: 'FIRST',
    category: 'stem',
    ageRange: '9-16',
    deadlineMonth: 12,  // December
    deadlineDay: 1,
    description: 'Build and program a Lego robot to complete missions. Teamwork and problem-solving combined!',
    link: 'https://www.firstlegoleague.org/',
    annual: true
  },

  // WRITING - 4 TOTAL
  {
    title: 'BBC Young Writers\' Award',
    organisation: 'BBC',
    category: 'writing',
    ageRange: '14-18',
    deadlineMonth: 4,  // April
    deadlineDay: 1,
    description: 'Write a short story (up to 1000 words) on any theme. Winners published.',
    link: 'https://www.bbc.co.uk/programmes/p00rfvk1',
    annual: true
  },
  {
    title: 'Foyle Young Poets',
    organisation: 'The Poetry Society',
    category: 'writing',
    ageRange: '11-17',
    deadlineMonth: 7,  // July
    deadlineDay: 31,
    description: 'Submit up to 3 poems on any theme. 100 winners published in anthology.',
    link: 'https://poetrysociety.org.uk/',
    annual: true
  },
  {
    title: 'Young Science Writer',
    organisation: 'British Science Association',
    category: 'writing',
    ageRange: '14-18',
    deadlineMonth: 3,  // March
    deadlineDay: 10,
    description: 'Write a 600-800 word article explaining a scientific concept.',
    link: 'https://www.britishscienceassociation.org/',
    annual: true
  },
  {
    title: 'John Locke Essay Competition',
    organisation: 'John Locke Institute',
    category: 'writing',
    ageRange: '15-18',
    deadlineMonth: 6,  // June
    deadlineDay: 30,
    description: 'Write an essay in philosophy, politics, economics, history, psychology, theology or law.',
    link: 'https://www.johnlockeinstitute.com/',
    annual: true
  },

  // ART - 4 TOTAL
  {
    title: 'Royal Photographic Society Youth',
    organisation: 'Royal Photographic Society',
    category: 'art',
    ageRange: '11-18',
    deadlineMonth: 3,  // March
    deadlineDay: 30,
    description: 'Submit up to 3 photographs in any category. Exhibition of winning images.',
    link: 'https://rps.org/',
    annual: true
  },
  {
    title: 'Into Film Awards',
    organisation: 'Into Film',
    category: 'art',
    ageRange: '5-19',
    deadlineMonth: 3,  // March
    deadlineDay: 1,
    description: 'Create a short film (up to 5 minutes). Categories for animation, documentary and fiction.',
    link: 'https://www.intofilm.org/',
    annual: true
  },
  {
    title: 'Wildlife Photographer of the Year',
    organisation: 'Natural History Museum',
    category: 'art',
    ageRange: '17 and under',
    deadlineMonth: 12,  // December
    deadlineDay: 8,
    description: 'Capture stunning wildlife photography. Global competition with exhibition at Natural History Museum.',
    link: 'https://www.nhm.ac.uk/',
    annual: true
  },
  {
    title: 'Royal Academy Young Artists',
    organisation: 'Royal Academy',
    category: 'art',
    ageRange: '4-19',
    deadlineMonth: 2,  // February
    deadlineDay: 20,
    description: 'Submit artwork in any medium for exhibition at the Royal Academy.',
    link: 'https://www.royalacademy.org.uk/',
    annual: true
  },

  // BUSINESS - 2 TOTAL
  {
    title: 'Young Enterprise',
    organisation: 'Young Enterprise',
    category: 'business',
    ageRange: '15-19',
    deadline: 'Rolling',
    description: 'Set up and run your own business for a year. National finals with investment prizes.',
    link: 'https://www.young-enterprise.org.uk/',
    annual: false
  },
  {
    title: 'Tenner Challenge',
    organisation: 'Young Money',
    category: 'business',
    ageRange: '11-19',
    deadlineMonth: 3,  // March
    deadlineDay: 31,
    description: 'Turn £10 into as much as possible in one month through entrepreneurship.',
    link: 'https://www.tenner.org.uk/',
    annual: true
  },

  // GENERAL - 5 TOTAL
  {
    title: 'Duke of Edinburgh\'s Award',
    organisation: 'The Duke of Edinburgh\'s Award',
    category: 'general',
    ageRange: '14-24',
    deadline: 'Rolling',
    description: 'Complete bronze, silver or gold award through volunteering, skills, physical activity and expedition.',
    link: 'https://www.dofe.org/',
    annual: false
  },
  {
    title: 'Diana Award',
    organisation: 'The Diana Award',
    category: 'general',
    ageRange: '9-25',
    deadline: 'Rolling',
    description: 'Recognition for young people making positive change in their communities.',
    link: 'https://diana-award.org.uk/',
    annual: false
  },
  {
    title: 'Jack Petchey Achievement Awards',
    organisation: 'Jack Petchey Foundation',
    category: 'general',
    ageRange: '11-25',
    deadline: 'Rolling',
    description: '£250 grant for your school to celebrate your achievements.',
    link: 'https://www.jackpetcheyfoundation.org.uk/',
    annual: false
  },
  {
    title: 'UK Linguistics Olympiad',
    organisation: 'UKLO',
    category: 'general',
    ageRange: '13-18',
    deadlineMonth: 1,  // January
    deadlineDay: 29,
    description: 'Solve puzzles involving real languages from around the world. No prior language knowledge needed!',
    link: 'https://www.uklo.org/',
    annual: true
  },
  {
    title: 'National Citizen Service',
    organisation: 'NCS Trust',
    category: 'general',
    ageRange: '15-17',
    deadline: 'Rolling',
    description: 'Four-week programme combining adventure, skills and social action.',
    link: 'https://wearencs.com/',
    annual: false
  }
];

// SMART DEADLINE CALCULATOR
function calculateDeadline(template) {
  if (template.deadline === 'Rolling') {
    return 'Rolling';
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  // Calculate this year's deadline
  let year = currentYear;
  let month = template.deadlineMonth;
  let day = template.deadlineDay;
  
  let deadline = new Date(year, month - 1, day);
  
  // If deadline has passed, use next year
  if (deadline < now) {
    year = currentYear + 1;
    deadline = new Date(year, month - 1, day);
  }
  
  return deadline.toISOString().split('T')[0];
}

// Generate competitions with auto-calculated deadlines
const competitions = COMPETITION_TEMPLATES.map(template => {
  const comp = { ...template };
  
  if (template.annual) {
    comp.deadline = calculateDeadline(template);
    delete comp.deadlineMonth;
    delete comp.deadlineDay;
  }
  
  delete comp.annual;
  return comp;
});

// Filter valid ones (should keep all with auto-calculated deadlines)
const validComps = competitions.filter(comp => {
  if (comp.deadline === 'Rolling') return true;
  const deadline = new Date(comp.deadline);
  const now = new Date();
  return deadline > now;
}).sort((a, b) => {
  if (a.deadline === 'Rolling') return 1;
  if (b.deadline === 'Rolling') return -1;
  return new Date(a.deadline) - new Date(b.deadline);
});

// Calculate stats
const stats = {
  total: validComps.length,
  byCategory: {
    stem: validComps.filter(c => c.category === 'stem').length,
    writing: validComps.filter(c => c.category === 'writing').length,
    art: validComps.filter(c => c.category === 'art').length,
    business: validComps.filter(c => c.category === 'business').length,
    general: validComps.filter(c => c.category === 'general').length
  },
  withDeadlines: validComps.filter(c => c.deadline !== 'Rolling').length,
  rolling: validComps.filter(c => c.deadline === 'Rolling').length,
  urgent: 0,
  closingSoon: 0
};

validComps.forEach(comp => {
  if (comp.deadline === 'Rolling') return;
  const deadline = new Date(comp.deadline);
  const now = new Date();
  const days = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
  if (days <= 7) stats.urgent++;
  else if (days <= 14) stats.closingSoon++;
});

const output = {
  lastUpdated: new Date().toISOString(),
  nextUpdate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  stats,
  competitions: validComps
};

// Save
const outputPath = path.join(__dirname, 'data', 'competitions.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log('✅ SMART AUTO-UPDATE COMPLETE!');
console.log(`📊 Total: ${stats.total} competitions`);
console.log(`   STEM: ${stats.byCategory.stem}`);
console.log(`   Writing: ${stats.byCategory.writing}`);
console.log(`   Art: ${stats.byCategory.art}`);
console.log(`   Business: ${stats.byCategory.business}`);
console.log(`   General: ${stats.byCategory.general}`);
console.log(`🔥 Urgent (≤7 days): ${stats.urgent}`);
console.log(`⚡ Closing Soon (≤14 days): ${stats.closingSoon}`);
console.log('');
console.log('📅 Next deadlines auto-calculated for next year when they pass!');
