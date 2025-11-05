/** @type {import("eslint").Linter.Config} */
module.exports = {
    root: true,
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
    plugins: ["@typescript-eslint", "only-warn"],
    env: {
        node: true,
        mocha: true,
    },
    settings: {
        "import/resolver": {
            typescript: {
                project: "tsconfig.json",
            },
        },
    },
    ignorePatterns: [
        // Ignore dotfiles
        ".*.js",
        "node_modules/",
        "dist/",
        ".turbo/",
        "cache/",
        "artifacts/",
        "deploy_output/",
        "node_modules/",
        "typechain-types/",
        "coverage/",
        "coverage.json",
        "docs/",
        "scripts/data_exports/data/",
        "metadata/",
        "temp-verify-*",
        "scripts/deploy/july_1st/",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: "tsconfig.json",
    },
};
