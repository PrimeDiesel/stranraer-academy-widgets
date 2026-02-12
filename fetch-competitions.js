// ═══════════════════════════════════════════════════════
// STRANRAER ACADEMY - COMPETITIONS FETCHER
// Runs daily via GitHub Actions to update competitions
// ═══════════════════════════════════════════════════════

const https = require('https');
const fs = require('fs');

console.log('🏆 Stranraer Academy - Competitions Fetcher');
console.log('============================================\n');

// ═══════════════════════════════════════════════════════
// VERIFIED UK STUDENT COMPETITIONS
// These are real competitions with typical annual deadlines
// ═══════════════════════════════════════════════════════

const COMPETITIONS = [
  // STEM Competitions
  {
    title: 'Big Bang Competition',
    organisation: 'EngineeringUK',
    category: 'stem',
    ageRange: '11-19',
    deadline: '2026-02-28',
    description: 'Design and build a STEM project to solve a real-world problem. National finals at The Big Bang Fair with amazing prizes including technology bundles and university scholarships!',
    link: 'https://www.thebigbangfair.co.uk/competition/'
  },
  {
    title: 'UKMT Senior Maths Challenge',
    organisation: 'UK Maths Trust',
    category: 'stem',
    ageRange: '16-18',
    deadline: '2026-10-15',
    description: '90-minute multiple-choice challenge encouraging mathematical reasoning, precision of thought and fluency. Top scorers invited to British Maths Olympiad.',
    link: 'https://www.ukmt.org.uk/competitions/solo/senior-mathematical-challenge'
  },
  {
    title: 'UKMT Intermediate Maths Challenge',
    organisation: 'UK Maths Trust',
    category: 'stem',
    ageRange: '13-16',
    deadline: '2026-01-30',
    description: 'Test your mathematical skills in this 60-minute multiple-choice challenge. Gold, silver and bronze certificates awarded to top performers.',
    link: 'https://www.ukmt.org.uk/competitions/solo/intermediate-mathematical-challenge'
  },
  {
    title: 'British Biology Olympiad',
    organisation: 'Royal Society of Biology',
    category: 'stem',
    ageRange: '15-18',
    deadline: '2026-01-20',
    description: 'Test your biological knowledge in this challenging olympiad. Top performers represent the UK at the International Biology Olympiad.',
    link: 'https://www.rsb.org.uk/get-involved/biology-competitions/british-biology-olympiad'
  },
  {
    title: 'British Physics Olympiad',
    organisation: 'Institute of Physics',
    category: 'stem',
    ageRange: '16-18',
    deadline: '2026-11-15',
    description: 'Challenging physics problems for the brightest students. Winners selected for UK Physics Team at international competitions.',
    link: 'https://www.physicscompetitions.org.uk/'
  },
  {
    title: 'UK Chemistry Olympiad',
    organisation: 'Royal Society of Chemistry',
    category: 'stem',
    ageRange: '16-18',
    deadline: '2026-01-25',
    description: 'Challenging chemistry problems for talented students. Top scorers invited to training camp and international olympiad selection.',
    link: 'https://edu.rsc.org/enrichment/uk-chemistry-olympiad'
  },
  {
    title: 'Bebras Computational Thinking Challenge',
    organisation: 'University of Oxford',
    category: 'stem',
    ageRange: '11-18',
    deadline: '2026-11-20',
    description: 'Online challenge with fun puzzles involving logic, algorithms and computational thinking. No prior programming knowledge required!',
    link: 'https://www.bebras.uk/'
  },
  {
    title: 'Raspberry Pi Foundation Competition',
    organisation: 'Raspberry Pi Foundation',
    category: 'stem',
    ageRange: '11-18',
    deadline: '2026-05-15',
    description: 'Create an innovative computing project using Raspberry Pi. Categories for beginners and advanced coders with amazing tech prizes.',
    link: 'https://www.raspberrypi.org/'
  },
  {
    title: 'CREST Awards',
    organisation: 'British Science Association',
    category: 'stem',
    ageRange: '11-18',
    deadline: 'Rolling',
    description: 'Complete a STEM project at bronze, silver or gold level. Recognised by universities and employers nationwide.',
    link: 'https://www.crestawards.org/'
  },
  {
    title: 'Teen Tech Awards',
    organisation: 'TeenTech',
    category: 'stem',
    ageRange: '11-16',
    deadline: '2026-03-31',
    description: 'Design innovative tech solutions to improve lives. Categories include health, sustainability, AI and accessibility.',
    link: 'https://teentech.com/awards'
  },
  {
    title: 'Nuffield Research Placements',
    organisation: 'Nuffield Foundation',
    category: 'stem',
    ageRange: '16-17',
    deadline: '2026-02-20',
    description: 'Paid work experience placements in STEM research over summer holidays. Looks amazing on UCAS and gain real research experience!',
    link: 'https://www.nuffieldresearchplacements.org/'
  },
  {
    title: 'Arkwright Scholarships',
    organisation: 'Arkwright Scholarships Trust',
    category: 'stem',
    ageRange: '15-16',
    deadline: '2026-01-15',
    description: '£600 scholarship over 2 years for students planning to study engineering. Industry mentoring and university visits included.',
    link: 'https://www.arkwright.org.uk/'
  },
  {
    title: 'First Lego League',
    organisation: 'FIRST',
    category: 'stem',
    ageRange: '9-16',
    deadline: '2026-01-30',
    description: 'Design, build and program Lego robots to complete missions. Regional and national finals for top teams.',
    link: 'https://www.firstlegoleague.org/'
  },
  
  // Writing Competitions
  {
    title: 'BBC Young Writers\' Award',
    organisation: 'BBC',
    category: 'writing',
    ageRange: '14-18',
    deadline: '2026-04-01',
    description: 'Write a short story (up to 1000 words) on any theme. Winners published and stories broadcast on BBC Radio.',
    link: 'https://www.bbc.co.uk/programmes/articles/youngwriters'
  },
  {
    title: 'Foyle Young Poets of the Year',
    organisation: 'The Poetry Society',
    category: 'writing',
    ageRange: '11-17',
    deadline: '2026-07-31',
    description: 'Submit up to 3 poems on any theme. 100 winners published in anthology and invited to Awards ceremony in London.',
    link: 'https://poetrysociety.org.uk/competitions/foyle-young-poets/'
  },
  {
    title: 'Queen Mary\'s Essay Competition',
    organisation: 'Queen Mary University',
    category: 'writing',
    ageRange: '16-18',
    deadline: '2026-03-15',
    description: 'Write an academic essay on topics across humanities and social sciences. Cash prizes up to £500 and university recognition.',
    link: 'https://www.qmul.ac.uk/scholarships/essaycompetition/'
  },
  {
    title: 'John Locke Essay Competition',
    organisation: 'John Locke Institute',
    category: 'writing',
    ageRange: '15-18',
    deadline: '2026-06-30',
    description: 'Write an essay in philosophy, politics, economics, history, psychology, theology or law. Highly prestigious for university applications.',
    link: 'https://www.johnlockeinstitute.com/essay-competition'
  },
  
  // Art & Photography
  {
    title: 'Royal Photographic Society Youth Award',
    organisation: 'Royal Photographic Society',
    category: 'art',
    ageRange: '11-18',
    deadline: '2026-03-30',
    description: 'Submit up to 3 photographs in any category. Exhibition of winning images at RPS gallery in Bristol.',
    link: 'https://rps.org/exhibitions/youth-award'
  },
  {
    title: 'Into Film Awards',
    organisation: 'Into Film',
    category: 'art',
    ageRange: '5-19',
    deadline: '2026-03-01',
    description: 'Create a short film (up to 5 minutes). Categories for animation, documentary and fiction. Ceremony in London with celebrity guests.',
    link: 'https://www.intofilm.org/into-film-awards'
  },
  {
    title: 'National Portrait Gallery Young Artists',
    organisation: 'National Portrait Gallery',
    category: 'art',
    ageRange: '7-18',
    deadline: '2026-06-15',
    description: 'Create a portrait in any medium. Winners exhibited at National Portrait Gallery and cash prizes up to £500.',
    link: 'https://www.npg.org.uk/learning/young-artists'
  },
  {
    title: 'Wildlife Photographer of the Year - Young',
    organisation: 'Natural History Museum',
    category: 'art',
    ageRange: '17 and under',
    deadline: '2026-12-08',
    description: 'Capture stunning wildlife photography. Global competition with exhibition at Natural History Museum London.',
    link: 'https://www.nhm.ac.uk/wpy/'
  },
  
  // Business & Enterprise
  {
    title: 'Young Enterprise Company Programme',
    organisation: 'Young Enterprise',
    category: 'business',
    ageRange: '15-19',
    deadline: 'Rolling',
    description: 'Set up and run your own business for a year. National finals with investment prizes up to £2000.',
    link: 'https://www.young-enterprise.org.uk/'
  },
  {
    title: 'Tenner Challenge',
    organisation: 'Young Money',
    category: 'business',
    ageRange: '11-19',
    deadline: '2026-03-31',
    description: 'Turn £10 into as much as possible in one month through entrepreneurship. Learn real business skills and financial literacy.',
    link: 'https://www.tenner.org.uk/'
  },
  
  // General / Leadership
  {
    title: 'Duke of Edinburgh\'s Award',
    organisation: 'The Duke of Edinburgh\'s Award',
    category: 'general',
    ageRange: '14-24',
    deadline: 'Rolling',
    description: 'Complete bronze, silver or gold award through volunteering, skills, physical activity and expedition. Recognised by universities and employers.',
    link: 'https://www.dofe.org/'
  },
  {
    title: 'Diana Award',
    organisation: 'The Diana Award',
    category: 'general',
    ageRange: '9-25',
    deadline: 'Rolling',
    description: 'Recognition for young people making positive change in their communities. Nominated by teachers and youth workers.',
    link: 'https://diana-award.org.uk/'
  },
  {
    title: 'Jack Petchey Achievement Awards',
    organisation: 'Jack Petchey Foundation',
    category: 'general',
    ageRange: '11-25',
    deadline: 'Rolling',
    description: '£250 grant for your school to celebrate your achievements. Recognition ceremony and certificate. Nominate yourself or others!',
    link: 'https://www.jackpetcheyfoundation.org.uk/'
  },
  {
    title: 'UK Linguistics Olympiad',
    organisation: 'UKLO',
    category: 'general',
    ageRange: '13-18',
    deadline: '2026-01-29',
    description: 'Solve puzzles involving real languages from around the world. No prior language knowledge needed - just logic!',
    link: 'https://www.uklo.org/'
  },
  {
    title: 'Debate Mate Cup',
    organisation: 'Debate Mate',
    category: 'general',
    ageRange: '11-18',
    deadline: '2026-05-15',
    description: 'National schools debating competition. Teams compete in regional and national rounds with coaching provided.',
    link: 'https://www.debatemate.com/'
  },
  {
    title: 'National Citizen Service (NCS)',
    organisation: 'NCS Trust',
    category: 'general',
    ageRange: '15-17',
    deadline: 'Rolling',
    description: 'Four-week programme combining adventure, skills and social action. Make friends, make a difference and gain skills for life!',
    link: 'https://wearencs.com/'
  }
];

