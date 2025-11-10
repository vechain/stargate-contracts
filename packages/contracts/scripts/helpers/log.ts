export function log(...args: any[]) {
    const verbose = process.env.VERBOSE === "true";
    if (verbose) {
        console.log(...args);
    }
}
