const fs = require('fs');

function buildTrackerLookup() {
  const data = JSON.parse(fs.readFileSync('./trackers.json', 'utf8'));
  const lookup = {};

  for (const categoryName of Object.keys(data.categories)) {
    const companies = data.categories[categoryName];

    companies.forEach((companyEntry) => {
      const companyName = Object.keys(companyEntry)[0];
      const homepages = companyEntry[companyName];

      for (const homepageUrl of Object.keys(homepages)) {
        const domains = homepages[homepageUrl];

        if (!Array.isArray(domains)) {
          continue;
        }

        domains.forEach((domain) => {
          // If this domain has never been seen before, start a new empty list for it.
          if (!lookup[domain]) {
            lookup[domain] = [];
          }

          // Add this match to the list instead of overwriting.
          lookup[domain].push({
            company: companyName,
            category: categoryName,
          });
        });
      }
    });
  }

  return lookup;
}

module.exports = { buildTrackerLookup };
