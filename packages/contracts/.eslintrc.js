/** @type {import("eslint").Linter.Config} */
module.exports = {
    root: true,
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
    plugins: ["@typescript-eslint"],
    env: {
        node: true,
        mocha: true,
    },
    parserOptions: {
        project: true,
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
    rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "no-unexpected-multiline": "off",
        "@typescript-eslint/no-unused-vars": "error",
        "prefer-const": "off",
    },
};
