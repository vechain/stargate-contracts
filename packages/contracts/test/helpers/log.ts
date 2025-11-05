const ENABLE_LOGS = process.env.TEST_LOGS === "1";

export function log(...args: any[]) {
    if (ENABLE_LOGS) {
        console.log(...args);
    }
}