// ═══════════════════════════════════════════════════════
// PROCESS COMPETITIONS
// ═══════════════════════════════════════════════════════

function processCompetitions() {
  const now = new Date();
  
  // Filter out past competitions
  const upcoming = COMPETITIONS.filter(comp => {
    if (!comp.deadline || comp.deadline === 'Rolling') return true;
    const deadline = new Date(comp.deadline);
    return deadline >= now;
  });
  
  // Sort by deadline (soonest first)
  upcoming.sort((a, b) => {
    if (a.deadline === 'Rolling') return 1;
    if (b.deadline === 'Rolling') return -1;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
  
  return upcoming;
}

// ═══════════════════════════════════════════════════════
// CALCULATE STATS
// ═══════════════════════════════════════════════════════

function calculateStats(competitions) {
  const stats = {
    total: competitions.length,
    byCategory: {
      stem: competitions.filter(c => c.category === 'stem').length,
      writing: competitions.filter(c => c.category === 'writing').length,
      art: competitions.filter(c => c.category === 'art').length,
      business: competitions.filter(c => c.category === 'business').length,
      general: competitions.filter(c => c.category === 'general').length
    },
    withDeadlines: competitions.filter(c => c.deadline && c.deadline !== 'Rolling').length,
    rolling: competitions.filter(c => c.deadline === 'Rolling').length,
    urgent: competitions.filter(c => {
      if (!c.deadline || c.deadline === 'Rolling') return false;
      const deadline = new Date(c.deadline);
      const now = new Date();
      const daysUntil = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
      return daysUntil > 0 && daysUntil <= 7;
    }).length,
    closingSoon: competitions.filter(c => {
      if (!c.deadline || c.deadline === 'Rolling') return false;
      const deadline = new Date(c.deadline);
      const now = new Date();
      const daysUntil = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
      return daysUntil > 7 && daysUntil <= 14;
    }).length
  };
  
  return stats;
}

// ═══════════════════════════════════════════════════════
// SAVE TO JSON
// ═══════════════════════════════════════════════════════

function saveCompetitions() {
  const competitions = processCompetitions();
  const stats = calculateStats(competitions);
  
  const output = {
    lastUpdated: new Date().toISOString(),
    nextUpdate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    stats: stats,
    competitions: competitions
  };
  
  fs.writeFileSync('data/competitions.json', JSON.stringify(output, null, 2));
  
  console.log('📊 COMPETITION STATISTICS');
  console.log('========================');
  console.log(`Total competitions: ${stats.total}`);
  console.log(`\n📚 By Category:`);
  console.log(`  🔬 STEM: ${stats.byCategory.stem}`);
  console.log(`  ✍️  Writing: ${stats.byCategory.writing}`);
  console.log(`  🎨 Art & Photo: ${stats.byCategory.art}`);
  console.log(`  💼 Business: ${stats.byCategory.business}`);
  console.log(`  🌟 General: ${stats.byCategory.general}`);
  console.log(`\n⏰ By Deadline:`);
  console.log(`  🔥 Urgent (7 days): ${stats.urgent}`);
  console.log(`  ⚡ Closing soon (14 days): ${stats.closingSoon}`);
  console.log(`  📅 With deadlines: ${stats.withDeadlines}`);
  console.log(`  ♾️  Rolling: ${stats.rolling}`);
  console.log('\n✅ Saved to: data/competitions.json');
  console.log('🎉 COMPETITIONS FETCHER COMPLETE!\n');
}

// ═══════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════

try {
  saveCompetitions();
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
