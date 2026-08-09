const data = require('./trackers.json');

for (const categoryName of Object.keys(data.categories)) {
  const companies = data.categories[categoryName];
  companies.forEach((companyEntry) => {
    const companyName = Object.keys(companyEntry)[0];
    const homepages = companyEntry[companyName];
    for (const homepageUrl of Object.keys(homepages)) {
      const domains = homepages[homepageUrl];
      if (!Array.isArray(domains)) {
        console.log('BAD ENTRY FOUND:');
        console.log('Category:', categoryName);
        console.log('Company:', companyName);
        console.log('Homepage:', homepageUrl);
        console.log('Value:', JSON.stringify(domains));
        process.exit(0);
      }
    }
  });
}

console.log('No bad entries found');
