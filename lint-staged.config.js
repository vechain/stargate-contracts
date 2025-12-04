const workspaceFilters = [
  { pathPrefix: 'apps/frontend/', turboFilter: 'frontend' },
  { pathPrefix: 'packages/contracts/', turboFilter: '@repo/contracts' },
  { pathPrefix: 'packages/utils/', turboFilter: '@repo/utils' },
  { pathPrefix: 'packages/constants/', turboFilter: '@repo/constants' },
  { pathPrefix: 'packages/config/', turboFilter: '@repo/config' },
  {
    pathPrefix: 'packages/contracts-artifacts/',
    turboFilter: '@vechain/stargate-contracts-artifacts'
  }
];

const commandsForFilter = (filter) => [
  `yarn format -- --filter=${filter}`,
  `yarn lint -- --filter=${filter}`,
  `yarn ts-check -- --filter=${filter}`
];

const rootCommands = ['yarn format', 'yarn lint', 'yarn ts-check'];

module.exports = {
  '**/*.{ts,tsx,js,jsx,cts,mts,sol}': (files) => {
    const matchedFilters = new Set();
    let runRoot = false;

    files.forEach((file) => {
      const normalized = file.replace(/\\/g, '/');
      const match = workspaceFilters.find(({ pathPrefix }) =>
        normalized.startsWith(pathPrefix)
      );

      if (match) {
        matchedFilters.add(match.turboFilter);
      } else {
        runRoot = true;
      }
    });

    const commands = [];
    matchedFilters.forEach((filter) => {
      commands.push(...commandsForFilter(filter));
    });

    if (runRoot) {
      commands.push(...rootCommands);
    }

    return commands;
  }
};

